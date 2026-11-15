# Builder tRPC Architecture

## Request path

```
Browser / OpenAPI client
        │
        ├─ Studio  POST /api/trpc/{router}.{procedure}
        │          pages/api/trpc/[trpc].ts
        │          createNextApiHandler({ router: appRouter, batching: false })
        │
        └─ REST    /api/{openapi path}   e.g. POST /api/v1/channels
                   pages/api/[...trpc].ts
                   createOpenApiNextHandler({ router: publicRouter })
                   CORS via getAllowedCorsOrigins(); bodyParser 4mb
        │
        ▼
createContext(req, res)
        │
        ▼
Procedure middlewares → handler
```

`appRouter = mergeRouters(internalRouter, publicRouter)`. Internal procedures (file URL, JWT, role, publicId) are studio-only. Everything on `publicRouter` is typed on `AppRouter` **and** eligible for OpenAPI.

Feature flags on `publicRouter`: `FF_IS_SIMULATION_ENABLED`, `FF_IS_COWORKER_ENABLED`, `FF_IS_CHAT_BASED_COWORKER_ENABLED`, `FF_VOICE_PROVIDERS_ENABLED`. Merge an `emptyRouter` when the flag is off; keep the TypeScript shape via `publicRouterFullShape()`.

## Context (`createContext`)

1. If `x-api-key` is present → `validateApiKey` → `ctx.apiKeyAuth` (user, workspaceId, permissions from credential role). No NextAuth session required.
2. Else → `getAuthenticatedUser` (NextAuth JWT session).
3. Resolve `sessionToken` from NextAuth token → `SessionRepository.findValidByToken` / `findValidByUserId`.
4. Fields: `user`, `sessionToken`, `apiKeyAuth`, `req`, `res`, plus later `permissions` / `workspaceId` / `isWorkspaceAdmin` / `isSuperAdmin` / `sandboxClaims`.

API keys are `ApplicationCredential` rows, not NextAuth. Key workspace must match requested workspace. Credential without a user is unauthorized.

## Middleware stack

`initTRPC.context<Context>().meta<OpenApiMeta>()` with **superjson** and Zod flatten in `errorFormatter`.

### `auditMiddleware` (all `publicProcedure` / authenticated stacks)

Logs method, path, optional redacted bodies (`AUDIT_*` env). Does not authorize.

### `isAuthed` (`authenticatedProcedure`)

Throws `UNAUTHORIZED` if `!ctx.user?.id`.

### `checkPermissions` (`protectedProcedure`)

Two branches:

**API key**

- Require `userId` + `user` + credential `workspaceId`.
- Input/header workspace must match credential workspace.
- Membership via `MemberInWorkspaceRepository`.
- `hasRequiredPermissions(credential.permissions, required, match)`.

**Session**

- Require `ctx.user.id` + `ctx.sessionToken`.
- `JwtTokenRepository.findBySessionToken` must have `userToken`.
- Resolve workspace (input → header → signed workspace JWT).
- `evaluateSessionAccess`: membership + permissions unless `isAdmin`.
- Workspace admins skip the permission list.
- Enforce vs report: `AUTHZ_FAIL_CLOSED_MODE`. Report mode then runs the **legacy** path: decode `workspaceToken`, `RoleRepository.findById`, membership, permission match.

### Other middlewares

- `ensureSuperAdminMiddleware` → `ensureSuperAdmin(ctx.user.email)`.
- `stateApiKeyMiddleware` → header vs `STATE_API_KEY` (no user).
- `sandboxJwtMiddleware` → verified claims on `ctx.sandboxClaims` (never trust body for those fields).

## Authn vs authz

| Concern | Where |
|---------|--------|
| Who is the caller? | Context: NextAuth session **or** `x-api-key` |
| Are they logged in? | `isAuthed` / protected first checks |
| Which workspace? | Input `workspaceId` / `typebotId`, else header, else workspace JWT; API key: credential workspace |
| Are they a member? | `MemberInWorkspaceRepository` |
| Can they do this action? | Role permissions vs `requiredPermissions` (`all` or `any`); workspace admin bypass |
| Can they see this row? | After load: `assertWorkspaceMembership`; often `AccessPolicyUtilities.filterAccessibleResourceIds` / `ResourcePermissionUtilities` |

`publicProcedure` is **not** “mounted on publicRouter”. `publicRouter` is the OpenAPI-facing **router tree**; most of its procedures are `protectedProcedure`.

## Zod & OpenAPI

Every studio/OpenAPI procedure should chain:

```ts
.meta({
  openapi: {
    method: "POST",           // GET for queries
    path: "/v1/{resource}",   // REST path under /api
    protect: true,
    summary: "…",
    tags: ["Channels"],
  },
})
.input(inputSchema)
.output(outputSchema)
```

Shared domain schemas live in `packages/schemas` (`@neo/schemas`). Feature-local request/response objects live in `features/{feature}/common/schemas.ts` or `features/{feature}/types.ts`. Permission strings live only in `packages/schemas/features/roleManagement/permissions/constants.ts` (`channelPermission.create` → `"Channel.create"`).

## Client

`createTRPCNext<AppRouter>` in `apps/builder/src/lib/trpc.ts`:

- URL `/api/trpc`
- `fetchWithTokenRefresh`
- `getWorkspaceHeaders()` (sends workspace header used by middleware)
- superjson; queries: no refetch on focus/reconnect, retry 0

Vanilla: `trpcVanilla` for non-React callers.

Call site: `trpc.channels.listChannelsForAgent.useQuery({ workspaceId, agentId, … })`.

## Tests

- Middleware: `apps/builder/src/test/unit/helpers/server/trpc.unit.test.ts`
- Opt-outs: `protectedProcedureOptOuts.unit.test.ts`
- Feature: `apps/builder/src/test/unit/features/{feature}/api/{procedure}.unit.test.ts`
- Mock repositories; do not hit the database in unit tests.

## Do not

- Put Prisma calls in procedure files or helper classes.
- Add Next.js `pages/api/*` for a feature that is a tRPC procedure.
- Skip `workspaceId` on protected tenant APIs.
- Use `protectedProcedure([], …)` empty permissions unless the opt-out test and a real reason exist.
- Trust client-supplied workspace for a resource loaded by another id — re-read owning `workspaceId` from DB, then `assertWorkspaceMembership`.
