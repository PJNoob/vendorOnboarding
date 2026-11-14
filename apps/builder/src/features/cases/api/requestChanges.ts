import { inputs, outputs } from '@neo/schemas'

import { ReviewService } from '@/helpers/server/ReviewService'
import { protectedProcedure } from '@/helpers/server/trpc'

export const requestChanges = protectedProcedure(['BUYER', 'REVIEWER'])
  .meta({ openapi: { method: 'POST', path: '/v1/cases/requestChanges', protect: true, summary: 'cases requestChanges', tags: ['cases'] } })
  .input(inputs.request)
  .output(outputs.ack)
  .mutation(({ ctx, input }) => ReviewService.request(ctx.actor, input))
