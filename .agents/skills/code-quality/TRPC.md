# Neo Builder tRPC & Prisma

Portable patterns from `neo-core` (`apps/builder` + `packages/prisma` + `packages/schemas`).

## When to Use This Skill

- Adding or changing a builder API (channels, coworkers, typebots, workspace, …)
- Wiring tRPC routers, procedures, OpenAPI meta
- Authn (session / API key) or authz (permissions, workspace membership)
- Zod input/output schemas and shared permission constants
- Prisma schema, repositories, Makefile, or migration scripts

## Architecture (layers)

```
UI (trpc.{router}.{procedure}.useQuery/useMutation)
    ↓  POST /api/trpc  (superjson, no batching)
Next handler  pages/api/trpc/[trpc].ts
    ↓  createContext (session XOR x-api-key)
appRouter = merge(internalRouter, publicRouter)
    ↓  procedure middlewares
Feature procedure (Zod + OpenAPI + handler)
    ↓  helper classes  (no Prisma)
Repository extends BaseRepository  (@neo/prisma/repositories)
    ↓
PostgreSQL  (packages/prisma/postgresql/schema.prisma)
```

OpenAPI REST is a **second mount** of the **same** public procedures:

- Studio: `/api/trpc/[trpc]` → `appRouter` (internal + public)
- OpenAPI: `/api/[...trpc]` → `publicRouter` only, CORS allowlist, 4mb body

Do not invent a new HTTP route under `pages/api/` for a feature that belongs on tRPC.

## Procedure kinds (pick one)

| Export | Auth | Use |
|--------|------|-----|
| `protectedProcedure(perms)` | Session or API key + workspace + permissions | Default for tenant APIs |
| `authenticatedProcedure` | Logged in, **no** permission/workspace check | Rare; still not public |
| `publicProcedure` | None (audit only) | Truly public |
| `superAdminProcedure` | Session + `ensureSuperAdmin` | Platform admin |
| `sandboxProcedure` | Sandbox JWT on `publicProcedure` | Skills sandbox |
| `stateApiKeyMiddleware` | `x-state-api-key` vs `STATE_API_KEY` | Service-to-service chat session state |

Signature:

```ts
protectedProcedure(
  requiredPermissions: string[],
  getUserPermission = false,       // attach ctx.permissions / isWorkspaceAdmin
  validateWorkspaceAccess = true,  // membership check; opt-out is a review item
  { permissionMatch?: "all" | "any"; requireWorkspace?: boolean },
)
```

