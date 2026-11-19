"""Run database-grant Terraform through the existing authenticated GKE proxy."""

import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
from urllib.parse import unquote, urlsplit


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in {'plan', 'apply', 'show'}:
        raise SystemExit('Usage: database-access.py {plan|apply|show} [Terraform arguments]')
    module = Path(__file__).resolve().parents[2] / 'infra/terraform/database-access'
    # Capture the secret without writing it to disk or including it in arguments.
    result = subprocess.run([
        'gcloud', 'secrets', 'versions', 'access', 'latest',
        '--secret=vendor-app-config', '--project=vendor-onboarding-514819',
    ], capture_output=True, check=True, text=True)
    url = urlsplit(json.loads(result.stdout)['DATABASE_URL'])
    if url.path != '/vendor_onboarding' or unquote(url.username or '') != 'vendor_app':
        raise SystemExit('Unexpected database or grant administrator in application config')
    environment = os.environ.copy()
    environment['PGUSER'] = unquote(url.username)
    environment['PGPASSWORD'] = unquote(url.password or '')
    with socket.socket() as probe:
        if probe.connect_ex(('127.0.0.1', 15432)) == 0:
            raise SystemExit('Local port 15432 is already in use; close the existing tunnel first')
    tunnel = subprocess.Popen([
        'kubectl', '--context=gke_voice-agent-yojnapath_asia-south1-a_yojnapath-dev-gke',
        '-n', 'vendor-onboarding', 'port-forward', '--address=127.0.0.1',
        'deployment/vendor-onboarding-web', '15432:5432',
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            if tunnel.poll() is not None:
                raise SystemExit('Database proxy tunnel failed to start')
            with socket.socket() as probe:
                if probe.connect_ex(('127.0.0.1', 15432)) == 0:
                    break
            time.sleep(0.2)
        else:
            raise SystemExit('Database proxy tunnel timed out')
        return subprocess.run([
            'terraform', f'-chdir={module}', *sys.argv[1:],
        ], env=environment).returncode
    finally:
        tunnel.terminate()
        try:
            tunnel.wait(timeout=5)
        except subprocess.TimeoutExpired:
            tunnel.kill()
            tunnel.wait()


if __name__ == '__main__':
    try:
        sys.exit(main())
    except subprocess.CalledProcessError:
        raise SystemExit('Unable to read application credentials; check gcloud access') from None
