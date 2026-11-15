#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys


class SecretSync:
    REQUIRED = frozenset({
        "APP_URL", "BETTER_AUTH_SECRET", "BOOTSTRAP_ADMIN_EMAIL", "DATABASE_POOL_SIZE",
        "DATABASE_URL", "DEMO_AUTH", "DEMO_SCREENING", "EMAIL_FROM", "GCS_CLEAN_BUCKET",
        "GCS_QUARANTINE_BUCKET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "PII_KEY",
        "REDIS_URL", "RESEND_API_KEY", "SCREENING_TOKEN", "SCREENING_URL",
    })
    VALID_KEY = re.compile(r"^[A-Z][A-Z0-9_]*$")

    @staticmethod
    def run(project: str, namespace: str) -> None:
        payload = subprocess.run(
            ["gcloud", "secrets", "versions", "access", "latest", "--secret=vendor-app-config", f"--project={project}"],
            check=True, stdout=subprocess.PIPE,
        ).stdout
        values = json.loads(payload)
        if not isinstance(values, dict) or SecretSync.REQUIRED - values.keys():
            raise ValueError("Secret must be a JSON object containing all required environment variables")
        for key, value in values.items():
            if not SecretSync.VALID_KEY.fullmatch(key) or not isinstance(value, str) or "\n" in value or "\r" in value or "\x00" in value:
                raise ValueError(f"Invalid environment variable or value: {key}")
        secret = {
            "apiVersion": "v1", "kind": "Secret", "metadata": {"name": "vendor-onboarding", "namespace": namespace},
            "stringData": values, "type": "Opaque",
        }
        subprocess.run(["kubectl", "apply", "-f", "-"], input=json.dumps(secret).encode(), check=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sync application configuration from Secret Manager to Kubernetes")
    parser.add_argument("--project", required=True)
    parser.add_argument("--namespace", default="vendor-onboarding")
    args = parser.parse_args()
    try:
        SecretSync.run(args.project, args.namespace)
    except (ValueError, json.JSONDecodeError, subprocess.CalledProcessError) as error:
        print(f"Secret synchronization failed: {error}", file=sys.stderr)
        sys.exit(1)
