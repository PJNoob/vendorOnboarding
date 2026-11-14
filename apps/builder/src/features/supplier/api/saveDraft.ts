import { inputs, outputs } from '@neo/schemas'

import { DraftService } from '@/helpers/server/DraftService'
import { authenticatedProcedure } from '@/helpers/server/trpc'

export const saveDraft = authenticatedProcedure
  .meta({ openapi: { method: 'POST', path: '/v1/supplier/saveDraft', protect: true, summary: 'supplier saveDraft', tags: ['supplier'] } })
  .input(inputs.save)
  .output(outputs.ack)
  .mutation(({ ctx, input }) => DraftService.save(ctx.actor, input))
