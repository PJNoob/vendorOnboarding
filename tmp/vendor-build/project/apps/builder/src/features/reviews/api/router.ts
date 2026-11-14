import { router } from '@/helpers/server/trpc'

import { decide } from './decide'
import { resolveIssue } from './resolveIssue'

export const reviewsRouter = router({ decide, resolveIssue })
