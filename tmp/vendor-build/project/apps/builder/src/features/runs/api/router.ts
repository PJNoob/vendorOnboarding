import { router } from '@/helpers/server/trpc'

import { get } from './get'

export const runsRouter = router({ get })
