import base64
import copy
import os
import unittest
from unittest.mock import patch

from deploy import Deployment, LockLost, clean_resource, newer_build, secret_values, validate_secret


class DeploymentTests(unittest.TestCase):
    def test_newer_builds_only_supersede_same_trigger(self):
        current = {'buildTriggerId': 'main', 'createTime': '2026-11-16T10:00:00Z'}
        self.assertFalse(newer_build(current, [{'buildTriggerId': 'pr', 'createTime': '2026-11-16T11:00:00Z'}]))
        self.assertFalse(newer_build(current, [{'buildTriggerId': 'main', 'createTime': '2026-11-16T09:00:00Z'}]))
        self.assertTrue(newer_build(current, [{'buildTriggerId': 'main', 'createTime': '2026-11-16T11:00:00Z', 'status': 'WORKING'}]))
        self.assertTrue(newer_build(current, [{'buildTriggerId': 'main', 'createTime': '2026-11-16T10:00:00.100Z'}]))

    def test_snapshot_drops_server_fields_without_changing_original(self):
        original = {'metadata': {'name': 'web', 'resourceVersion': '1', 'uid': 'abc', 'annotations': {
            'kubectl.kubernetes.io/last-applied-configuration': 'sensitive', 'keep': 'yes'}}, 'status': {}, 'spec': {'replicas': 2}}
        before = copy.deepcopy(original)
        result = clean_resource(original)
        self.assertEqual(original, before)
        self.assertNotIn('status', result)
        self.assertEqual(result['metadata'], {'name': 'web', 'annotations': {'keep': 'yes'}})

    def test_secret_decoding_and_validation(self):
        self.assertEqual(secret_values({'data': {'KEY': base64.b64encode(b'value').decode()}}), {'KEY': 'value'})
        with patch.dict(os.environ, {'PROJECT_ID': 'vendor-project'}):
            values = {key: 'value' for key in ['DATABASE_URL', 'REDIS_URL', 'APP_URL', 'BETTER_AUTH_SECRET', 'PII_KEY',
                'GEMINI_MODEL']}
            values.update(DOCUMENT_SERVICE_TOKEN='x' * 32, GOOGLE_CLOUD_PROJECT='vendor-project')
            validate_secret(values)
            values['DOCUMENT_SERVICE_URL'] = 'https://external.example'
            with self.assertRaises(RuntimeError):
                validate_secret(values)
            values.pop('DOCUMENT_SERVICE_URL')
            values['DOCUMENT_SERVICE_TOKEN'] = 'short'
            with self.assertRaises(RuntimeError):
                validate_secret(values)

    def test_lost_lock_prevents_new_commands(self):
        with patch.dict(os.environ, {'PROJECT_ID': 'p', '_REGION': 'r', 'BUILD_ID': 'b', 'COMMIT_SHA': 's'}):
            deployment = Deployment()
            deployment.lost.set()
            with self.assertRaises(LockLost):
                deployment.run(['must-never-execute'])

    def test_migration_failure_stops_rollout_and_restores_configuration(self):
        class Fake(Deployment):
            def __init__(self):
                self.project, self.region, self.sha = 'p', 'r', 'sha'
                self.calls = []
            def acquire(self): self.calls.append('acquire')
            def release(self): self.calls.append('release')
            def superseded(self): return False
            def get(self, kind, name, private=False):
                if kind == 'secret': return {'metadata': {'name': name}, 'data': {}}
                return {'metadata': {'name': name}, 'spec': {'template': {}}}
            def run(self, command, **kwargs):
                self.calls.append(command[:2])
                return (0, b'[{"revision":2}]' if command[0] == 'helm' else b'{}')
            def kube(self, *args, **kwargs): self.calls.append(args[:2]); return (0, b'')
            def migrate(self, image): self.calls.append('migration'); raise RuntimeError('migration failed')
            def rollout(self): self.calls.append('restored-ready')
        deployment = Fake()
        with patch('deploy.Path.read_text', return_value='r-docker.pkg.dev/p/vendor-onboarding/app@sha256:abc'), patch('deploy.validate_secret'):
            with self.assertRaises(RuntimeError): deployment.deploy()
        self.assertIn('migration', deployment.calls)
        self.assertIn('restored-ready', deployment.calls)
        self.assertNotIn(['helm', 'upgrade'], deployment.calls)
        self.assertEqual(deployment.calls[-1], 'release')

    def test_superseded_build_does_not_read_production_secrets(self):
        with patch.dict(os.environ, {'PROJECT_ID': 'p', '_REGION': 'r', 'BUILD_ID': 'b', 'COMMIT_SHA': 's'}):
            deployment = Deployment()
        with patch('deploy.Path.read_text', return_value='r-docker.pkg.dev/p/vendor-onboarding/app@sha256:abc'), \
                patch.object(deployment, 'acquire'), patch.object(deployment, 'release') as release, \
                patch.object(deployment, 'superseded', return_value=True), patch.object(deployment, 'get') as get:
            deployment.deploy()
            get.assert_not_called()
            release.assert_called_once()

    def test_failed_helm_and_failed_smoke_restore_exact_pod_templates(self):
        for failure in ('upgrade', 'smoke'):
            with self.subTest(failure=failure):
                with patch.dict(os.environ, {'PROJECT_ID': 'p', '_REGION': 'r', 'BUILD_ID': 'b', 'COMMIT_SHA': 's'}):
                    deployment = Deployment()
                calls = []
                baseline = {'metadata': {'name': 'web'}, 'spec': {'template': {'metadata': {'annotations': {'old': 'yes'}}}}}
                def run(command, **kwargs):
                    calls.append(command[:2])
                    if command[:2] == ['helm', 'upgrade'] and failure == 'upgrade':
                        raise RuntimeError('unhealthy rollout')
                    return (0, b'[{"revision":2}]' if command[:2] == ['helm', 'history'] else b'{}')
                with patch('deploy.Path.read_text', return_value='r-docker.pkg.dev/p/vendor-onboarding/app@sha256:abc'), \
                        patch('deploy.validate_secret'), patch.object(deployment, 'acquire'), patch.object(deployment, 'release'), \
                        patch.object(deployment, 'superseded', return_value=False), patch.object(deployment, 'get', return_value=baseline), \
                        patch.object(deployment, 'run', side_effect=run), patch.object(deployment, 'migrate'), \
                        patch.object(deployment, 'rollout') as rollout, patch.object(deployment, 'kube') as kube, \
                        patch.object(deployment, 'smoke', side_effect=RuntimeError('smoke failed')):
                    with self.assertRaises(RuntimeError): deployment.deploy()
                    self.assertIn(['helm', 'rollback'], calls)
                    patches = [call for call in kube.call_args_list if call.args and call.args[0] == 'patch']
                    self.assertEqual(len(patches), 2)
                    for call in patches:
                        self.assertIn('--type=json', call.args)
                        self.assertEqual(call.kwargs['payload'][0]['value'], baseline['spec'])
                    self.assertGreaterEqual(rollout.call_count, 1)


if __name__ == '__main__':
    unittest.main()
