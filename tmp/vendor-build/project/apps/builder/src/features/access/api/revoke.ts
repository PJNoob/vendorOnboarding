import { inputs, outputs } from '@neo/schemas'

import { InvitationService } from '@/helpers/server/InvitationService'
import { protectedProcedure } from '@/helpers/server/trpc'

export const revoke = protectedProcedure(['ADMIN', 'BUYER'])
  .meta({ openapi: { method: 'POST', path: '/v1/access/revoke', protect: true, summary: 'access revoke', tags: ['access'] } })
  .input(inputs.revokeAccess)
  .output(outputs.ack)
  .mutation(({ ctx, input }) => InvitationService.revokeAccess(ctx.actor, input))
