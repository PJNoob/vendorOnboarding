import { router } from '@/helpers/server/trpc'

import { create } from './create'
import { deleteSupplier } from './deleteSupplier'
import { get } from './get'
import { list } from './list'
import { requestChanges } from './requestChanges'

export const casesRouter = router({ create, deleteSupplier, get, list, requestChanges })
