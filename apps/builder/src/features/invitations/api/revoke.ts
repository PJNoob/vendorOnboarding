import { inputs, outputs } from '@neo/schemas'

import { InvitationService } from '@/helpers/server/InvitationService'
import { protectedProcedure } from '@/helpers/server/trpc'

export const revoke = protectedProcedure(['ADMIN', 'BUYER'])
  .meta({ openapi: { method: 'POST', path: '/v1/invitations/revoke', protect: true, summary: 'invitations revoke', tags: ['invitations'] } })
  .input(inputs.invite)
  .output(outputs.ack)
  .mutation(({ ctx, input }) => InvitationService.revoke(ctx.actor, input))
