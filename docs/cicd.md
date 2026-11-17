# Automatic vendor deployment

Cloud Build in `vendor-onboarding-514819`, region `asia-south1`, watches
`PJNoob/vendorOnboarding`. The `vendor-main-deploy` trigger matches `^main$`.
`vendor-pr-checks` runs the same checks without publishing images, production secrets,
or Kubernetes access. Both read `cloudbuild.yaml` from the triggering commit.

Every main commit runs frozen dependency installation, Prisma generation/validation,
migrations against disposable PostgreSQL, application tests, TypeScript checking,
Python tests, deployment regression tests, Helm checks and both container builds.
The application container must also start and report database readiness against
the disposable CI database before publishing or deployment.
Only then are immutable image digests deployed. A failed check cannot start deployment.

The deployment identity can write the vendor Artifact Registry repository, read
`vendor-app-config`, discover the shared GKE cluster and manage resources only in
the `vendor-onboarding` namespace. It has no Owner or cluster-admin role.

## One-time bootstrap

Enable Cloud Build, create the `vendor-github` second-generation GitHub connection
in `asia-south1`, and authorize its Google Cloud Build GitHub App for only this repo.
Google requires an interactive OAuth/app installation during this initial connection.
The Cloud Build service agent temporarily needs Secret Manager Admin while creating
the connection; `bootstrap.py triggers` removes that project-wide grant afterward.
Use a time-limited IAM condition titled `vendor-github-bootstrap` if authorization
must remain pending; the bootstrap cleanup also recognizes that grant.

Using an operator account with the required IAM and namespace RBAC permissions:

```sh
gcloud container clusters get-credentials yojnapath-dev-gke --zone asia-south1-a --project voice-agent-yojnapath
python3 scripts/ci/bootstrap.py identities
python3 scripts/ci/bootstrap.py triggers
```

Bootstrap is separate from application deployment. Do not run the incomplete
application infrastructure Terraform stack to set up this pipeline.

## Release behavior

Images, secrets, SQL and document resources stay in the vendor project. Pods run on
`yojnapath-dev-gke` in `voice-agent-yojnapath`, using the vendor node pool. The existing
one-to-two-node autoscaling and two web/one worker replicas are preserved.
Network exposure is unchanged; this pipeline does not add a public endpoint.

Each build takes a namespace Lease before deployment and renews it every 15 seconds.
An expired lock is only reclaimed after its owning Cloud Build is terminal. Under
the lock, older builds skip deployment if a newer build from the main trigger exists,
including when that newer build ultimately fails. The current healthy release stays
running until the newest commit passes. An already active rollout finishes first.

Before migration, configuration is synchronized from Secret Manager. Database/Redis
credentials, the auth secret and PII key must match the live values; rotate these
separately, rather than silently changing them during an application release.
The document token and Google project/processor settings must already be configured.
No secret payloads are written to logs or build artifacts.

Prisma migrations run in a bounded Job with a native Kubernetes SQL proxy sidecar
that exits when the migration completes. There is no automatic production seeding.
The Job is skipped when a hash of `packages/prisma/postgresql/migrations` equals the
`vendor-onboarding/migrations` annotation on the live web Deployment, which only advances after
a successful Helm upgrade; a missing annotation or a previously failed release runs the Job.
Schema changes must remain compatible with the previous application version.

Helm 3 rolls pods with zero unavailable replicas, waits for startup/readiness, and
rolls back unhealthy upgrades. The pipeline additionally runs read-only web, SQL,
Redis and document-authentication checks. No smoke test sends emails or processes
real supplier documents. Existing live deployment specs and configuration are saved
in memory and restored if migration, rollout or smoke validation fails. This also
preserves live image overrides that differ from Helm history. Database migrations
are not reversed. Automatic rollback is unavailable if the entire build is forcibly
terminated; its abandoned Lease becomes reclaimable after expiry and terminal status.

## Build speed

The deploy step runs `scripts/ci/deploy-tools.sh run`, which starts a prebuilt image
(`deploy-tools:<Dockerfile hash>` in Artifact Registry) carrying gcloud, kubectl and Helm 3.
`deploy-tools.sh build` publishes it only when that tag is missing, so editing
`infra/docker/deploy/Dockerfile` rebuilds it once. Application images use the `:cache` tags
pushed by the last deploy build for `--cache-from`; validation builds only read them.
The builder image bakes ClamAV signatures dated by the `SIGNATURE_DATE` build argument.

## Operations

Inspect runs under Google Cloud Console → Cloud Build → History in `asia-south1`.
The build log records checked/deployed SHA and skipped superseded builds. GitHub
shows Cloud Build results on commits and pull requests. Once the PR check context
has appeared, require that exact context in the `main` branch rules if the GitHub
plan supports required checks on this private repository. The current plan does
not support private-repository branch protection; Cloud Build still gates every
production deployment on successful checks. Enabling GitHub Pro would additionally
allow enforcing those checks before a pull request can merge.

For a failed migration inspect `vendor-migrate-*` Jobs and their `migrate` container
logs using an authorized operator. Resolve the schema problem with a new commit;
never automatically reset or seed production data. To revert an application change,
merge a revert PR: it follows the same checks and deployment path.

Deployments wait up to 20 minutes for the lock and up to 15 minutes for each rollout.
A queued build that cannot acquire the lock fails visibly rather than overlapping
an active deployment. The Cloud Build timeout is one hour.
