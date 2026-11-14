import { inputs, outputs } from '@neo/schemas'

import { TeamService } from '@/helpers/server/TeamService'
import { protectedProcedure } from '@/helpers/server/trpc'

export const enroll = protectedProcedure(['ADMIN'])
  .meta({ openapi: { method: 'POST', path: '/v1/team/enroll', protect: true, summary: 'team enroll', tags: ['team'] } })
  .input(inputs.enroll)
  .output(outputs.ack)
  .mutation(({ ctx, input }) => TeamService.enroll(ctx.actor, input))
