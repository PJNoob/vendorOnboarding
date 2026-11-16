import { inputs, outputs } from '@neo/schemas'

import { SupplierApplicationService } from '@/helpers/server/SupplierApplicationService'
import { authenticatedProcedure } from '@/helpers/server/trpc'

export const create = authenticatedProcedure
  .meta({ openapi: { method: 'POST', path: '/v1/supplier/create', protect: true, summary: 'Start a supplier application', tags: ['supplier'] } })
  .input(inputs.createSupplierApplication)
  .output(outputs.ack)
  .mutation(({ ctx, input }) => SupplierApplicationService.create(ctx.actor, input))
