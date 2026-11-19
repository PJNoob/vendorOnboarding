# Vendor onboarding deployment

## Public endpoint on the existing cluster

Production Helm values enable `https://vendor-onboarding.demo.asymptotiq.com` on the existing `yojnapath-dev-gke` cluster. The GCE Ingress uses the reserved global address `yojnapath-dev-vendor-https` (`8.228.226.95`), pod NEGs, a BackendConfig checking `/api/health/ready` on port 3000, a Google-managed certificate and a configurable HTTP-to-HTTPS redirect. The redirect is temporarily disabled in production values while certificate issuance is being validated; re-enable `ingress.redirectToHttps` after HTTPS works. This endpoint change does not require applying the Terraform below.

In Cloudflare's `asymptotiq.com` zone, create an **A** record named **vendor-onboarding.demo** with content **8.228.226.95**, **DNS only** (grey cloud), and TTL **Auto**. Remove conflicting A/AAAA records for this hostname. Keep DNS only while using this Google-managed certificate; wait for the ManagedCertificate to report `Active` before testing HTTPS.

`APP_URL` must be `https://vendor-onboarding.demo.asymptotiq.com` in Secret Manager's `vendor-app-config` and the Kubernetes application Secret. The chart also sets this URL explicitly for web and worker containers when ingress is enabled, keeping generated links and trusted origins aligned with the hostname.

In the Google OAuth Web client, authorize JavaScript origin `https://vendor-onboarding.demo.asymptotiq.com` and redirect URI `https://vendor-onboarding.demo.asymptotiq.com/api/auth/callback/google`.

Check `kubectl -n vendor-onboarding get ingress,managedcertificate` and `kubectl -n vendor-onboarding get deployments`. Preserve the live immutable application and document-service image digests when upgrading Helm for ingress changes.

## Infrastructure bootstrap reference

The infrastructure is **not ready to apply**. Complete the gaps listed in `README.md`, then review a real Terraform plan. In particular, do not move the existing Yojnapath project or attach Shared VPC until the migration preflight and host/service-project IAM are reviewed. Project migration can change inherited policies and moving back to No organization requires Google Cloud support.

## 1. Prepare Terraform

Install Terraform, Helm, the Google Cloud CLI, `kubectl`, the GKE auth plugin, Docker and Node.js 22. Sign in with an identity allowed to create projects, attach billing, administer Shared VPC and provision resources. Use Application Default Credentials for Terraform.

```sh
gcloud auth login
gcloud auth application-default login
cd infra/terraform/vendor-onboarding
terraform init \
  -backend-config='bucket=voice-agent-yojnapath-yojnapath-terraform-state' \
  -backend-config='prefix=vendor-onboarding/app'
terraform validate
terraform plan -var='app_project_id=YOUR_UNIQUE_PROJECT_ID' -out=vendor.tfplan
```

The saved plan and Terraform state can contain secrets, including Redis AUTH information. Keep them in restricted storage and never commit them. The state bucket must have restricted IAM and versioning enabled before use. Check the plan carefully for changes to existing Yojnapath resources. After the outstanding work, preflight, project move and plan review are complete, apply the saved plan with `terraform apply vendor.tfplan`. Project creation, HA SQL, Redis, extra nodes and load balancing incur charges.

## Operator database login

Terraform enables `cloudsql.iam_authentication` and registers
`jaiswalpratham1234@gmail.com` as a `CLOUD_IAM_USER`, with the Cloud SQL Instance
User and Cloud SQL Studio User IAM roles. Sign in to Google Cloud with that
account, open Cloud SQL Studio, select `vendor_onboarding`, and choose IAM
database authentication. No database password is required for this login.

These IAM roles permit login; PostgreSQL schema and table privileges are managed
separately. If a query reports `permission denied`, a database administrator must
grant the required privileges to the quoted role `"jaiswalpratham1234@gmail.com"`.
The application continues to use its existing built-in database account.

## 2. Create the application secret

Terraform declares a Secret Manager secret named `vendor-app-config`; it does not create a secret version. After the app project exists, add a version in Google Cloud Console → Security → Secret Manager → `vendor-app-config` → **New version**. Paste one JSON object with the exact environment keys below. All values must be strings. The deploying identity needs `roles/secretmanager.secretAccessor` on this secret.

