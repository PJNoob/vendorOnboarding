import { accessRouter } from '@/features/access/api/router'
import { analyticsRouter } from '@/features/analytics/api/router'
import { auditRouter } from '@/features/audit/api/router'
import { casesRouter } from '@/features/cases/api/router'
import { complianceRouter } from '@/features/compliance/api/router'
import { reviewsRouter } from '@/features/reviews/api/router'
import { runsRouter } from '@/features/runs/api/router'
import { teamRouter } from '@/features/team/api/router'
import { workRouter } from '@/features/work/api/router'
import { router } from '../trpc'

export const publicRouter = router({ access: accessRouter, analytics: analyticsRouter, audit: auditRouter, cases: casesRouter, compliance: complianceRouter, reviews: reviewsRouter, runs: runsRouter, team: teamRouter, work: workRouter })
