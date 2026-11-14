import { inputs, outputs } from '@neo/schemas'

import { TeamService } from '@/helpers/server/TeamService'
import { protectedProcedure } from '@/helpers/server/trpc'

export const revoke = protectedProcedure(['ADMIN'])
  .meta({ openapi: { method: 'POST', path: '/v1/team/revoke', protect: true, summary: 'team revoke', tags: ['team'] } })
  .input(inputs.member)
  .output(outputs.ack)
  .mutation(({ ctx, input }) => TeamService.member(ctx.actor, input))
