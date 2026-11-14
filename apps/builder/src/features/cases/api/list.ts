import { inputs, outputs, Values } from '@neo/schemas'

import { Queries } from '@/helpers/server/Queries'
import { protectedProcedure } from '@/helpers/server/trpc'

export const list = protectedProcedure(Values.BUYER_ROLES)
  .meta({ openapi: { method: 'GET', path: '/v1/cases/list', protect: true, summary: 'cases list', tags: ['cases'] } })
  .input(inputs.list)
  .output(outputs.list)
  .query(({ ctx, input }) => Queries.list(ctx.actor, input))
