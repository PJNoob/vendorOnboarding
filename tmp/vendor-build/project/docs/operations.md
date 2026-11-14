# Vendor onboarding

The workspace includes a Next.js web application, PostgreSQL repositories, a Prisma migration, a BullMQ worker and a Helm chart. Application commands lock the buyer tenant row before rechecking permissions and expected revisions. Each command writes its outcome, idempotency record, audit event and any downstream work in one PostgreSQL transaction. The worker uses a lease epoch to reject stale completions. PostgreSQL work records are the recovery source when Redis loses a job.

## Configure and run locally

Use Node.js 22, pnpm 10.15.0 and Docker Compose. Start PostgreSQL and Redis with `make setup-dev`. Copy `apps/builder/.env.schema` to `apps/builder/.env.local` and fill the values. Export the same configuration to the terminal that runs migrations, seed and worker.

- `APP_URL` is the browser origin, for example `http://localhost:3000`. Register its `/api/auth/callback/google` URL in Google OAuth.
- Set `DATABASE_URL` to `postgresql://vendor:local-vendor@127.0.0.1:5432/vendor` and `REDIS_URL` to `redis://127.0.0.1:6379` for the local Compose services. Start with `DATABASE_POOL_SIZE=5`.
- Generate independent random secrets for `BETTER_AUTH_SECRET` and `PII_KEY`. Use a 32-byte hexadecimal key for `PII_KEY`.
- Set `BOOTSTRAP_ADMIN_EMAIL` to the Google account that will enroll as the first admin. Enroll separate Buyer, Reviewer and Compliance accounts from the procurement workspace.
- Set `GCS_QUARANTINE_BUCKET` and `GCS_CLEAN_BUCKET` to private buckets. Configure Application Default Credentials with signing permission and bucket permissions. Allow the exact application origin to issue signed PUT requests in the quarantine bucket CORS configuration. Include Content-Type, x-goog-if-generation-match and x-goog-content-length-range as appropriate in your client and bucket setup.
- Configure Resend with an authorized sender and API key. Use inboxes that you control for the demonstration.
- Set `DEMO_SCREENING=true` to use synthetic screening. The synthetic blocked registry identifier is `FIXTURE-BLOCKED-001`. The worker records source mode FIXTURE. For live operation, set `DEMO_SCREENING=false` and configure a screening adapter that accepts a POST body with an entities array of key, name, country and optional registryId. It must return a dataset version and a matches array of key and match, where match is BLOCKED or POSSIBLE. Set SCREENING_URL and SCREENING_TOKEN for this adapter. Demo mode accepts an unused syntactically valid URL and placeholder token.

Run the following commands:

```sh
make install
make prisma-generate
make prisma-apply-migrations
pnpm seed
pnpm dev
```

Run `pnpm worker` in a second terminal with the same exported environment. The worker needs Poppler, English Tesseract, ClamAV and current ClamAV signatures in `/tmp/clamav`. Install them locally or use the supplied container. It sends messages only when the application invokes an OTP or a queued notification.

## Buyer and supplier flow

Sign in as the bootstrap buyer, enroll a reviewer, then create a supplier invitation. The invited supplier signs in with an email OTP, accepts the invitation, saves the required sections and uploads PDFs. The worker quarantines, scans and extracts text or OCR. Submit only once all required documents show Clean. The buyer case page shows persisted stages and checks. A separate reviewer records the final decision.

To demonstrate the certificate exception, use a certificate whose scope omits the requested site. Upload the correct annex in a new revision and resubmit. For blocked ownership, include a parent owned 60 percent by the synthetic blocked entity and a supplier owned 80 percent by that parent. Include the other owners and make each ownership total 100 percent. The graph check propagates blocked status and opens a compliance hold. Compliance confirmation permits the reviewer to record rejection.

## Deployment

Build the image through `make build-builder` and push it to Artifact Registry with the Docker Makefile. Set the image, secret and service account in a Helm values override. Provision an HTTPS Gateway or Ingress, private Cloud SQL, private Redis and private GCS separately. Wire GKE Workload Identity for bucket operations and URL signing. For Cloud SQL private-IP proxy, populate cloudSql.instance and use a loopback database URL. Apply the committed migration and seed the tenant as deployment jobs or run the corresponding commands from an authorized operator environment before enabling traffic. Attach GCS lifecycle rules to the quarantine bucket and define a retention policy before storing real supplier documents.

## Implementation boundaries

The included checks compare evidence against the supplier declaration and requested scope. External authority checks require configured providers. The sample policy uses a shared baseline evidence list for the two country profiles. PII encryption uses AES-GCM with a secret provided to the process. KMS envelope encryption, secret rotation, storage retention and database privilege provisioning remain infrastructure work. The generated Prisma migration covers the schema. Deferred and immutability triggers from the design are enforced by the application write paths in this implementation. Web and worker share the image. Each worker runs a database reconciliation loop. Native Poppler and Tesseract provide extraction, so the optional Python service is unnecessary for this build.

The code-quality references describe an existing Neo installation with NextAuth and credential JWTs. This standalone project adapts its repository, procedure, env and folder conventions to the Better Auth sessions specified by the design. Browser workspace selection is sent as a membership-checked header. Framework route entry points use the default exports Next.js requires.

References: [Better Auth](https://better-auth.com/docs/integrations/next), [tRPC](https://trpc.io/docs/server/procedures), [Cloud Storage signed URLs](https://docs.cloud.google.com/storage/docs/access-control/signing-urls-with-helpers), [OFAC ownership guidance](https://ofac.treasury.gov/faqs/401).
