import { router } from '@/helpers/server/trpc'

import { enroll } from './enroll'
import { directory } from './directory'
import { revoke } from './revoke'
import { setRole } from './setRole'

export const teamRouter = router({ directory, enroll, revoke, setRole })
