#!/usr/bin/env bash
set -euo pipefail
source scripts/ci/test-env.sh
corepack enable
corepack prepare pnpm@10.15.0 --activate
pnpm install --frozen-lockfile
pnpm --filter @neo/prisma db:generate
pnpm --filter @neo/prisma exec prisma validate --schema postgresql/schema.prisma
# PostgreSQL is disposable, never a production database.
for attempt in {1..30}; do
  if pnpm --filter @neo/prisma migrate:deploy; then break; fi
  if [ "$attempt" = 30 ]; then exit 1; fi
  sleep 2
done
node scripts/run-with-logs.test.mjs
node scripts/ci/run-app-tests.mjs
pnpm --filter @neo/builder exec tsc --noEmit
