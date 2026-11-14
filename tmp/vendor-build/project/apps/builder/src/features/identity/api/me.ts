import { inputs, outputs } from '@neo/schemas'

import { Queries } from '@/helpers/server/Queries'
import { authenticatedProcedure } from '@/helpers/server/trpc'

export const me = authenticatedProcedure
  .meta({ openapi: { method: 'GET', path: '/v1/identity/me', protect: true, summary: 'identity me', tags: ['identity'] } })
  .input(inputs.none)
  .output(outputs.identity)
  .query(({ ctx }) => Queries.identity(ctx.actor))
