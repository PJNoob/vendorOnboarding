import { inputs, outputs } from '@neo/schemas'

import { InvitationService } from '@/helpers/server/InvitationService'
import { authenticatedProcedure } from '@/helpers/server/trpc'

export const redeem = authenticatedProcedure
  .meta({ openapi: { method: 'POST', path: '/v1/invitations/redeem', protect: true, summary: 'invitations redeem', tags: ['invitations'] } })
  .input(inputs.redeem)
  .output(outputs.ack)
  .mutation(({ ctx, input }) => InvitationService.redeem(ctx.actor, input))
