import { inputs, outputs } from '@neo/schemas'
import { InvitationService } from '@/helpers/server/InvitationService'
import { authenticatedProcedure } from '@/helpers/server/trpc'

export const pending = authenticatedProcedure.input(inputs.none).output(outputs.pendingInvitations)
  .query(({ ctx }) => InvitationService.pending(ctx.actor))
