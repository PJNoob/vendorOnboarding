import { inputs, outputs } from '@neo/schemas'

import { InvitationService } from '@/helpers/server/InvitationService'
import { protectedProcedure } from '@/helpers/server/trpc'

export const create = protectedProcedure(['ADMIN', 'BUYER'])
  .meta({ openapi: { method: 'POST', path: '/v1/cases/create', protect: true, summary: 'cases create', tags: ['cases'] } })
  .input(inputs.create)
  .output(outputs.ack)
  .mutation(({ ctx, input }) => InvitationService.create(ctx.actor, input))
