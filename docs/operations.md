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
make seed
pnpm dev
```

Run `pnpm worker` in a second terminal with the same exported environment. The worker needs Poppler, English Tesseract, ClamAV and current ClamAV signatures in `/tmp/clamav`. Install them locally or use the supplied container. It sends messages only when the application invokes an OTP or a queued notification.

## Google sign-in setup and troubleshooting

Google sign-in uses Better Auth and requires a real OAuth client. Values such as `local-google-client` are placeholders; sending them to Google causes **401 invalid_client: The OAuth client was not found**. The app rejects missing or malformed credentials before redirecting to Google. A correctly formatted client can still fail if it was deleted or its secret was revoked.

1. In [Google Cloud Console](https://console.cloud.google.com/auth/clients), select your project and configure Google Auth Platform branding and audience. Use an **External** audience to allow personal Gmail accounts. While the app is in Testing, add each account under Test users; publish the app when ready for general sign-in, completing any Google requirements.
2. Create an OAuth client with application type **Web application**. For local development, add `http://localhost:3000` as an authorized JavaScript origin and **exactly** `http://localhost:3000/api/auth/callback/google` as an authorized redirect URI. For production, add the HTTPS origin and its `/api/auth/callback/google` redirect URI. These must match `APP_URL`, including scheme, host and port.
3. Put that client's ID and matching secret in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the ignored `apps/builder/.env.local` file, or the deployment's secret configuration. The client ID ends in `.apps.googleusercontent.com`. Never commit the secret or place it in a `NEXT_PUBLIC_` variable. Restart the web application after changing configuration.
4. Set `BOOTSTRAP_ADMIN_EMAIL` to your first administrator's Google email and run `make seed` with the same environment. Existing administrators enroll additional team members from **Team & access**. Google authentication verifies identity; workspace access still requires enrollment. Supplier email OTP access remains available separately.
5. Select **Continue with Google**, complete consent, and confirm you return to the workspace. Cancelled or failed callbacks return to the sign-in page with a readable error. If Google reports `invalid_client`, verify the client still exists and that both credentials belong to it. For `redirect_uri_mismatch`, compare the full registered callback URL. For `access_denied` in Testing, check the test-user list.

If server logs report `account_not_linked`, the email already has a user record (for example, from supplier OTP sign-in) without a Google account binding. Account linking must be enabled for this flow. The app requires both the existing user and Google's email to be verified, matches the same email, and retains the existing user ID and workspace memberships. Enrollment and buyer session checks still control procurement access. Do not delete the user or their memberships to work around this error.

Reference: [Better Auth Google configuration](https://better-auth.com/docs/authentication/google), [Google OAuth error handling](https://developers.google.com/identity/oauth2/web/guides/error).

## Country directory

Set `REST_COUNTRIES_API_KEY` in the ignored `apps/builder/.env.local` file and in the `vendor-app-config` Secret Manager JSON. Sync that secret to Kubernetes and roll out the web deployment to load a new value. Keep the key server-only; do not use a `NEXT_PUBLIC_` variable.

The server requests REST Countries v5 using bearer authentication, follows pagination in batches of 100, and caches the sorted country names and two-letter codes for six hours. Company, bank, and ownership forms use this directory. Records without a two-letter code are excluded. An API outage retains the last successful list, or falls back to US/UAE, and retries after a minute. Supplier invitation countries still require the existing published onboarding policies (US/UAE).

Reference: [REST Countries v5 documentation](https://restcountries.com/docs/countries).

## Local demo sign-in

Set `DEMO_AUTH=true` and `DEMO_LOGIN_TOKEN` (a locally generated secret of at least 16 characters) in `apps/builder/.env.local`, with a loopback `APP_URL` such as `http://localhost:3000`. Google credentials can be left blank in this mode. After applying migrations, run `make seed` and start or restart the development server. On the home page, use the demo form with email `demo-admin@example.test` and the value of `DEMO_LOGIN_TOKEN` as the password, then select **Sign in to demo workspace**. This opens the separate Harbor BioLabs Demo workspace.

For local API testing, `POST /api/auth/sign-in/demo` also accepts JSON `{ "token": "<DEMO_LOGIN_TOKEN>" }`. Requests must originate from the configured application origin and include its `Origin` header. Login creates the normal HTTP-only session cookie; it does not send email. Keep the token in the ignored `.env.local` file.

The seed command can be rerun. It creates the demo admin, workspace and policies without sending email. Set `DEMO_AUTH=false` and restart to turn off demo sign-in and invalidate demo access. Production always disables demo sign-in.

## Buyer and supplier flow

Sign in as the bootstrap buyer, enroll a reviewer, then create a supplier invitation. The invited supplier signs in with an email OTP, accepts the invitation, saves the required sections and uploads PDFs. The worker quarantines, scans and extracts text or OCR. Submit only once all required documents show Clean. The buyer case page shows persisted stages and checks. A separate reviewer records the final decision.

To demonstrate the certificate exception, use a certificate whose scope omits the requested site. Upload the correct annex in a new revision and resubmit. For blocked ownership, include a parent owned 60 percent by the synthetic blocked entity and a supplier owned 80 percent by that parent. Include the other owners and make each ownership total 100 percent. The graph check propagates blocked status and opens a compliance hold. Compliance confirmation permits the reviewer to record rejection.

## Deployment

Build the image through `make build-builder` and push it to Artifact Registry with the Docker Makefile. Set the image, secret and service account in a Helm values override. Provision an HTTPS Gateway or Ingress, private Cloud SQL, private Redis and private GCS separately. Wire GKE Workload Identity for bucket operations and URL signing. For Cloud SQL private-IP proxy, populate cloudSql.instance and use a loopback database URL. Apply the committed migration and seed the tenant as deployment jobs or run the corresponding commands from an authorized operator environment before enabling traffic. Attach GCS lifecycle rules to the quarantine bucket and define a retention policy before storing real supplier documents.

## Implementation boundaries

The included checks compare evidence against the supplier declaration and requested scope. External authority checks require configured providers. The sample policy uses a shared baseline evidence list for the two country profiles. PII encryption uses AES-GCM with a secret provided to the process. KMS envelope encryption, secret rotation, storage retention and database privilege provisioning remain infrastructure work. The generated Prisma migration covers the schema. Deferred and immutability triggers from the design are enforced by the application write paths in this implementation. Web and worker share the image. Each worker runs a database reconciliation loop. Native Poppler and Tesseract provide extraction, so the optional Python service is unnecessary for this build.

The code-quality references describe an existing Neo installation with NextAuth and credential JWTs. This standalone project adapts its repository, procedure, env and folder conventions to the Better Auth sessions specified by the design. Browser workspace selection is sent as a membership-checked header. Framework route entry points use the default exports Next.js requires.

References: [Better Auth](https://better-auth.com/docs/integrations/next), [tRPC](https://trpc.io/docs/server/procedures), [Cloud Storage signed URLs](https://docs.cloud.google.com/storage/docs/access-control/signing-urls-with-helpers), [OFAC ownership guidance](https://ofac.treasury.gov/faqs/401).
