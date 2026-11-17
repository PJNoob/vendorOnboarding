import type { Output } from '@neo/schemas'

import { outcome, pendingReason } from './status'

type Detail = Output<'detail'>

const CHECK_TITLES: Record<string, string> = {
  BANK_BENEFICIARY: 'Bank beneficiary matches the company',
  CERTIFICATE_SCOPE: 'Certificate covers the requested site and activity',
  DOCUMENT_TYPE: 'Each file is the document it was uploaded as',
  ENTITY_CONSISTENCY: 'Registration matches the company details',
  OWNERSHIP_SCREENING: 'Ownership chain is clear of sanctioned parties',
  TAX_PROFILE: 'Tax identifier is valid for the country and evidenced',
}

const dateFormat = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

function headline(detail: Detail, supplier: boolean) {
  const result = outcome(detail.case)
  // Decisions arrive newest first.
  const final = detail.decisions.find((item) => item.outcome === 'APPROVE' || item.outcome === 'REJECT')
  const when = final ? ` on ${dateFormat.format(new Date(final.at))}` : ''
  if (result === 'Approved') return `Approved${when}. Every mandatory check passed and ${final?.reviewerName ?? 'a reviewer'} recorded the approval.`
  if (result === 'Rejected') return `Rejected${when}.${final?.rationale ? ` Reason: ${final.rationale}` : ''}`
  const reason = pendingReason(detail.case, supplier)
  return `${reason.charAt(0).toUpperCase()}${reason.slice(1)}.`
}

/** Plain-language explanation of the case status, so the reasoning is visible without opening each check. */
export function DecisionSummary({ detail, supplier }: { detail: Detail; supplier: boolean }) {
  const result = outcome(detail.case)
  // Check runs arrive newest attempt first; keep the latest result per rule.
  const latestChecks = new Map<string, Detail['checks'][number]>()
  for (const check of detail.checks) if (!latestChecks.has(check.rule)) latestChecks.set(check.rule, check)
  const issueFor = (rule: string) => detail.issues.find((issue) => issue.checkRule === rule)
  const manual = detail.issues.filter((issue) => !issue.checkRule && issue.message)
  return <section className={`decision-summary decision-${result.toLowerCase()}`} aria-label="Why this status">
    <p className="decision-eyebrow">Why this status</p>
    <h3>{result}</h3>
    <p>{headline(detail, supplier)}</p>
    {!supplier && latestChecks.size > 0 && <ul className="decision-reasons">
      {[...latestChecks.values()].map((check) => {
        const passed = check.result === 'PASS'
        const issue = issueFor(check.rule)
        return <li key={check.rule} className={passed ? 'reason-pass' : 'reason-fail'}>
          <span aria-hidden="true">{passed ? '✓' : '!'}</span>
          <span><strong>{CHECK_TITLES[check.rule] ?? check.rule}</strong>{passed ? ' — passed'
            : ` — needs attention${issue?.message ? `: ${issue.message}` : issue?.owner === 'COMPLIANCE' ? ': held for compliance review' : ''}`}</span>
        </li>
      })}
      {manual.map((issue) => <li key={issue.id} className="reason-fail"><span aria-hidden="true">!</span>
        <span><strong>Correction requested</strong> — {issue.message}</span></li>)}
    </ul>}
    {supplier && result === 'Pending' && detail.issues.some((issue) => issue.message) && <p className="muted">See “Needs attention” below for exactly what to change.</p>}
  </section>
}
