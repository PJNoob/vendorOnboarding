import { inputs, outputs } from '@neo/schemas'

import { ReviewService } from '@/helpers/server/ReviewService'
import { protectedProcedure } from '@/helpers/server/trpc'

export const deleteSupplier = protectedProcedure(ReviewService.ADMIN)
  .meta({ openapi: { method: 'POST', path: '/v1/cases/deleteSupplier', protect: true, summary: 'Delete an approved supplier registration', tags: ['cases'] } })
  .input(inputs.deleteSupplier)
  .output(outputs.ack)
  .mutation(({ ctx, input }) => ReviewService.deleteSupplier(ctx.actor, input))
