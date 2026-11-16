#!/usr/bin/env bash
set -euo pipefail
# Pin Helm 3: its rollback/wait flags differ from Helm 4.
curl --fail --silent --show-error --location https://get.helm.sh/helm-v3.17.3-linux-amd64.tar.gz -o /tmp/helm-v3.17.3-linux-amd64.tar.gz
curl --fail --silent --show-error --location https://get.helm.sh/helm-v3.17.3-linux-amd64.tar.gz.sha256sum -o /tmp/helm.sha256sum
(cd /tmp && sha256sum --check helm.sha256sum)
tar -xzf /tmp/helm-v3.17.3-linux-amd64.tar.gz -C /tmp
export PATH="/tmp/linux-amd64:$PATH" USE_GKE_GCLOUD_AUTH_PLUGIN=True
helm version --short
if [ "${_DEPLOY}" != true ]; then
  echo 'Validation completed; deployment disabled for this trigger.'
  exit 0
fi
test "${BRANCH_NAME}" = main
gcloud container clusters get-credentials "${_CLUSTER}" --zone "${_ZONE}" --project "${_CLUSTER_PROJECT}"
python3 scripts/ci/deploy.py
