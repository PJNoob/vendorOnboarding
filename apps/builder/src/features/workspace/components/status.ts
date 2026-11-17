import type { Output } from '@neo/schemas'

type Row = Pick<Output<'list'>['items'][number], 'issueCount' | 'status'>

export type Outcome = 'Approved' | 'Pending' | 'Rejected'

/** Every case resolves to one of the three outcomes the onboarding process reports. */
export function outcome(row: Pick<Row, 'status'>): Outcome {
  if (row.status === 'APPROVED') return 'Approved'
  if (row.status === 'REJECTED') return 'Rejected'
  return 'Pending'
}

/** Why a pending case is pending, in the words the buyer or supplier needs. */
export function pendingReason(row: Row, supplier = false) {
  switch (row.status) {
    case 'INVITED': return supplier ? 'Accept the invitation to begin' : 'Waiting for the supplier to accept'
    case 'DRAFT': return supplier ? 'Complete and submit your application' : 'Supplier is completing the application'
    case 'SUBMITTED': return 'Automated checks are running'
    case 'PENDING': return row.issueCount
      ? `${row.issueCount} open ${row.issueCount === 1 ? 'issue' : 'issues'} before a decision`
      : supplier ? 'Under review by procurement' : 'Ready for a decision'
    default: return ''
  }
}

export type StageTone = 'attention' | 'done' | 'running' | 'waiting'

const DONE = new Set(['APPROVED', 'CLEAN', 'CLEAR', 'RECORDED', 'SENT', 'STARTED', 'SUCCEEDED'])
const RUNNING = new Set(['CHECKING', 'LEASED', 'PENDING', 'QUEUED', 'READY', 'RUNNING', 'SUBMITTED'])
const ATTENTION = new Set(['ACTION REQUIRED', 'FAILED', 'HOLD', 'PROVIDER UNAVAILABLE', 'REJECTED'])

/** Visual tone of a run stage, from the persisted stage state. */
export function stageTone(state: string): StageTone {
  const key = state.toUpperCase()
  if (ATTENTION.has(key)) return 'attention'
  if (DONE.has(key)) return 'done'
  if (RUNNING.has(key)) return 'running'
  return 'waiting'
}

export const STAGE_HELP: Record<string, string> = {
  Intake: 'Invitation accepted and application started',
  Documents: 'Virus scan and quarantine release of every PDF',
  Extraction: 'OCR and AI field extraction with page quotes',
  Checks: 'Declared details cross-checked against evidence',
  Screening: 'Ownership chain screened against sanctions data',
  Decision: 'Approved, pending or rejected',
  'Follow-up': 'Status email sent to the supplier',
}
