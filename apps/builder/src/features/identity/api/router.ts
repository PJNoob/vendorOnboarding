import { router } from '@/helpers/server/trpc'

import { me } from './me'
import { selectTenant } from './selectTenant'

export const identityRouter = router({ me, selectTenant })
