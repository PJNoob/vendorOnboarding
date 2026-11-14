import { inputs, outputs } from '@neo/schemas'

import { Queries } from '@/helpers/server/Queries'
import { authenticatedProcedure } from '@/helpers/server/trpc'

export const get = authenticatedProcedure
  .meta({ openapi: { method: 'GET', path: '/v1/runs/get', protect: true, summary: 'runs get', tags: ['runs'] } })
  .input(inputs.case)
  .output(outputs.run)
  .query(({ ctx, input }) => Queries.run(ctx.actor, input.caseId))
