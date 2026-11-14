import { router } from '@/helpers/server/trpc'

import { enroll } from './enroll'
import { revoke } from './revoke'
import { setRole } from './setRole'

export const teamRouter = router({ enroll, revoke, setRole })
