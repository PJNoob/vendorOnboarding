import { inputs, outputs } from '@neo/schemas'
import { ReviewService } from '@/helpers/server/ReviewService'
import { protectedProcedure } from '@/helpers/server/trpc'

export const reprocess = protectedProcedure(['ADMIN'])
  .meta({ openapi: { method: 'POST', path: '/v1/work/reprocess', protect: true, summary: 'Reprocess submitted documents', tags: ['work'] } })
  .input(inputs.reprocess)
  .output(outputs.ack)
  .mutation(({ ctx, input }) => ReviewService.reprocess(ctx.actor, input))
