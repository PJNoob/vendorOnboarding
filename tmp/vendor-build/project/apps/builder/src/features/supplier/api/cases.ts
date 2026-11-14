import { inputs, outputs } from '@neo/schemas'

import { Queries } from '@/helpers/server/Queries'
import { authenticatedProcedure } from '@/helpers/server/trpc'

export const cases = authenticatedProcedure
  .meta({ openapi: { method: 'GET', path: '/v1/supplier/cases', protect: true, summary: 'supplier cases', tags: ['supplier'] } })
  .input(inputs.none)
  .output(outputs.list)
  .query(({ ctx }) => Queries.supplierCases(ctx.actor))
