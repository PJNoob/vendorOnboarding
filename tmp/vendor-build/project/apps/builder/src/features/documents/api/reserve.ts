import { inputs, outputs } from '@neo/schemas'

import { DraftService } from '@/helpers/server/DraftService'
import { authenticatedProcedure } from '@/helpers/server/trpc'

export const reserve = authenticatedProcedure
  .meta({ openapi: { method: 'POST', path: '/v1/documents/reserve', protect: true, summary: 'documents reserve', tags: ['documents'] } })
  .input(inputs.reserve)
  .output(outputs.upload)
  .mutation(({ ctx, input }) => DraftService.reserve(ctx.actor, input))
