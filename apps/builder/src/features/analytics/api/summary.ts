import { inputs, outputs, Values } from '@neo/schemas'

import { Queries } from '@/helpers/server/Queries'
import { protectedProcedure } from '@/helpers/server/trpc'

export const summary = protectedProcedure(Values.BUYER_ROLES)
  .meta({ openapi: { method: 'GET', path: '/v1/analytics/summary', protect: true, summary: 'analytics summary', tags: ['analytics'] } })
  .input(inputs.analytics)
  .output(outputs.analytics)
  .query(({ ctx, input }) => Queries.analytics(ctx.actor, input))
