import { inputs, outputs } from '@neo/schemas'

import { Identity } from '@/helpers/server/Identity'
import { authenticatedProcedure } from '@/helpers/server/trpc'

export const selectTenant = authenticatedProcedure
  .meta({ openapi: { method: 'POST', path: '/v1/identity/selectTenant', protect: true, summary: 'identity selectTenant', tags: ['identity'] } })
  .input(inputs.select)
  .output(outputs.identity)
  .mutation(({ ctx, input }) => Identity.select(ctx.actor, input))
