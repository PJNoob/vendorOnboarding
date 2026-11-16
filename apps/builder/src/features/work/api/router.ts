import { router } from '@/helpers/server/trpc'

import { retry } from './retry'
import { reprocess } from './reprocess'

export const workRouter = router({ retry, reprocess })
