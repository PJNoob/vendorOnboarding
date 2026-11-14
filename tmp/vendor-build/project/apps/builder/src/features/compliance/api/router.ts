import { router } from '@/helpers/server/trpc'

import { resolve } from './resolve'

export const complianceRouter = router({ resolve })
