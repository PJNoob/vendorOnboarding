import { router } from '@/helpers/server/trpc'

import { create } from './create'
import { get } from './get'
import { list } from './list'
import { requestChanges } from './requestChanges'

export const casesRouter = router({ create, get, list, requestChanges })
