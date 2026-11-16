import { router } from '@/helpers/server/trpc'

import { accept } from './accept'
import { pending } from './pending'
import { redeem } from './redeem'
import { reissue } from './reissue'
import { revoke } from './revoke'

export const invitationsRouter = router({ accept, pending, redeem, reissue, revoke })
