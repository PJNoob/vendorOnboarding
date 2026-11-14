import { inputs, outputs, Values } from '@neo/schemas'

import { Queries } from '@/helpers/server/Queries'
import { protectedProcedure } from '@/helpers/server/trpc'

export const list = protectedProcedure(Values.BUYER_ROLES)
  .meta({ openapi: { method: 'GET', path: '/v1/audit/list', protect: true, summary: 'audit list', tags: ['audit'] } })
  .input(inputs.audit)
  .output(outputs.audit)
  .query(({ ctx, input }) => Queries.audit(ctx.actor, input))
