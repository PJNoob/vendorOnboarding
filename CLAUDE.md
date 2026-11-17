# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands
- Package manager is pnpm (Node 22). There is no root lint or test script. CI-style app checks live in `scripts/ci/check-app.sh`.
- Prettier: no semicolons, single quotes, trailing commas `es5`.
- `make help` lists the targets. Python document service: `make install-document-service`, then `make test-document-service` (pytest, no cloud calls). `make document-service` needs provider env vars exported first.

## CI/CD
- CI is Google Cloud Build (`cloudbuild.yaml`), not GitHub Actions. The `vendor-pr-checks` trigger covers PRs. A merge to `main` triggers `vendor-main-deploy`, which deploys to GKE.
- Don't run the app Terraform stack to set up the pipeline. Bootstrap is `scripts/ci/bootstrap.py` (see `docs/cicd.md`).

## Terraform (`infra/terraform`)
- There are two independent roots: `vendor-onboarding/` and `document-verification/`. Both use a partial `backend "gcs" {}` config on the same state bucket, with different prefixes.
  - `document-verification/`: `terraform init -backend-config=backend.hcl`.
  - `vendor-onboarding/`: the backend flags are inline. See its `DEPLOYMENT.md`.
- Auth is Application Default Credentials (`gcloud auth application-default login`).
- Always `plan -out=<file>` and apply that saved plan. Never commit plan files or state, because they can contain secrets such as the Redis AUTH string.
- `vendor-onboarding/` is documented as incomplete. Don't apply it, move the project or attach Shared VPC before the preflight in its README is reviewed.
- The OCR processor in `document-verification/` has `prevent_destroy`, and changing its location would force a replace.

## Gotchas
- The app project (`vendor-onboarding-514819`) is separate from the GKE cluster project (`voice-agent-yojnapath`).
- Secrets live in Secret Manager (`vendor-app-config`). They're synced to Kubernetes by `scripts/sync-vendor-secret.py` and aren't refreshed automatically. Never put secrets in tfvars or Helm values.
- The PII encryption key must never be changed or lost, because existing data would become undecryptable.
- Preserve the live image digests when running `helm upgrade`.
- The root `.env` must not be committed.
