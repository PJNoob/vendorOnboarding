import { documentsRouter } from '@/features/documents/api/router'
import { identityRouter } from '@/features/identity/api/router'
import { invitationsRouter } from '@/features/invitations/api/router'
import { supplierRouter } from '@/features/supplier/api/router'
import { router } from '../trpc'

export const internalRouter = router({ documents: documentsRouter, identity: identityRouter, invitations: invitationsRouter, supplier: supplierRouter })
