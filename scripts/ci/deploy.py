"""Serialized, health-gated deployment. Secret material stays in process memory."""
import base64
import copy
import datetime as dt
import json
import os
from pathlib import Path
import signal
import subprocess
import threading
import time

NAMESPACE = 'vendor-onboarding'
RELEASE = 'vendor-onboarding'
LEASE = 'vendor-onboarding-deployment'
TTL = 90
TERMINAL = {'SUCCESS', 'FAILURE', 'INTERNAL_ERROR', 'TIMEOUT', 'CANCELLED', 'EXPIRED'}


class LockLost(RuntimeError):
    pass


def newer_build(current, candidates):
    def timestamp(value):
        return dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    return any(b.get('buildTriggerId') == current.get('buildTriggerId')
               and timestamp(b['createTime']) > timestamp(current['createTime']) for b in candidates)


def clean_resource(resource):
    resource = copy.deepcopy(resource)
    resource.pop('status', None)
    resource['metadata'] = {k: v for k, v in resource['metadata'].items()
                            if k in {'name', 'namespace', 'labels', 'annotations'}}
    # These fields describe the current API object, not the desired configuration.
    resource['metadata'].get('annotations', {}).pop('kubectl.kubernetes.io/last-applied-configuration', None)
    return resource


def secret_values(resource):
    values = {k: base64.b64decode(v).decode() for k, v in resource.get('data', {}).items()}
    return {**values, **resource.get('stringData', {})}


def validate_secret(values):
    required = {'DATABASE_URL', 'REDIS_URL', 'APP_URL', 'BETTER_AUTH_SECRET', 'PII_KEY',
                'DOCUMENT_SERVICE_TOKEN', 'GOOGLE_CLOUD_PROJECT', 'DOCUMENT_AI_LOCATION',
                'DOCUMENT_AI_PROCESSOR_ID', 'GEMINI_MODEL'}
    if required - values.keys() or any(not isinstance(v, str) or '\x00' in v for v in values.values()):
        raise RuntimeError('Production configuration is missing required string settings')
    if len(values['DOCUMENT_SERVICE_TOKEN']) < 32:
        raise RuntimeError('Document service token is too short')
    if values.get('DOCUMENT_SERVICE_URL', 'http://127.0.0.1:8080').rstrip('/') != 'http://127.0.0.1:8080':
        raise RuntimeError('Production document service must use the pod-local sidecar')
    if values['GOOGLE_CLOUD_PROJECT'] != os.environ['PROJECT_ID']:
        raise RuntimeError('Document service project does not match the deployment project')


