import { inputs, outputs } from '@neo/schemas'

import { DraftService } from '@/helpers/server/DraftService'
import { authenticatedProcedure } from '@/helpers/server/trpc'

export const submit = authenticatedProcedure
  .meta({ openapi: { method: 'POST', path: '/v1/supplier/submit', protect: true, summary: 'supplier submit', tags: ['supplier'] } })
  .input(inputs.submit)
  .output(outputs.ack)
  .mutation(({ ctx, input }) => DraftService.submit(ctx.actor, input))
