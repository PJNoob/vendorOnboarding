import { inputs, outputs } from '@neo/schemas'

import { Queries } from '@/helpers/server/Queries'
import { authenticatedProcedure } from '@/helpers/server/trpc'

export const download = authenticatedProcedure
  .meta({ openapi: { method: 'POST', path: '/v1/documents/download', protect: true, summary: 'documents download', tags: ['documents'] } })
  .input(inputs.download)
  .output(outputs.download)
  .mutation(({ ctx, input }) => Queries.download(ctx.actor, input))
