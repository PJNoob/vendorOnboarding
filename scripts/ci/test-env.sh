# Synthetic configuration for isolated CI only.
export APP_URL=http://localhost:3000 BETTER_AUTH_SECRET=ci-only-auth-secret-00000000000000000000
export BOOTSTRAP_ADMIN_EMAIL=admin@example.test DATABASE_POOL_SIZE=5
export DATABASE_URL=postgresql://test:test@ci-postgres:5432/test
export DEMO_AUTH=true DEMO_SCREENING=true EMAIL_FROM=sender@example.test
export GCS_CLEAN_BUCKET=test-clean GCS_QUARANTINE_BUCKET=test-quarantine
export PII_KEY=0000000000000000000000000000000000000000000000000000000000000000
export REDIS_URL=redis://localhost:6379 RESEND_API_KEY=test SCREENING_TOKEN=test SCREENING_URL=https://example.test
export DOCUMENT_SERVICE_TOKEN=ci-only-document-token-00000000000000000 MAIL_PROVIDER=resend
