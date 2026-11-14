# Procedure and repository templates

Copy these shapes. Replace `{Feature}`, `{feature}`, `{X}` / `{x}`.

## 1. Feature router

`apps/builder/src/features/{feature}/api/router.ts`

```ts
import { router } from "@/helpers/server/trpc";
import { createX } from "./createX";
import { getX } from "./getX";
import { listXs } from "./listXs";

export const {feature}Router = router({
  createX,
  getX,
  listXs, // keys alphabetical
});
```

Register in `helpers/server/routers/publicRouter.ts`:

```ts
import { {feature}Router } from "@/features/{feature}/api/router";
// inside basePublicRouter:
{feature}: {feature}Router,
```

## 2. Mutation (canonical)

`apps/builder/src/features/{feature}/api/createX.ts`

```ts
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { ResourceType } from "@neo/prisma";
import { BaseRepository, XRepository } from "@neo/prisma/repositories";
import { xPermission, workspacePermission } from "@neo/schemas";

import { ResourcePermissionUtilities } from "@/features/resourcePermission/helpers/ResourcePermissionUtilities";
import { protectedProcedure } from "@/helpers/server/trpc";

const requiredPermissions = [workspacePermission.view, xPermission.create];

const inputSchema = z.object({
  name: z.string().min(1),
  workspaceId: z.string().min(1),
});

const outputSchema = z.object({
  x: z.object({
    id: z.string(),
    name: z.string(),
  }),
});

export const createX = protectedProcedure(requiredPermissions)
  .meta({
    openapi: {
      method: "POST",
      path: "/v1/{feature}",
      protect: true,
      summary: "Create X",
      tags: ["{Feature}"],
    },
  })
  .input(inputSchema)
  .output(outputSchema)
  .mutation(async ({ input: { name, workspaceId }, ctx: { user } }) => {
    const duplicate = await XRepository.findByNameInWorkspace(name, workspaceId);
    if (duplicate) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `An X named "${name}" already exists in this workspace`,
      });
    }

    const created = await BaseRepository.runInTransaction(async (tx) => {
      const row = await XRepository.create({ name, workspaceId }, tx);
      await ResourcePermissionUtilities.registerResourcePermissions(
        tx,
        ResourceType.X,
        row.id,
        user.id,
        workspaceId,
      );
      return row;
    });

    return { x: { id: created.id, name: created.name } };
  });
```

## 3. Query

```ts
export const listXs = protectedProcedure([
  workspacePermission.view,
  xPermission.view,
])
  .meta({
    openapi: {
      method: "GET",
      path: "/v1/{feature}",
      protect: true,
      summary: "List Xs",
      tags: ["{Feature}"],
    },
  })
  .input(z.object({ workspaceId: z.string().min(1) }))
  .output(z.object({ items: z.array(z.object({ id: z.string(), name: z.string() })) }))
  .query(async ({ input: { workspaceId } }) => {
    const items = await XRepository.listByWorkspace(workspaceId);
    return { items: items.map((row) => ({ id: row.id, name: row.name })) };
  });
```

## 4. Resource keyed by id (IDOR)

After loading the row, authorize against **its** workspace, not a client-supplied one alone:

```ts
.mutation(async ({ input: { id }, ctx: { user } }) => {
  const row = await XRepository.findById(id);
  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "X not found" });
  }
  await assertWorkspaceMembership(user.id, row.workspaceId);
  // …
});
```

## 5. Super-admin / service-to-service

```ts
import { superAdminProcedure } from "@/helpers/server/trpc";

export const adminThing = superAdminProcedure
  .meta({ openapi: { method: "POST", path: "/v1/admin/…", protect: true, summary: "…", tags: ["Admin"] } })
  .input(z.object({}))
  .output(z.object({ ok: z.literal(true) }))
  .mutation(async () => ({ ok: true as const }));
```

```ts
import { publicProcedure, stateApiKeyMiddleware } from "@/helpers/server/trpc";

export const getSessionState = publicProcedure
  .use(stateApiKeyMiddleware)
  .meta({ openapi: { method: "GET", path: "/v1/chat-session-state", protect: true, summary: "…", tags: ["ChatSessionState"] } })
  .input(z.object({ sessionId: z.string() }))
  .output(z.unknown())
  .query(async ({ input }) => { /* … */ });
```

## 6. Repository

`packages/prisma/repositories/{domain}/XRepository.ts`

```ts
import type { Prisma } from "@prisma/client";
import { BaseRepository, type TransactionClient } from "../base/BaseRepository";

export class XRepository extends BaseRepository {
  private constructor() {
    super();
  }

  static findById(id: string, tx?: TransactionClient) {
    return this.getClient(tx).x.findUnique({ where: { id } });
  }

  static listByWorkspace(workspaceId: string, tx?: TransactionClient) {
    return this.getClient(tx).x.findMany({ where: { workspaceId } });
  }

  static create(data: Prisma.XCreateInput, tx?: TransactionClient) {
    return this.getClient(tx).x.create({ data });
  }
}
```

Export from `packages/prisma/repositories/index.ts`. Call `this.getClient(tx)` — never import the Prisma singleton in the repository file for queries (BaseRepository already does).

Multi-step writes:

```ts
await BaseRepository.runInTransaction(async (tx) => {
  await XRepository.create(data, tx);
  await YRepository.create(other, tx);
});
```

## 7. Permissions

Add to `packages/schemas/features/roleManagement/permissions/constants.ts` if the resource is new:

```ts
export const xPermission = {
  view: "X.view",
  create: "X.create",
  edit: "X.edit",
  delete: "X.delete",
};
```

Re-exported via `@neo/schemas`. Seed/role SQL must include the new strings or procedures will 403.

## 8. UI call

```tsx
const { data } = trpc.{feature}.listXs.useQuery({ workspaceId });
const create = trpc.{feature}.createX.useMutation({
  onSuccess: () => { /* invalidate */ },
});
```

## Reference implementations

| Kind | File |
|------|------|
| Mutation + OpenAPI + transaction | `apps/builder/src/features/coworkers/api/coworker/createCoworker.ts` |
| Mutation + channel domain | `apps/builder/src/features/channels/api/createChannel.ts` |
| Query + access policy filter | `apps/builder/src/features/channels/api/listChannelsForAgent.ts` |
| Chat agent create | `apps/builder/src/features/chat/api/createTypebot.ts` |
| Feature router | `apps/builder/src/features/channels/api/router.ts` |
| Repository | `packages/prisma/repositories/channel/ChannelRouteRepository.ts` |
