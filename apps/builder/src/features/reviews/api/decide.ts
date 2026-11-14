import { inputs, outputs } from '@neo/schemas'

import { ReviewService } from '@/helpers/server/ReviewService'
import { protectedProcedure } from '@/helpers/server/trpc'

export const decide = protectedProcedure(['REVIEWER'])
  .meta({ openapi: { method: 'POST', path: '/v1/reviews/decide', protect: true, summary: 'reviews decide', tags: ['reviews'] } })
  .input(inputs.decide)
  .output(outputs.ack)
  .mutation(({ ctx, input }) => ReviewService.decide(ctx.actor, input))
