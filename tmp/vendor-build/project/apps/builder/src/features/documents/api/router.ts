import { router } from '@/helpers/server/trpc'

import { complete } from './complete'
import { download } from './download'
import { remove } from './remove'
import { reserve } from './reserve'

export const documentsRouter = router({ complete, download, remove, reserve })
