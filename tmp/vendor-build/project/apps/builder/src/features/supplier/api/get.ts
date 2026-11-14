import { inputs, outputs } from '@neo/schemas'

import { Queries } from '@/helpers/server/Queries'
import { authenticatedProcedure } from '@/helpers/server/trpc'

export const get = authenticatedProcedure
  .meta({ openapi: { method: 'GET', path: '/v1/supplier/get', protect: true, summary: 'supplier get', tags: ['supplier'] } })
  .input(inputs.case)
  .output(outputs.detail)
  .query(({ ctx, input }) => Queries.detail(ctx.actor, input.caseId))