Workspace resolution order for sessions: **input** (`workspaceId` or typebot's workspace) → `x-workspace-id` header → signed `workspaceToken`. API keys are bound to one workspace; a different requested workspace is forbidden.

**Fail-closed:** `AUTHZ_FAIL_CLOSED_MODE=enforce` throws on deny; otherwise it logs `[authz.would_deny]` then runs legacy JWT/role checks. New APIs must still pass `workspaceId` (or `typebotId`) in input so middleware can resolve a workspace.

Resources keyed by ids other than `workspaceId`/`typebotId` must call `assertWorkspaceMembership(ctx.user.id, owningWorkspaceId)` after loading the row (IDOR).

Every `validateWorkspaceAccess: false` or `requireWorkspace: false` file must be added to `apps/builder/src/test/unit/helpers/server/protectedProcedureOptOuts.unit.test.ts`.

## Folder layout (feature)

```
apps/builder/src/features/{feature}/
├── api/
│   ├── router.ts              # router({ createX, getX, … }) named keys
│   ├── createX.ts             # one procedure per file
│   └── getX.ts
├── common/
│   ├── schemas.ts             # Zod shared by several procedures
│   └── helpers.ts             # thin re-exports if needed
├── helpers/                   # PascalCase utility classes, static methods
└── components/                # UI; calls trpc.{feature}.{procedure}
```

Register the feature router on `apps/builder/src/helpers/server/routers/publicRouter.ts` (or `internalRouter.ts` only if it must not appear in OpenAPI). Gate optional products with existing `env.FF_*` flags the same way coworkers/simulations are gated.

Client: `import { trpc } from "@/lib/trpc"` then `trpc.channels.createChannel.useMutation()`.

## New procedure checklist

```
- [ ] Permission constants from @neo/schemas (do not invent string literals)
- [ ] protectedProcedure(requiredPermissions) unless a documented exception
- [ ] .meta({ openapi: { method, path: "/v1/…", protect: true, summary, tags } })
- [ ] .input(zod).output(zod)  — named schemas, not inline magic objects when reused
- [ ] .query or .mutation
- [ ] Include workspaceId (or typebotId) in input for authz
- [ ] Prisma only via XxxRepository; wrap multi-writes in BaseRepository.runInTransaction
- [ ] Domain logic in helper classes (studio/no-free-functions)
- [ ] ResourcePermissionUtilities.registerResourcePermissions on create
- [ ] Unit test under apps/builder/src/test/unit/features/{feature}/api/
- [ ] Mount on feature router + publicRouter (if new feature)
```

## Prisma (`packages/prisma`)

- Schema of record: `postgresql/schema.prisma` (multi-schema: `ai_coworker`, `common`, `knowledgeBase`, `public`, `studio`, `voice`).
- `mysql/schema.prisma` is legacy; do not add models there.
- ORM queries live only in `repositories/{domain}/XxxRepository.ts` extending `BaseRepository`. Export from `repositories/index.ts`. Import `@neo/prisma/repositories`, never `@prisma/client` from feature code for queries.
- Client singleton: `packages/prisma/client.ts`. Enums/types: `@neo/prisma`.

Commands (repo root or `packages/prisma`):

| Task | Command |
|------|---------|
| Generate client | `pnpm --filter @neo/prisma db:generate` or `make prisma-generate` |
| Create SQL migration | `make prisma-generate-migrations NAME='add_foo'` |
| Apply migrations | `make prisma-apply-migrations` |
| Reset local DB | `make prisma-reset-migrations` |
| Channel JSON → SQL | `make generate-channel-schema-migration NAME='…'` |
| Voice provider JSON → SQL | `make generate-voice-provider-schema-migration NAME='…'` |
| Coworker builder-agent seed | `make generate-coworker-builder-agent-seed-migration NAME='…'` |

Turbo `build` / `dev` depend on `@neo/prisma#db:generate`. After schema edits, generate before typechecking.

## CQC (builder TS)

- Named exports only; procedure files export `export const createX = protectedProcedure…`.
- No Prisma/`prisma.` in `features/**` — repositories only (`studio/orm-in-manager`).
- Utility classes with **static** methods; call `ClassName.method`, never `this` for statics.
- Permissions and OpenAPI paths are named constants / schema objects, not free-flowing literals when they already exist in `@neo/schemas`.
- `try` wraps one failing operation; do not swallow. Prefer `TRPCError` with codes from `@/helpers/server/common` `TRPC_ERROR_CODES` when used in that feature.

## Source of truth

| Piece | Path |
|-------|------|
| initTRPC + middlewares | `apps/builder/src/helpers/server/trpc.ts` |
| Context (session / API key) | `apps/builder/src/helpers/server/context.ts` |
| App / public / internal routers | `apps/builder/src/helpers/server/routers/` |
| Studio handler | `apps/builder/src/pages/api/trpc/[trpc].ts` |
| OpenAPI handler | `apps/builder/src/pages/api/[...trpc].ts` |
| Client | `apps/builder/src/lib/trpc.ts` |
| IDOR helper | `apps/builder/src/helpers/server/assertWorkspaceMembership.ts` |
| Permissions | `packages/schemas/features/roleManagement/permissions/constants.ts` |
| Channel feature (canonical API shape) | `apps/builder/src/features/channels/api/` |
| Prisma Makefile | `packages/prisma/Makefile` |

## Additional resources

- Middleware, auth, router merge: [architecture.md](architecture.md)
- Copy-paste procedure + repository templates: [procedure-template.md](procedure-template.md)
- Prisma package, Makefile, scripts: [prisma-package.md](prisma-package.md)
