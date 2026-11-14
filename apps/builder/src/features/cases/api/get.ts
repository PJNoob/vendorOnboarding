import { inputs, outputs, Values } from '@neo/schemas'

import { Queries } from '@/helpers/server/Queries'
import { protectedProcedure } from '@/helpers/server/trpc'

export const get = protectedProcedure(Values.BUYER_ROLES)
  .meta({ openapi: { method: 'GET', path: '/v1/cases/get', protect: true, summary: 'cases get', tags: ['cases'] } })
  .input(inputs.case)
  .output(outputs.detail)
  .query(({ ctx, input }) => Queries.detail(ctx.actor, input.caseId))
