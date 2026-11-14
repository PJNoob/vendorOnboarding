import { router } from '@/helpers/server/trpc'

import { summary } from './summary'

export const analyticsRouter = router({ summary })
