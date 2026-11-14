import { router } from '@/helpers/server/trpc'

import { list } from './list'

export const auditRouter = router({ list })
