import { inputs, outputs } from '@neo/schemas'
import { InvitationService } from '@/helpers/server/InvitationService'
import { authenticatedProcedure } from '@/helpers/server/trpc'

export const accept = authenticatedProcedure.input(inputs.acceptInvitation).output(outputs.ack)
  .mutation(({ ctx, input }) => InvitationService.accept(ctx.actor, input))
