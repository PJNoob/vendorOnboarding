import { router } from '@/helpers/server/trpc'

import { retry } from './retry'

export const workRouter = router({ retry })
