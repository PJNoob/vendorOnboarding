import { inputs, outputs } from '@neo/schemas'

import { DraftService } from '@/helpers/server/DraftService'
import { authenticatedProcedure } from '@/helpers/server/trpc'

export const complete = authenticatedProcedure
  .meta({ openapi: { method: 'POST', path: '/v1/documents/complete', protect: true, summary: 'documents complete', tags: ['documents'] } })
  .input(inputs.document)
  .output(outputs.ack)
  .mutation(({ ctx, input }) => DraftService.complete(ctx.actor, input))
