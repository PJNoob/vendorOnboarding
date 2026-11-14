import { inputs, outputs } from '@neo/schemas'

import { ReviewService } from '@/helpers/server/ReviewService'
import { protectedProcedure } from '@/helpers/server/trpc'

export const retry = protectedProcedure(['ADMIN'])
  .meta({ openapi: { method: 'POST', path: '/v1/work/retry', protect: true, summary: 'work retry', tags: ['work'] } })
  .input(inputs.retry)
  .output(outputs.ack)
  .mutation(({ ctx, input }) => ReviewService.retry(ctx.actor, input))
