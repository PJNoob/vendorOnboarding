import { inputs, outputs } from '@neo/schemas'

import { ReviewService } from '@/helpers/server/ReviewService'
import { protectedProcedure } from '@/helpers/server/trpc'

export const resolveIssue = protectedProcedure(ReviewService.REVIEWERS)
  .meta({ openapi: { method: 'POST', path: '/v1/reviews/resolveIssue', protect: true, summary: 'reviews resolveIssue', tags: ['reviews'] } })
  .input(inputs.resolve)
  .output(outputs.ack)
  .mutation(({ ctx, input }) => ReviewService.resolve(ctx.actor, input))
