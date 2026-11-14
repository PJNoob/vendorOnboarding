import { router } from '@/helpers/server/trpc'

import { beginRevision } from './beginRevision'
import { cases } from './cases'
import { get } from './get'
import { saveDraft } from './saveDraft'
import { submit } from './submit'

export const supplierRouter = router({ beginRevision, cases, get, saveDraft, submit })
