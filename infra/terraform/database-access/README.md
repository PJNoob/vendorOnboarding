# Database read access

This separate Terraform state manages PostgreSQL SELECT privileges for the IAM
operator registered by `../vendor-onboarding`. It grants read access to existing
public tables and future tables created by `vendor_app`. PostgreSQL already
grants the operator CONNECT and public schema USAGE; this module does not change
those shared defaults. It does not grant write or administrative privileges.

Use the signed-in production operator account and existing GKE credentials:

```sh
terraform -chdir=infra/terraform/database-access init
terraform -chdir=infra/terraform/database-access validate
python3 scripts/ci/database-access.py plan -out=/private/tmp/vendor-database-read.tfplan
# Review the plan, then apply that exact saved plan.
python3 scripts/ci/database-access.py apply /private/tmp/vendor-database-read.tfplan
```

The helper fetches the application credentials from Secret Manager into process
memory, supplies the provider's PGUSER/PGPASSWORD environment variables, and
opens a loopback-only Kubernetes tunnel to the existing Cloud SQL Auth Proxy.
The proxy encrypts the connection to Cloud SQL. The helper closes the tunnel
when Terraform exits. No database passwords are stored in configuration or
Terraform variables. Keep saved plans and remote state access restricted.

After applying, reconnect Cloud SQL Studio as `jaiswalpratham1234@gmail.com` and
refresh Explorer. `public` should show all 31 existing tables. Verify with:

```sql
SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';
SELECT * FROM public."OnboardingCase" LIMIT 20;
```