```json
{
  "APP_URL": "https://YOUR_DOMAIN",
  "BETTER_AUTH_SECRET": "YOUR_RANDOM_AUTH_SECRET_AT_LEAST_32_CHARACTERS",
  "BOOTSTRAP_ADMIN_EMAIL": "YOUR_ADMIN_EMAIL",
  "DATABASE_POOL_SIZE": "5",
  "DATABASE_URL": "postgresql://USER:URL_ENCODED_PASSWORD@127.0.0.1:5432/vendor_onboarding",
  "DEMO_AUTH": "false",
  "DEMO_SCREENING": "false",
  "EMAIL_FROM": "YOUR_VERIFIED_SENDER_EMAIL",
  "GCS_CLEAN_BUCKET": "YOUR_PROJECT_ID-vendor-clean",
  "GCS_QUARANTINE_BUCKET": "YOUR_PROJECT_ID-vendor-quarantine",
  "GOOGLE_CLIENT_ID": "YOUR_GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET": "YOUR_GOOGLE_OAUTH_CLIENT_SECRET",
  "PII_KEY": "YOUR_64_HEXADECIMAL_CHARACTER_KEY",
  "REDIS_URL": "rediss://default:URL_ENCODED_REDIS_AUTH@REDIS_HOST:6378",
  "RESEND_API_KEY": "YOUR_RESEND_API_KEY",
  "SCREENING_TOKEN": "YOUR_SCREENING_PROVIDER_TOKEN",
  "SCREENING_URL": "https://YOUR_SCREENING_PROVIDER_ENDPOINT"
}
```

Generate independent secrets with `openssl rand -hex 32` for `BETTER_AUTH_SECRET` and `PII_KEY`. Preserve the PII key safely: losing or changing it prevents decryption of existing data. Create the Cloud SQL application user separately through the approved bootstrap process; the Terraform currently does not provision one. Retrieve Redis AUTH and the server CA using an authorized operator after Redis is provisioned. URL-encode passwords before constructing connection URLs. Register `https://YOUR_DOMAIN/api/auth/callback/google` in the Google OAuth client, and authorize the Resend sender domain. For live screening, configure the provider described in `docs/operations.md`.

Secret Manager is the source of truth; the sync command below copies the latest JSON version into a Kubernetes Secret. It is not an automatic secret refresh. Kubernetes Secrets require appropriate cluster RBAC and encryption protections. After creating a new secret version, rerun the sync and restart the deployments to load the new environment values.

## 3. Build, configure and deploy

The following are the intended commands **after** the outstanding infrastructure and deployment prerequisites are complete. Replace placeholders; do not put secret values in shell arguments or Helm values.

```sh
export APP_PROJECT=YOUR_UNIQUE_PROJECT_ID
export APP_HOST=YOUR_DOMAIN
export IMAGE="asia-south1-docker.pkg.dev/$APP_PROJECT/vendor-onboarding/vendor-onboarding:YOUR_VERSION"
gcloud container clusters get-credentials yojnapath-dev-gke --zone=asia-south1-a --project=voice-agent-yojnapath
gcloud auth configure-docker asia-south1-docker.pkg.dev
kubectl create namespace vendor-onboarding --dry-run=client -o yaml | kubectl apply -f -
python3 scripts/sync-vendor-secret.py --project "$APP_PROJECT"
docker build -f infra/docker/builder/Dockerfile -t "$IMAGE" .
docker push "$IMAGE"
```

Create the `redis-ca` Kubernetes Secret with key `ca.pem` from the Redis server CA using a protected local file, then remove that local copy according to your organization's handling rules. Create the database user and run the Prisma migration and seed as authenticated jobs before enabling traffic; those jobs still need implementation and verification. Set `quarantine_upload_origins` to the exact application origin before planning the Terraform changes. For the existing production deployment, use `-var-file=production.tfvars`.

```sh
helm upgrade --install vendor-onboarding infra/helm/builder \
  --namespace vendor-onboarding \
  --set-string image="$IMAGE" \
  --set nodePool.enabled=true \
  --set workloadIdentity.enabled=true \
  --set-string workloadIdentity.webServiceAccount="vendor-onboarding-web@$APP_PROJECT.iam.gserviceaccount.com" \
  --set-string workloadIdentity.workerServiceAccount="vendor-onboarding-worker@$APP_PROJECT.iam.gserviceaccount.com" \
  --set-string cloudSql.instance="$APP_PROJECT:asia-south1:vendor-onboarding-postgres" \
  --set-string redisCaSecret=redis-ca \
  --set ingress.enabled=true \
  --set-string ingress.hostname="$APP_HOST"
kubectl rollout status deployment/vendor-onboarding-web -n vendor-onboarding
kubectl rollout status deployment/vendor-onboarding-worker -n vendor-onboarding
```

Point the domain to Terraform's `ingress_ip` output and wait for the managed certificate to become active. Verify health, OAuth sign-in, private database and Redis connectivity, document upload and worker processing, and the existing Yojnapath application. The cluster is single-zone, so a zone outage can interrupt the application. Do not send test emails without approving the exact recipient and message.
