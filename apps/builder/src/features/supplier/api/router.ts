import { router } from '@/helpers/server/trpc'

import { beginRevision } from './beginRevision'
import { cases } from './cases'
import { create } from './create'
import { get } from './get'
import { saveDraft } from './saveDraft'
import { submit } from './submit'

export const supplierRouter = router({ beginRevision, cases, create, get, saveDraft, submit })
