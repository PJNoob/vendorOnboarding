import { inputs, outputs } from '@neo/schemas'

import { DraftService } from '@/helpers/server/DraftService'
import { authenticatedProcedure } from '@/helpers/server/trpc'

export const beginRevision = authenticatedProcedure
  .meta({ openapi: { method: 'POST', path: '/v1/supplier/beginRevision', protect: true, summary: 'supplier beginRevision', tags: ['supplier'] } })
  .input(inputs.reissue)
  .output(outputs.ack)
  .mutation(({ ctx, input }) => DraftService.beginRevision(ctx.actor, input))
