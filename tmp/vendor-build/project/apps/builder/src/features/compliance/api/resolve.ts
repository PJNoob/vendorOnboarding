import { inputs, outputs } from '@neo/schemas'

import { ReviewService } from '@/helpers/server/ReviewService'
import { protectedProcedure } from '@/helpers/server/trpc'

export const resolve = protectedProcedure(['COMPLIANCE'])
  .meta({ openapi: { method: 'POST', path: '/v1/compliance/resolve', protect: true, summary: 'compliance resolve', tags: ['compliance'] } })
  .input(inputs.resolveHold)
  .output(outputs.ack)
  .mutation(({ ctx, input }) => ReviewService.resolveHold(ctx.actor, input))