class Deployment:
    def __init__(self):
        self.project = os.environ['PROJECT_ID']
        self.region = os.environ['_REGION']
        self.build_id = os.environ['BUILD_ID']
        self.sha = os.environ['COMMIT_SHA']
        self.stop = threading.Event()
        self.lost = threading.Event()
        self.thread = None

    def run(self, command, payload=None, private=False, allow_failure=False):
        if self.lost.is_set():
            raise LockLost('Deployment lock lost')
        data = json.dumps(payload).encode() if payload is not None else None
        proc = subprocess.Popen(command, stdin=subprocess.PIPE if data else subprocess.DEVNULL,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
        started = time.monotonic()
        while True:
            try:
                stdout, stderr = proc.communicate(input=data, timeout=5)
                break
            except subprocess.TimeoutExpired:
                data = None
                if self.lost.is_set() or time.monotonic() - started > 1500:
                    os.killpg(proc.pid, signal.SIGKILL)
                    proc.communicate()
                    raise LockLost('Deployment stopped after lock loss or command timeout')
        if self.lost.is_set():
            raise LockLost('Deployment lock lost')
        if proc.returncode and not allow_failure:
            if not private:
                print(stderr.decode(errors='replace')[-6000:], flush=True)
            raise RuntimeError(f'{command[0]} {command[1]} failed (exit {proc.returncode})')
        return proc.returncode, stdout

    def kube(self, *args, payload=None, private=False, allow_failure=False):
        return self.run(['kubectl', '--request-timeout=45s', '-n', NAMESPACE, *args],
                        payload=payload, private=private, allow_failure=allow_failure)

    def get(self, kind, name, private=False):
        return json.loads(self.kube('get', kind, name, '-o', 'json', private=private)[1])

    def cloud(self, *args):
        return json.loads(self.run(['gcloud', 'builds', *args, f'--project={self.project}',
                                    f'--region={self.region}', '--format=json', '--quiet'])[1])

    def superseded(self):
        current = self.cloud('describe', self.build_id)
        if not current.get('buildTriggerId') or current.get('substitutions', {}).get('BRANCH_NAME') != 'main':
            raise RuntimeError('Only the main branch trigger can deploy')
        candidates = self.cloud('list', f'--filter=buildTriggerId={current["buildTriggerId"]}',
                                '--sort-by=~createTime', '--limit=100')
        return newer_build(current, candidates)

    def lease_object(self):
        raw = self.kube('get', 'lease', LEASE, '--ignore-not-found', '-o', 'json')[1]
        return json.loads(raw) if raw.strip() else None

    def save_lease(self, obj, create=False):
        return self.kube('create' if create else 'replace', '-f', '-', payload=obj, allow_failure=True)[0] == 0

    def acquire(self):
        deadline = time.monotonic() + 1200
        while time.monotonic() < deadline:
            obj = self.lease_object()
            now = dt.datetime.now(dt.timezone.utc)
            if obj is None:
                obj = {'apiVersion': 'coordination.k8s.io/v1', 'kind': 'Lease',
                       'metadata': {'name': LEASE, 'namespace': NAMESPACE}, 'spec': {}}
                available, create = True, True
            else:
                create = False
                spec = obj.get('spec', {})
                holder = spec.get('holderIdentity')
                renewed = dt.datetime.fromisoformat(spec.get('renewTime', '1970-01-01T00:00:00Z').replace('Z', '+00:00'))
                available = not holder
                if holder and (now - renewed).total_seconds() > TTL:
                    # Never steal a lease from a still-running Cloud Build, even if its heartbeat failed.
                    available = self.cloud('describe', holder).get('status') in TERMINAL
            if available:
                obj['spec'] = {'holderIdentity': self.build_id, 'leaseDurationSeconds': TTL,
                               'renewTime': now.isoformat()}
                if self.save_lease(obj, create):
                    self.thread = threading.Thread(target=self.heartbeat, daemon=True)
                    self.thread.start()
                    return
            print('Waiting for the active deployment to finish', flush=True)
            time.sleep(10)
        raise RuntimeError('Timed out waiting for deployment lock')

    def heartbeat(self):
        while not self.stop.wait(15):
            try:
                obj = self.lease_object()
                if obj is None or obj['spec'].get('holderIdentity') != self.build_id:
                    raise LockLost('Lease owner changed')
                obj['spec']['renewTime'] = dt.datetime.now(dt.timezone.utc).isoformat()
                if not self.save_lease(obj):
                    raise LockLost('Lease renewal failed')
            except Exception:
                self.lost.set()
                return

    def release(self):
        self.stop.set()
        if self.thread:
            self.thread.join(timeout=50)
        if not self.lost.is_set():
            obj = self.lease_object()
            if obj and obj['spec'].get('holderIdentity') == self.build_id:
                obj['spec']['holderIdentity'] = ''
                self.save_lease(obj)

    def migrate(self, image):
        # Native Kubernetes sidecar exits automatically after the migration command.
        template = self.get('deployment', f'{RELEASE}-web')['spec']['template']
        spec = template['spec']
        proxy = copy.deepcopy(next(c for c in spec['containers'] if c['name'] == 'cloud-sql-proxy'))
        proxy['restartPolicy'] = 'Always'
        proxy['args'] += ['--health-check', '--http-address=0.0.0.0', '--http-port=9090', '--run-connection-test']
        proxy['startupProbe'] = {'httpGet': {'path': '/startup', 'port': 9090}, 'periodSeconds': 2, 'failureThreshold': 60}
        name = f'vendor-migrate-{self.build_id[:12]}'
        job = {'apiVersion': 'batch/v1', 'kind': 'Job', 'metadata': {'name': name, 'namespace': NAMESPACE},
               'spec': {'backoffLimit': 0, 'activeDeadlineSeconds': 600, 'ttlSecondsAfterFinished': 86400,
                        'template': {'metadata': {'labels': {'app.kubernetes.io/component': 'migration'}}, 'spec': {
                            'restartPolicy': 'Never', 'serviceAccountName': spec['serviceAccountName'],
                            'securityContext': spec.get('securityContext', {}),
                            'nodeSelector': spec.get('nodeSelector', {}), 'tolerations': spec.get('tolerations', []),
                            'initContainers': [proxy], 'containers': [{
                                'name': 'migrate', 'image': image,
                                'command': ['pnpm', '--filter', '@neo/prisma', 'migrate:deploy'],
                                'envFrom': [{'secretRef': {'name': RELEASE}}],
                                'resources': {'requests': {'cpu': '100m', 'memory': '256Mi'}, 'limits': {'cpu': '1', 'memory': '1Gi'}},
                                'securityContext': {'runAsUser': 1000, 'allowPrivilegeEscalation': False},
                            }]}}}}
        self.kube('create', '-f', '-', payload=job)
        deadline = time.monotonic() + 660
        while time.monotonic() < deadline:
            status = self.get('job', name).get('status', {})
            if status.get('succeeded'):
                return
            if status.get('failed') or any(c['type'] == 'Failed' and c['status'] == 'True' for c in status.get('conditions', [])):
                raise RuntimeError('Database migration failed; inspect the migration Job')
            time.sleep(5)
        raise RuntimeError('Database migration timed out')

    def rollout(self):
        for role in ('web', 'worker'):
            self.kube('rollout', 'status', f'deployment/{RELEASE}-{role}', '--timeout=900s')

    def smoke(self):
        self.kube('exec', f'deployment/{RELEASE}-web', '-c', 'web', '--', 'node', '-e',
                  "fetch('http://127.0.0.1:3000/api/health/ready',{signal:AbortSignal.timeout(10000)}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))")
        self.kube('exec', f'deployment/{RELEASE}-worker', '-c', 'worker', '--', 'node', 'scripts/ci/runtime-health.mjs')

    def deploy(self):
        app = Path('/workspace/app-image.txt').read_text().strip()
        document = Path('/workspace/document-image.txt').read_text().strip()
        for image in (app, document):
            if '@sha256:' not in image or not image.startswith(f'{self.region}-docker.pkg.dev/{self.project}/vendor-onboarding/'):
                raise RuntimeError('Deployment requires immutable vendor image digests')
        self.acquire()
        try:
            if self.superseded():
                print('Superseded by a newer main commit; skipping deployment', flush=True)
                return
            snapshots = [clean_resource(self.get('deployment', f'{RELEASE}-{r}')) for r in ('web', 'worker')]
            previous_secret = clean_resource(self.get('secret', RELEASE, private=True))
            old_values = secret_values(previous_secret)
            _, raw = self.run(['gcloud', 'secrets', 'versions', 'access', 'latest', '--secret=vendor-app-config',
                               f'--project={self.project}'], private=True)
            values = json.loads(raw)
            validate_secret(values)
            # Database credentials, auth secrets and PII key rotate through a separate process.
            for key in ('DATABASE_URL', 'REDIS_URL', 'BETTER_AUTH_SECRET', 'PII_KEY'):
                if values.get(key) != old_values.get(key):
                    raise RuntimeError(f'{key} differs from the live configuration; reconcile its rotation before deploying')
            new_secret = {'apiVersion': 'v1', 'kind': 'Secret', 'metadata': {'name': RELEASE, 'namespace': NAMESPACE},
                          'type': 'Opaque', 'stringData': values}
            previous_revision = json.loads(self.run(['helm', 'history', RELEASE, '-n', NAMESPACE, '-o', 'json'])[1])[-1]['revision']
            changed, helm_started = False, False
            try:
                self.kube('apply', '-f', '-', payload=new_secret, private=True)
                changed = True
                self.migrate(app)
                helm_started = True
                self.run(['helm', 'upgrade', '--install', RELEASE, 'infra/helm/builder', '-n', NAMESPACE,
                          '-f', 'infra/helm/builder/values.production.yaml', '--set-string', f'image={app}',
                          '--set-string', f'documentService.image={document}', '--set-string', f'commitSha={self.sha}',
                          '--atomic', '--wait', '--timeout', '15m', '--history-max', '10'])
                self.rollout()
                self.smoke()
                for role in ('web', 'worker'):
                    deployed = self.get('deployment', f'{RELEASE}-{role}')
                    if deployed['spec']['template']['metadata']['annotations'].get('vendor-onboarding/commit') != self.sha:
                        raise RuntimeError('Deployed commit does not match checked source')
                print(f'Deployed and verified commit {self.sha}', flush=True)
            except LockLost:
                raise
            except Exception:
                if changed:
                    print('Restoring the previous application release; database migrations are retained', flush=True)
                    self.kube('apply', '-f', '-', payload=previous_secret, private=True)
                    if helm_started:
                        self.run(['helm', 'rollback', RELEASE, str(previous_revision), '-n', NAMESPACE,
                                  '--wait', '--timeout', '15m'], allow_failure=True)
                    # Live images may differ from Helm history. Restore the exact observed pod specs.
                    for snapshot in snapshots:
                        self.kube('patch', 'deployment', snapshot['metadata']['name'], '--type=json',
                                  '--patch-file=/dev/stdin', payload=[{'op': 'replace', 'path': '/spec', 'value': snapshot['spec']}])
                    self.rollout()
                    for snapshot in snapshots:
                        actual = self.get('deployment', snapshot['metadata']['name'])
                        if actual['spec']['template'] != snapshot['spec']['template']:
                            raise RuntimeError('Rollback verification failed')
                    print('Previous workloads restored and ready', flush=True)
                raise
        finally:
            self.release()


if __name__ == '__main__':
    try:
        Deployment().deploy()
    except Exception as error:
        # Do not include exception payloads from JSON or command input: they may contain secrets.
        detail = str(error) if isinstance(error, RuntimeError) else type(error).__name__
        print(f'Deployment failed: {detail}. Inspect stage messages and Kubernetes events.', flush=True)
        raise SystemExit(1)
