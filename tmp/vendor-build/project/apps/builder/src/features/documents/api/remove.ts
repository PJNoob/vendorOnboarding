import { inputs, outputs } from '@neo/schemas'

import { DraftService } from '@/helpers/server/DraftService'
import { authenticatedProcedure } from '@/helpers/server/trpc'

export const remove = authenticatedProcedure
  .meta({ openapi: { method: 'POST', path: '/v1/documents/remove', protect: true, summary: 'documents remove', tags: ['documents'] } })
  .input(inputs.document)
  .output(outputs.ack)
  .mutation(({ ctx, input }) => DraftService.remove(ctx.actor, input))
