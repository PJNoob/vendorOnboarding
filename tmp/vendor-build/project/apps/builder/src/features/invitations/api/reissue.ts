import { inputs, outputs } from '@neo/schemas'

import { InvitationService } from '@/helpers/server/InvitationService'
import { protectedProcedure } from '@/helpers/server/trpc'

export const reissue = protectedProcedure(['ADMIN', 'BUYER'])
  .meta({ openapi: { method: 'POST', path: '/v1/invitations/reissue', protect: true, summary: 'invitations reissue', tags: ['invitations'] } })
  .input(inputs.reissue)
  .output(outputs.ack)
  .mutation(({ ctx, input }) => InvitationService.reissue(ctx.actor, input))
