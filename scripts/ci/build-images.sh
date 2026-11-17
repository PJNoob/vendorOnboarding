#!/usr/bin/env bash
set -euo pipefail
export DOCKER_BUILDKIT=1
tag="${COMMIT_SHA:-local}-${BUILD_ID:-check}"
registry="${_REGION}-docker.pkg.dev/${PROJECT_ID}/vendor-onboarding"
# The :cache tags hold the layers of the last deployed build; validation builds only read them.
docker pull "$registry/vendor-onboarding:cache" || true
docker pull "$registry/document-verification:cache" || true
docker build -f infra/docker/builder/Dockerfile -t "$registry/vendor-onboarding:$tag" \
  --cache-from "$registry/vendor-onboarding:cache" --build-arg BUILDKIT_INLINE_CACHE=1 --build-arg "SIGNATURE_DATE=$(date +%F)" .
docker build -f services/document-verification/Dockerfile -t "$registry/document-verification:$tag" \
  --cache-from "$registry/document-verification:cache" --build-arg BUILDKIT_INLINE_CACHE=1 services/document-verification
source scripts/ci/test-env.sh
export GOOGLE_CLIENT_ID=123456789-ci.apps.googleusercontent.com GOOGLE_CLIENT_SECRET=ci-oauth-client-secret-000000000000
test_env=()
for key in APP_URL BETTER_AUTH_SECRET BOOTSTRAP_ADMIN_EMAIL DATABASE_POOL_SIZE DATABASE_URL DEMO_SCREENING EMAIL_FROM GCS_CLEAN_BUCKET GCS_QUARANTINE_BUCKET PII_KEY REDIS_URL RESEND_API_KEY SCREENING_TOKEN SCREENING_URL DOCUMENT_SERVICE_TOKEN MAIL_PROVIDER GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET; do
  test_env+=(--env "$key")
done
trap 'docker rm -f ci-web >/dev/null 2>&1 || true' EXIT
docker run -d --network=cloudbuild --name=ci-web "${test_env[@]}" --env DEMO_AUTH=false "$registry/vendor-onboarding:$tag"
healthy=false
for attempt in {1..60}; do
  if docker exec ci-web node -e "fetch('http://127.0.0.1:3000/api/health/ready',{signal:AbortSignal.timeout(2000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    healthy=true
    break
  fi
  sleep 2
done
if [ "$healthy" != true ]; then docker logs --tail 100 ci-web; exit 1; fi
if [ "${_DEPLOY}" = true ]; then
  docker push "$registry/vendor-onboarding:$tag"
  docker push "$registry/document-verification:$tag"
  docker inspect --format '{{index .RepoDigests 0}}' "$registry/vendor-onboarding:$tag" > /workspace/app-image.txt
  docker inspect --format '{{index .RepoDigests 0}}' "$registry/document-verification:$tag" > /workspace/document-image.txt
  for image in vendor-onboarding document-verification; do
    docker tag "$registry/$image:$tag" "$registry/$image:cache"
    docker push "$registry/$image:cache"
  done
fi
