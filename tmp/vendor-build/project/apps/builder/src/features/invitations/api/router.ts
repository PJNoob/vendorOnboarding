import { router } from '@/helpers/server/trpc'

import { redeem } from './redeem'
import { reissue } from './reissue'
import { revoke } from './revoke'

export const invitationsRouter = router({ redeem, reissue, revoke })
