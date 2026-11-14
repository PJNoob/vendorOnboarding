import { router } from '@/helpers/server/trpc'

import { revoke } from './revoke'

export const accessRouter = router({ revoke })
