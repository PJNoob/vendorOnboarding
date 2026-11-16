"""Idempotent operator bootstrap, never invoked by the application build."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time

PROJECT = 'vendor-onboarding-514819'
REGION = 'asia-south1'
HOST = 'voice-agent-yojnapath'
NAMESPACE = 'vendor-onboarding'
CONNECTION = 'vendor-github'
REPOSITORY = 'vendor-onboarding'
GCLOUD = os.environ.get('GCLOUD', 'gcloud')


def run(*args, payload=None, optional=False):
    result = subprocess.run(args, input=json.dumps(payload).encode() if payload else None,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode and not optional:
        print(result.stderr.decode(errors='replace'))
        raise SystemExit(f'{args[0]} {args[1]} failed')
    return result


def cloud(*args, optional=False):
    return run(GCLOUD, *args, f'--project={PROJECT}', '--quiet', '--format=json', optional=optional)


def grant(account, role, host=False):
    project = HOST if host else PROJECT
    for attempt in range(6):
        result = run(GCLOUD, 'projects', 'add-iam-policy-binding', project,
            f'--member=serviceAccount:{account}', f'--role={role}', '--condition=None', '--quiet', '--format=none', optional=True)
        if not result.returncode:
            return
        if b'does not exist' not in result.stderr or attempt == 5:
            raise SystemExit(result.stderr.decode(errors='replace'))
        time.sleep(5)


def identities():
    source_bucket = f'gs://{PROJECT}_cloudbuild'
    if cloud('storage', 'buckets', 'describe', source_bucket, optional=True).returncode:
        cloud('storage', 'buckets', 'create', source_bucket, f'--location={REGION}', '--uniform-bucket-level-access')
    for name in ('vendor-ci', 'vendor-deployer'):
        email = f'{name}@{PROJECT}.iam.gserviceaccount.com'
        if cloud('iam', 'service-accounts', 'describe', email, optional=True).returncode:
            cloud('iam', 'service-accounts', 'create', name, f'--display-name={name}')
        for role in ('roles/logging.logWriter', 'roles/serviceusage.serviceUsageConsumer'):
            grant(email, role)
        cloud('storage', 'buckets', 'add-iam-policy-binding', source_bucket,
              f'--member=serviceAccount:{email}', '--role=roles/storage.objectViewer', '--condition=None')
    deployer = f'vendor-deployer@{PROJECT}.iam.gserviceaccount.com'
    grant(deployer, 'roles/cloudbuild.builds.viewer')
    grant(deployer, 'roles/container.clusterViewer', host=True)
    cloud('artifacts', 'repositories', 'add-iam-policy-binding', REPOSITORY, f'--location={REGION}',
          f'--member=serviceAccount:{deployer}', '--role=roles/artifactregistry.writer', '--condition=None')
    cloud('secrets', 'add-iam-policy-binding', 'vendor-app-config', f'--member=serviceAccount:{deployer}',
          '--role=roles/secretmanager.secretAccessor', '--condition=None')
    role = {'apiVersion': 'rbac.authorization.k8s.io/v1', 'kind': 'Role',
            'metadata': {'name': 'vendor-deployer', 'namespace': NAMESPACE}, 'rules': [
                {'apiGroups': ['apps'], 'resources': ['deployments'], 'verbs': ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete']},
                {'apiGroups': [''], 'resources': ['secrets', 'configmaps', 'services', 'serviceaccounts'], 'verbs': ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete']},
                {'apiGroups': [''], 'resources': ['pods', 'events'], 'verbs': ['get', 'list', 'watch']},
                {'apiGroups': [''], 'resources': ['pods/exec'], 'verbs': ['get', 'create']},
                {'apiGroups': ['batch'], 'resources': ['jobs'], 'verbs': ['get', 'list', 'watch', 'create', 'delete']},
                {'apiGroups': ['coordination.k8s.io'], 'resources': ['leases'], 'verbs': ['get', 'create', 'update', 'patch']},
            ]}
    binding = {'apiVersion': 'rbac.authorization.k8s.io/v1', 'kind': 'RoleBinding',
               'metadata': {'name': 'vendor-deployer', 'namespace': NAMESPACE},
               'roleRef': {'apiGroup': 'rbac.authorization.k8s.io', 'kind': 'Role', 'name': 'vendor-deployer'},
               'subjects': [{'apiGroup': 'rbac.authorization.k8s.io', 'kind': 'User', 'name': deployer}]}
    run('kubectl', 'apply', '-f', '-', payload={'apiVersion': 'v1', 'kind': 'List', 'items': [role, binding]})
    print('Configured isolated CI and namespace-scoped deployment identities')


def triggers():
    state = json.loads(cloud('builds', 'connections', 'describe', CONNECTION, f'--region={REGION}').stdout)
    if state.get('installationState', {}).get('stage') != 'COMPLETE':
        raise SystemExit('GitHub connection requires authorization: ' + state.get('installationState', {}).get('actionUri', ''))
    resource = f'projects/{PROJECT}/locations/{REGION}/connections/{CONNECTION}/repositories/{REPOSITORY}'
    if cloud('builds', 'repositories', 'describe', REPOSITORY, f'--connection={CONNECTION}',
             f'--region={REGION}', optional=True).returncode:
        cloud('builds', 'repositories', 'create', REPOSITORY, f'--connection={CONNECTION}',
              f'--region={REGION}', '--remote-uri=https://github.com/PJNoob/vendorOnboarding.git')
    existing = json.loads(cloud('builds', 'triggers', 'list', f'--region={REGION}').stdout)
    for name, deploy in [('vendor-main-deploy', True), ('vendor-pr-checks', False)]:
        identity = 'vendor-deployer' if deploy else 'vendor-ci'
        config = {'name': name, 'description': 'Checked automatic main deployment' if deploy else 'Isolated pull request checks',
                  'filename': 'cloudbuild.yaml', 'includedFiles': [],
                  'serviceAccount': f'projects/{PROJECT}/serviceAccounts/{identity}@{PROJECT}.iam.gserviceaccount.com',
                  'substitutions': {'_DEPLOY': 'true' if deploy else 'false'},
                  'repositoryEventConfig': {'repository': resource,
                      ('push' if deploy else 'pullRequest'): ({'branch': '^main$'} if deploy else {
                          'branch': '^main$', 'commentControl': 'COMMENTS_ENABLED_FOR_EXTERNAL_CONTRIBUTORS_ONLY'})}}
        previous = next((t for t in existing if t['name'] == name), None)
        if previous:
            config['id'] = previous['id']
        with tempfile.TemporaryDirectory() as directory:
            filename = Path(directory) / 'trigger.json'
            filename.write_text(json.dumps(config))
            cloud('builds', 'triggers', 'import', f'--region={REGION}', f'--source={filename}')
        print(f'Configured {name}')
    # The connection retains access to its own credential secret after bootstrap.
    agent = 'serviceAccount:service-533980571923@gcp-sa-cloudbuild.iam.gserviceaccount.com'
    policy = json.loads(cloud('projects', 'get-iam-policy', PROJECT).stdout)
    for binding in policy.get('bindings', []):
        if binding['role'] != 'roles/secretmanager.admin' or agent not in binding.get('members', []):
            continue
        condition = binding.get('condition')
        if condition and condition.get('title') != 'vendor-github-bootstrap':
            continue
        flag = '--condition=None' if not condition else '--condition=title=' + condition['title'] + ',expression=' + condition['expression']
        cloud('projects', 'remove-iam-policy-binding', PROJECT,
              f'--member={agent}', '--role=roles/secretmanager.admin', flag)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('stage', choices=['identities', 'triggers'])
    args = parser.parse_args()
    identities() if args.stage == 'identities' else triggers()
