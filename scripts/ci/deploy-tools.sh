#!/usr/bin/env bash
# Builds (once per Dockerfile revision) and runs the prebuilt image that carries kubectl, Helm and gcloud.
set -euo pipefail
if [ "${_DEPLOY}" != true ]; then
  echo 'Validation completed; deployment disabled for this trigger.'
  exit 0
fi
image="${_REGION}-docker.pkg.dev/${PROJECT_ID}/vendor-onboarding/deploy-tools:$(sha256sum infra/docker/deploy/Dockerfile | cut -c1-12)"
case "${1:-}" in
  build)
    if docker manifest inspect "$image" >/dev/null 2>&1; then
      echo "Deploy image already published: $image"
    else
      docker build -f infra/docker/deploy/Dockerfile -t "$image" infra/docker/deploy
      docker push "$image"
    fi
    ;;
  run)
    env_args=()
    for key in PROJECT_ID BUILD_ID COMMIT_SHA BRANCH_NAME _DEPLOY _REGION _CLUSTER_PROJECT _CLUSTER _ZONE; do
      env_args+=(--env "$key")
    done
    docker run --rm --network=cloudbuild --volume /workspace:/workspace --workdir /workspace "${env_args[@]}" "$image" bash scripts/ci/deploy.sh
    ;;
  *)
    echo 'usage: deploy-tools.sh build|run' >&2
    exit 2
    ;;
esac
