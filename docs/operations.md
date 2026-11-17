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
- Set `DEMO_SCREENING=true` to use synthetic screening. The synthetic blocked registry identifier is `FIXTURE-BLOCKED-001`. The worker records source mode FIXTURE. For live operation, set `DEMO_SCREENING=false` and configure a screening adapter that accepts a POST body with an entities array of key, name, country and optional registryId. It must return a dataset version and a matches array of key and match, where match is BLOCKED or POSSIBLE. Set SCREENING_URL and SCREENING_TOKEN for this adapter. See [certificate and sanctions review](#certificate-and-sanctions-review) for the OFAC provider and reviewer MCP setup.

Run the following commands:

```sh
make install
make prisma-generate
make prisma-apply-migrations
make seed
pnpm dev
```

Run `pnpm worker` in a second terminal with the same exported environment. The worker needs ClamAV and current signatures in `/tmp/clamav`, plus the Python document service described below. Install them locally or use the supplied container. It sends messages only when the application invokes an OTP or a queued notification.

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

## Banned-country and web ban screening

Two checks run on every case, whatever the tenant policy lists. `COUNTRY_RESTRICTION` fails a case when the supplier, company or bank country is banned (default CU, IR, KP, SY; a policy can set `bannedCountries`) and sends owners in banned countries to compliance. `ADVERSE_SCREENING` searches the web through SearchApi.io for bans, sanctions or debarment naming the vendor and owners holding 25% or more, and always sends hits or provider failures to a person.

The API key lives in the Secret Manager secret `vendor-serp-api-key` (declared in Terraform, version added outside Terraform). `scripts/ci/deploy.py` copies it into the Kubernetes Secret as `SERP_API_KEY`. Without a key the check routes every case to review with `SCREENING_UNAVAILABLE`. Add a version with:

```bash
printf %s "$KEY" | gcloud secrets versions add vendor-serp-api-key --data-file=- --project=PROJECT_ID
```

The deploying identity needs `roles/secretmanager.secretAccessor` on `vendor-serp-api-key`.

Set `REST_COUNTRIES_API_KEY` in the ignored `apps/builder/.env.local` file and in the `vendor-app-config` Secret Manager JSON. Sync that secret to Kubernetes and roll out the web deployment to load a new value. Keep the key server-only; do not use a `NEXT_PUBLIC_` variable.

The server requests REST Countries v5 using bearer authentication, follows pagination in batches of 100, and caches the sorted country names and two-letter codes for six hours. Supplier invitation, company, bank, and ownership forms use this directory. Records without a two-letter code are excluded. An API outage retains the last successful list, or falls back to US/UAE, and retries after a minute. Run the seed command after deployment to add the existing baseline onboarding policy for every country in the directory. Existing published policies are preserved.

Reference: [REST Countries v5 documentation](https://restcountries.com/docs/countries).

## Local demo sign-in

Set `DEMO_AUTH=true` and `DEMO_LOGIN_TOKEN` (a locally generated secret of at least 16 characters) in `apps/builder/.env.local`, with a loopback `APP_URL` such as `http://localhost:3000`. Google credentials can be left blank in this mode. After applying migrations, run `make seed` and start or restart the development server. On the home page, use the demo form with email `demo-admin@example.test` and the value of `DEMO_LOGIN_TOKEN` as the password, then select **Sign in to demo workspace**. This opens the separate Harbor BioLabs Demo workspace.

For local API testing, `POST /api/auth/sign-in/demo` also accepts JSON `{ "token": "<DEMO_LOGIN_TOKEN>" }`. Requests must originate from the configured application origin and include its `Origin` header. Login creates the normal HTTP-only session cookie; it does not send email. Keep the token in the ignored `.env.local` file.

The seed command can be rerun. It creates the demo admin, workspace and policies without sending email. Set `DEMO_AUTH=false` and restart to turn off demo sign-in and invalidate demo access. Production always disables demo sign-in.

## Buyer and supplier flow

Sign in as the bootstrap Admin and create a supplier invitation. The invited supplier signs in with an email OTP, accepts the invitation, saves the required sections and uploads PDFs. The worker quarantines, scans and extracts text or OCR. Submit only once all required documents show Clean. The buyer case page shows persisted stages and checks. An Admin can record the final decision, including on a case they created. A Reviewer can decide a case created by another user.

To demonstrate the certificate exception, use a certificate whose scope omits the requested site. Upload the correct annex in a new revision and resubmit. For blocked ownership, include a parent owned 60 percent by the synthetic blocked entity and a supplier owned 80 percent by that parent. Include the other owners and make each ownership total 100 percent. The graph check propagates blocked status and opens a compliance hold. Compliance confirmation permits the reviewer to record rejection.

## Certificate and sanctions review

**Certificate suggestions in the cloud.** The Helm worker defaults to `documentService.certificateRlmProvider=gemini`. It calls the existing private document-verification sidecar using `DOCUMENT_SERVICE_TOKEN`. The sidecar reuses the Vertex AI client, `GEMINI_MODEL`, and Workload Identity used for document field extraction. Google Document AI performs OCR. Set the Helm value to `disabled` to turn off certificate suggestions.

**Certificate suggestions locally.** The worker defaults to `CERTIFICATE_RLM_PROVIDER=ollama`. Start Ollama, pull `qwen3:8b`, and set `CERTIFICATE_RLM_URL=http://127.0.0.1:11434` when the worker runs on the same host. Use a private service URL if the worker runs in a container. Set `CERTIFICATE_RLM_MODEL` to use another local model. Leave the URL blank to disable local suggestions.

When the certificate scope check requires attention, the model sees extracted certificate text and the requested scope. It selects sections and makes up to four recursive evidence calls within a shared 45-second request budget. Verified exact excerpts and page references are encrypted in the clean bucket. Reviewers and compliance users can read them in the workspace and through MCP. The existing check, issues, and decision workflow continue if the model or evidence storage is unavailable.

**Sanctions evidence.** Set `DEMO_SCREENING=false` and `SCREENING_PROVIDER=ofac` to use the public OFAC SDN feed. This provider needs no API key. The worker refreshes the feed after an hour and retries the check if it cannot obtain fresh, complete data. It records the publication date, retrieval time, content hash and matched SDN record IDs. Exact normalized primary names and aliases produce possible matches for compliance review. This provider covers the SDN list and performs name matching. Broader screening coverage uses the existing HTTP adapter. Use `SCREENING_PROVIDER=http` with `SCREENING_URL` and `SCREENING_TOKEN` for that adapter, or `DEMO_SCREENING=true` for the synthetic fixture.

**Reviewer MCP.** Configure a trusted MCP client for Streamable HTTP at `<APP_URL>/api/mcp`. Supply a valid Better Auth session cookie via the client's secure header configuration and send `X-Workspace-Id` for the active workspace. The client must support custom headers and stateless POST requests. Use HTTPS outside localhost. Admin, Reviewer, or Compliance membership is checked on each request. The client can list and call these read-only tools with `{ "caseId": "…" }`.

- `get_certificate_scope_evidence` returns advisory citations for the current submission.
- `get_screening_evidence` returns the current decision-check state and recorded provider evidence, including the underlying provider check if compliance cleared a possible match. Pending, expired, and unavailable results are identified in the response.

## Deployment

Build the image through `make build-builder` and push it to Artifact Registry with the Docker Makefile. Set the image, secret and service account in a Helm values override. Provision an HTTPS Gateway or Ingress, private Cloud SQL, private Redis and private GCS separately. Wire GKE Workload Identity for bucket operations and URL signing. For Cloud SQL private-IP proxy, populate cloudSql.instance and use a loopback database URL. Apply the committed migration and seed the tenant as deployment jobs or run the corresponding commands from an authorized operator environment before enabling traffic. Attach GCS lifecycle rules to the quarantine bucket and define a retention policy before storing real supplier documents.

## Implementation boundaries

The included checks compare evidence against the supplier declaration and requested scope. External authority checks require configured providers. The sample policy uses a shared baseline evidence list for the two country profiles. PII encryption uses AES-GCM with a secret provided to the process. KMS envelope encryption, secret rotation, storage retention and database privilege provisioning remain infrastructure work. The generated Prisma migration covers the schema. Deferred and immutability triggers from the design are enforced by the application write paths in this implementation. Web and worker share the image. Each worker runs a database reconciliation loop. Google Document AI now provides OCR through the Python service. LangGraph orchestrates Gemini field extraction, source validation, cross-document comparisons, and the reviewer report.

The code-quality references describe an existing Neo installation with NextAuth and credential JWTs. This standalone project adapts its repository, procedure, env and folder conventions to the Better Auth sessions specified by the design. Browser workspace selection is sent as a membership-checked header. Framework route entry points use the default exports Next.js requires.

References: [Better Auth](https://better-auth.com/docs/integrations/next), [tRPC](https://trpc.io/docs/server/procedures), [Cloud Storage signed URLs](https://docs.cloud.google.com/storage/docs/access-control/signing-urls-with-helpers), [OFAC ownership guidance](https://ofac.treasury.gov/faqs/401).

## Application logs

`pnpm dev` and `pnpm --filter @neo/builder start` append server output and errors to `logs/application.log` at the repository root, while keeping terminal output visible. `pnpm worker` writes to `logs/worker.log`. Entries include UTC timestamps and the output stream. Restarts append to the existing files. These files are ignored by Git. Set `APPLICATION_LOG_DIR` to use a different directory. API errors include their procedure and error code; request bodies, email addresses, and credentials are not added to these error records.

## Supplier mailbox verification

New supplier requests are saved atomically as a case, invitation, and durable queued notification. Mailbox verification happens asynchronously before any invitation email is sent. The adapter uses the [MailTester Ninja Verifier API](https://mailtester.ninja/api/). Configure `MAILTESTER_NINJA_API_KEY` in the server environment (locally, `apps/builder/.env.local`) and restart the app and worker. Cloud configuration is stored in the existing `vendor-app-config` JSON secret. Updating that secret alone does not deploy code or refresh Kubernetes environments; sync it and deploy/restart the compatible application separately.

Only `code: ok` permits sending an invitation email. Invalid recipients (`ko`) return “Incorrect supplier credentials. Enter the correct supplier email.” Uncertain/no-verdict results (`mb` / `--`), timeouts, provider failures, and missing/expired credentials block invitations with a separate verification error. This check estimates deliverability; final delivery is not guaranteed.

The free token permits 50 checks/day, with one new request every 35 seconds, and expires after seven days. Redis shares a five-minute result cache between web and worker so a newly queued invitation reuses its recipient check. A shared 30-second rate gate prevents concurrent instances from exhausting the free request pace. Cache keys conceal addresses with HMAC; only verdicts are stored. Rate limits produce a retry message rather than reporting incorrect credentials.

The worker checks before sending, including notifications queued before verification was enabled. Confirmed invalid queued recipients are canceled and their invitations revoked; unavailable verification is retried without sending. Existing application rows remain as historical records.

## Supplier invitation queue

Run `pnpm worker` alongside `pnpm dev`. The worker checks the durable supplier invitation queue every 35 seconds and publishes at most one due entry per interval, oldest due first. A shared Redis slot enforces that pace across worker instances; document jobs and other notifications retain their separate two-second dispatch loop. New/reissued invitations do not call the verification API in the HTTP request. Malformed email formats are still rejected immediately.

The UI shows Queued for email check, Checking email, Invalid supplier email, or Invited based on notification delivery, and refreshes pending entries automatically. Invalid recipients are canceled and revoked before sending. Transient verification failures and API rate limits defer the entry for at least 35 seconds without using a mail delivery attempt; expiry/token failures eventually show Invitation failed for manual retry. Logs remain in `logs/worker.log`. Tests mock mail delivery and do not send real emails.


## Automatic supplier invitation delivery

`pnpm dev` starts both the web application and the delivery worker. One supplier is picked up every 35 seconds. After the recipient passes MailTester Ninja verification, the worker immediately sends the invitation using `MAIL_PROVIDER` and `EMAIL_FROM`, then records the provider message ID and sets the notification to SENT. There is no human approval step or approval UI for supplier invitations.

Invalid recipients become failed work items and display Failed — invalid supplier credentials. Inconclusive checks display a distinct verification failure. API rate limits remain queued for retry. Provider acceptance is recorded as SENT; it does not guarantee inbox delivery.

Configure Gmail with `MAIL_PROVIDER=gmail`, `EMAIL_FROM`, and `GMAIL_APP_PASSWORD`, or Resend with its verified sender and `RESEND_API_KEY`. Local server configuration lives in the ignored `.env.local` file; cloud configuration lives in Secret Manager. Worker logs are in `logs/worker.log`.

## Supplier invitation entry

The `/invite` route loads the same server-side country data as the main workspace. Invitation fragments remain available through email-code sign-in and refresh, and are cleared after successful acceptance. Supplier invitations use the EMAIL_OTP channel; Google sign-in creates a buyer session. A Google session opening an invitation now shows a clear action to sign out and use supplier sign-in with the invited email.

After verifying the invited address, a link is accepted automatically and the supplier profile opens. The supplier dashboard also lists valid pending invitations by the verified email so they can be accepted without reopening the original message. Draft applications display a Complete your supplier profile prompt. Reopening an accepted, unexpired link opens the existing application for its authorized supplier. Wrong accounts, expired/revoked invitations, and revoked access remain blocked.

## OCR and LangGraph verification

The web app and BullMQ worker retain authentication, immutable submissions, durable jobs, retries, lease fencing, and human decisions. A Python service performs Google Document AI OCR and LangGraph verification. It does not send email, approve vendors, or write directly to the application database. An unfinished graph restarts safely on a worker retry; completed OCR outputs are reused. There is no second checkpoint database.

Use Python 3.11–3.14 and run `make install-document-service` (defaults to `python3.14`; override with `DOCUMENT_PYTHON=python3.13`, for example). Export the settings in `services/document-verification/.env.example`. Generate a random `DOCUMENT_SERVICE_TOKEN` of at least 32 characters; set the same value in the Python environment and `apps/builder/.env.local`. Set the worker's `DOCUMENT_SERVICE_URL=http://127.0.0.1:8080`. Run `make document-service` in a separate terminal, then run the app and worker normally. Missing provider configuration or shared token prevents service startup.

Create an Enterprise Document OCR processor and set `GOOGLE_CLOUD_PROJECT`, `DOCUMENT_AI_LOCATION`, and `DOCUMENT_AI_PROCESSOR_ID`. Set `GOOGLE_CLOUD_LOCATION` for Vertex AI and `GEMINI_MODEL` to an available model supporting structured output. Enable Document AI and Vertex AI APIs and configure Application Default Credentials. Grant the service identity Document AI API User and Vertex AI User permissions on the intended resources. Check model availability, processor access, and enabled APIs in the deployment project before live processing. Never commit credentials.

The worker forwards only scanned, generation-pinned PDF bytes to the authenticated service. Existing upload limits remain 10 MiB and 50 pages. PDFs are split into groups of 15 pages for synchronous OCR. Encrypted and over-limit PDFs return empty evidence and require review; malformed PDFs and provider failures surface as processing failures. Over-limit page text becomes unreadable evidence rather than being silently truncated. OCR and detailed reports are encrypted with existing tenant-scoped encryption before GCS storage.

After extraction completes, LangGraph runs `extract_fields → cross_verify → review_report`. Gemini extracts typed fields and verbatim page quotes. Unsupported, low-confidence, missing, or conflicting values require review. Names, registration identifiers, accounts, tax identifiers, addresses, and certificate scope/expiry are compared where present. Non-ISO expiry dates are conservatively considered ambiguous. No new external registry or authenticity check is introduced; existing ownership screening remains mandatory.

The case displays Extraction and Checks progress. Admins, Reviewers, and Compliance receive detailed compared values and page excerpts. A consistent agent recommendation cannot override a failed existing policy check or ownership hold. An Admin or eligible Reviewer records the final approval or rejection.

For an already-submitted vendor, an Admin opens the case and selects **Reprocess documents**. The `work.reprocess` command validates the current submission and case revision, rejects active jobs, enqueues missing current-version OCR, and resets verification. Existing command idempotency prevents duplicate replay. Completed `document-ai-v1` extraction is reused; `poppler-v1` outputs remain historical. Approved/rejected cases cannot be reprocessed. Existing Admin retry actions remain available for failed jobs; retry verification after resolving extraction failures.

Scan and extraction now have distinct deduplication keys, fixing a database uniqueness collision in their handoff. Verification cannot silently complete with missing extraction. Failed processing remains recoverable instead of being treated as a completed review.

Build and push both the builder image and the image produced by `make build-document-service`. Set `documentService.image` in the Helm override. Each worker pod runs the Python service on localhost:8080 under the worker identity. No public service or ingress is added. Add the shared token and Google processor/model settings to the existing application secret, keeping `DOCUMENT_SERVICE_URL` at localhost. Grant the worker identity provider permissions. No database migration is required.

Internal endpoints: `POST /v1/extract/{documentId}` (PDF), `POST /v1/verify` (submission, required kinds, rules, pages, declared fields), and `GET /health`. Processing requires a bearer token, bounds input, and redacts errors. A request has a 110-second service budget and 120-second worker timeout, below the 180-second lease. Existing attempts/backoff handle failures. Monitor failed SCAN/EXTRACT/VERIFY work, job age, and safe service failure events; never log document bodies or extracted values. Run mocked tests with `make test-document-service`.
