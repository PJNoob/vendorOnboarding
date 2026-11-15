# `packages/prisma` layout, Makefile, scripts

## Layout

```
packages/prisma/
├── package.json                 # @neo/prisma
├── Makefile
├── index.ts                     # re-export @prisma/client (+ named enums)
├── client.ts                    # PrismaClient singleton + connection_limit
├── postgresql/
│   ├── schema.prisma            # source of truth
│   └── migrations/              # timestamped folders + migration.sql
├── mysql/
│   └── schema.prisma            # legacy; do not extend
├── repositories/
│   ├── index.ts                 # public barrel
│   ├── base/BaseRepository.ts   # getClient(tx), runInTransaction
│   ├── helpers/authFilters.ts
│   ├── channel/
│   ├── coworker/
│   ├── workspace/
│   ├── auth/
│   └── …
└── scripts/
    ├── executeCommand.ts        # spawn prisma with --schema postgresql/…
    ├── db-generate.ts
    ├── db-push.ts
    ├── migrate-dev.ts
    ├── migrate-deploy.ts
    ├── studio.ts
    ├── generate-channel-schema-migration.ts
    ├── generate-voice-provider-schema-migration.ts
    └── generate-coworker-builder-agent-seed-migration.ts
```

Exports (`package.json`):

- `@neo/prisma` → client types/enums
- `@neo/prisma/client` → singleton
- `@neo/prisma/repositories` → repositories barrel
- `@neo/prisma/repositories/base/BaseRepository` → base class + `TransactionClient`

## PostgreSQL schema

`datasource` uses `DATABASE_URL` and Prisma `schemas = ["ai_coworker", "common", "knowledgeBase", "public", "studio", "voice"]`. Every model has `@@schema("…")`. Put new models in the schema that already owns that domain (channels/credentials often `common` / `public`; coworker in `ai_coworker`; voice in `voice`).

Generator: `prisma-client-js` with `metrics`, `multiSchema`, `views`, `tracing`.

`client.ts` appends `connection_limit = APPLICATION_DB_POOL_SIZE + APPLICATION_DB_MAX_OVERFLOW` and `pool_timeout=30` onto `DATABASE_URL`. Env is read through `@neo/env`, not `process.env` in app code.

## Makefile (`packages/prisma/Makefile`)

`DATABASE_URL` is `postgresql://$APPLICATION_DB_USERNAME:$APPLICATION_DB_PASSWORD@$APPLICATION_DB_HOST:$APPLICATION_DB_PORT/$APPLICATION_DB_NAME` when those are set; else `postgres://postgres:neo@127.0.0.1:5432/neo`.

Requires `packages/prisma/node_modules/.bin/prisma` (`make install` → `pnpm install`).

```
make install
make prisma-generate
make prisma-generate-migrations NAME='add_widget'
make prisma-apply-migrations
make prisma-reset-migrations
make generate-channel-schema-migration NAME='update_channel_schemas'
make generate-voice-provider-schema-migration NAME='update_voice_provider_schemas'
make generate-coworker-builder-agent-seed-migration NAME='update_coworker_builder_agent'
```

`prisma-generate-migrations` is `prisma migrate dev --create-only` (SQL only; you review then deploy). `prisma-apply-migrations` is `migrate deploy`. `prisma-reset-migrations` wipes local data.

## package.json scripts

Same operations via pnpm (loads `./.env.local.defaults` through `dotenv-cli`):

```
pnpm --filter @neo/prisma db:generate
pnpm --filter @neo/prisma db:push
pnpm --filter @neo/prisma migrate:dev      # create-only
pnpm --filter @neo/prisma migrate:deploy
pnpm --filter @neo/prisma generate:channel-schema-migration
pnpm --filter @neo/prisma generate:voice-provider-schema-migration
pnpm --filter @neo/prisma generate:coworker-builder-agent-seed-migration
pnpm --filter @neo/prisma dev              # prisma studio
```

`db:generate` uses `scripts/db-generate.ts` → `executePrismaCommand("prisma generate", { force: true })`. `executeCommand.ts` always passes `--schema postgresql/schema.prisma`. Invalid URLs that are not `postgres://` / `postgresql://` fail.

Turbo: app `build` / `dev` `dependsOn` `@neo/prisma#db:generate`.

## Channel / voice / seed generators

`generate-channel-schema-migration.ts` walks `apps/builder/src/features/channels/etc/channels/static_schemas/**/*.json`, reads `channel_type`, and writes an `INSERT`/`UPSERT` migration into `postgresql/migrations/{timestamp}_{NAME}/migration.sql` for `common.ChannelSchema`.

Voice provider and coworker-builder-agent seed scripts follow the same “JSON definitions → SQL migration” pattern. Prefer these generators over hand-editing huge JSON blobs in SQL when the source JSON already exists.

## Repository conventions

- Class per table/aggregate, `PascalCase` + `Repository` suffix, all **static** methods.
- `private constructor()` so it is never instantiated.
- Optional last arg `tx?: TransactionClient`.
- Group methods: reads, then writes (as in `ChannelRouteRepository`).
- No business auth in repositories; `helpers/authFilters.ts` is for reusable Prisma `where` fragments only.
- Feature code imports repositories; CQC `studio/orm-in-manager` fails Prisma in procedures.

## Adding a model (order)

1. Edit `postgresql/schema.prisma`.
2. `make prisma-generate-migrations NAME='add_x'`.
3. Review SQL; `make prisma-apply-migrations` locally.
4. `make prisma-generate` (Turbo will also generate).
5. Add `XRepository` + barrel export.
6. Wire tRPC procedure to the repository, not to `prisma.x`.
