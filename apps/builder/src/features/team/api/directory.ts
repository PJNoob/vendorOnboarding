import { inputs, outputs } from '@neo/schemas'

import { TeamService } from '@/helpers/server/TeamService'
import { protectedProcedure } from '@/helpers/server/trpc'

export const directory = protectedProcedure(['ADMIN'])
  .meta({ openapi: { method: 'GET', path: '/v1/team/directory', protect: true, summary: 'List current workspace access', tags: ['team'] } })
  .input(inputs.none)
  .output(outputs.teamDirectory)
  .query(({ ctx }) => TeamService.directory(ctx.actor))
