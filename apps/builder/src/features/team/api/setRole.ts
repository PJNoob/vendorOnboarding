import { inputs, outputs } from '@neo/schemas'

import { TeamService } from '@/helpers/server/TeamService'
import { protectedProcedure } from '@/helpers/server/trpc'

export const setRole = protectedProcedure(['ADMIN'])
  .meta({ openapi: { method: 'POST', path: '/v1/team/setRole', protect: true, summary: 'team setRole', tags: ['team'] } })
  .input(inputs.role)
  .output(outputs.ack)
  .mutation(({ ctx, input }) => TeamService.member(ctx.actor, input))
