#!/usr/bin/env bash
# Runs inside the deploy-tools image (infra/docker/deploy/Dockerfile), which provides Helm 3, kubectl and gcloud.
set -euo pipefail
helm version --short
if [ "${_DEPLOY}" != true ]; then
  echo 'Validation completed; deployment disabled for this trigger.'
  exit 0
fi
test "${BRANCH_NAME}" = main
gcloud container clusters get-credentials "${_CLUSTER}" --zone "${_ZONE}" --project "${_CLUSTER_PROJECT}"
python3 scripts/ci/deploy.py
