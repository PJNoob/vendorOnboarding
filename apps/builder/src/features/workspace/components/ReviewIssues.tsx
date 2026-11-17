import type { FormEvent } from 'react'

import type { Output } from '@neo/schemas'

import { DOCUMENT_LABELS } from './VerificationReport'

type Detail = Output<'detail'>
type Issue = Detail['issues'][number]
type Role = Output<'identity'>['memberships'][number]['role']

const RULES: Record<string, { title: string; document: string; guidance: string }> = {
  ADVERSE_SCREENING: {
    title: 'Public ban or sanction search',
    document: '',
    guidance: 'Open the cited pages and confirm whether they refer to this vendor or owner. If they do, escalate to compliance; if not, resolve the issue.',
  },
  COUNTRY_RESTRICTION: {
    title: 'Banned country',
    document: '',
    guidance: 'Check the country of the supplier, its bank and its owners against the banned-country list and escalate to compliance if one is listed.',
  },
  BANK_BENEFICIARY: {
    title: 'Bank beneficiary and account',
    document: 'BANK',
    guidance: 'Compare the beneficiary and account number in the bank evidence with the submitted banking details.',
  },
  CERTIFICATE_SCOPE: {
    title: 'Certificate scope',
    document: 'CERTIFICATE',
    guidance: 'Check that the current certificate or scope annex covers the requested site and activity.',
  },
  ENTITY_CONSISTENCY: {
    title: 'Company registration',
    document: 'REGISTRATION',
    guidance: 'Compare the legal name and registration ID with the registration document.',
  },
  OWNERSHIP_SCREENING: {
    title: 'Ownership declaration',
    document: 'OWNERSHIP',
    guidance: 'Check that the declaration identifies the supplier by its registration ID and that the ownership links total 100% at each level.',
  },
  DOCUMENT_TYPE: {
    title: 'Wrong document type',
    document: '',
    guidance: 'Open the cited file and confirm whether it is the kind of document it was uploaded as. If not, request the correct document from the supplier.',
  },
  TAX_PROFILE: {
    title: 'Tax registration',
    document: 'TAX',
    guidance: 'Compare the declared tax ID or VAT registration number with the tax evidence.',
  },
}

const RULE_BY_ISSUE_CODE: Record<string, string> = {
  BANK_MISMATCH: 'BANK_BENEFICIARY',
  SCOPE_MISMATCH: 'CERTIFICATE_SCOPE',
  REGISTRATION_MISMATCH: 'ENTITY_CONSISTENCY',
  OWNERSHIP_INCOMPLETE: 'OWNERSHIP_SCREENING',
  OWNERSHIP_POSSIBLE_MATCH: 'OWNERSHIP_SCREENING',
  OWNERSHIP_BLOCKED_CHAIN: 'OWNERSHIP_SCREENING',
  TAX_MISMATCH: 'TAX_PROFILE',
  TAX_FORMAT_INVALID: 'TAX_PROFILE',
  DOCUMENT_TYPE_MISMATCH: 'DOCUMENT_TYPE',
  ADVERSE_MEDIA_MATCH: 'ADVERSE_SCREENING',
  SCREENING_UNAVAILABLE: 'ADVERSE_SCREENING',
  COUNTRY_BANNED: 'COUNTRY_RESTRICTION',
  OWNER_COUNTRY_BANNED: 'COUNTRY_RESTRICTION',
}

const HOLD_REASONS: Record<string, string> = {
  ADVERSE_MEDIA_MATCH: 'A web search found pages linking the vendor or an owner to a ban, sanction or debarment. The trace lists the pages.',
  OWNER_COUNTRY_BANNED: 'An owner in the ownership declaration is registered in a banned country.',
  OWNERSHIP_POSSIBLE_MATCH: 'The screening provider found a possible match for an entity in the ownership declaration.',
  OWNERSHIP_BLOCKED_CHAIN: 'Ownership screening identified a blocked party in the ownership chain.',
}

const FIELDS: Record<string, string> = {
  legal_name: 'legal name',
  registry_id: 'registration ID',
  account: 'account number',
  tax_id: 'tax ID',
  vat_id: 'VAT registration number',
}

const DOCUMENT_NAMES: Record<string, string> = {
  BANK: 'bank',
  CERTIFICATE: 'certificate',
  OWNERSHIP: 'ownership',
  REGISTRATION: 'registration',
  TAX: 'tax',
}

function issueMessage(issue: Issue) {
  if (issue.code !== 'DOCUMENT_REVIEW_REQUIRED') return issue.message || HOLD_REASONS[issue.code]
  return issue.message.replace(/\b(legal_name|registry_id|account|tax_id|vat_id)\b/g, (field) => FIELDS[field])
    .replace(/\b(BANK|CERTIFICATE|OWNERSHIP|REGISTRATION|TAX)\b/g, (kind) => DOCUMENT_NAMES[kind])
}

export function ReviewIssues({ detail, role, busy, onResolve }: {
  detail: Detail
  role: Role
  busy: boolean
  onResolve: (issue: Issue, event: FormEvent<HTMLFormElement>) => void
}) {
  const pending = detail.case.status === 'PENDING'
  const canRequest = pending && (role === 'ADMIN' || role === 'BUYER' || role === 'REVIEWER')
  const cleanDocuments = detail.documents.filter((document) => document.status === 'CLEAN')
  const evidenceOptions = cleanDocuments.map((document) => {
    const sameKind = cleanDocuments.filter(({ kind }) => kind === document.kind)
    const label = DOCUMENT_LABELS[document.kind]
    const number = sameKind.findIndex(({ id }) => id === document.id) + 1
    return { ...document, label: sameKind.length > 1 ? `${label} (${number})` : label }
  })

  return <section className="review-issues" aria-label="Issues to review">
    <div className="review-issues-heading">
      <h3>Issues to review <span className="count-label">{detail.issues.length}</span></h3>
      {canRequest && <a href="#request-corrections">Request supplier corrections</a>}
    </div>
    {canRequest && <p className="review-issues-intro">Request corrections if the supplier needs to change their details or upload new evidence. Approval requires all mandatory checks to pass.</p>}
    <div className="review-issue-list">
      {detail.issues.map((issue) => {
        const ruleKey = issue.checkRule ?? RULE_BY_ISSUE_CODE[issue.code]
        const rule = RULES[ruleKey]
        const compliance = issue.owner === 'COMPLIANCE'
        const canResolve = pending && (role === 'ADMIN' || (compliance ? role === 'COMPLIANCE' : role === 'REVIEWER'))
        const title = compliance ? 'Ownership screening hold' : rule?.title ??
          (issue.code === 'MANUAL_CORRECTION' ? 'Supplier correction' : 'Document review')
        const message = issueMessage(issue) || 'The review recorded an issue that requires attention.'
        const check = detail.checks.find((item) => item.rule === ruleKey)
        const canClearHold = (check?.code ?? issue.code) === 'OWNERSHIP_POSSIBLE_MATCH'
        const cited = new Set(check?.evidence.map((entry) => entry.documentId))
        const related = evidenceOptions.filter((document) => cited.has(document.id) || document.kind === rule?.document)
        const other = evidenceOptions.filter((document) => !related.includes(document))
        const options = (documents: typeof evidenceOptions) => documents.map((document) => {
          const pages = [...new Set(check?.evidence.filter((entry) => entry.documentId === document.id).map((entry) => entry.page))]
          return <label className="review-evidence-option" key={document.id}>
            <input type="checkbox" name="document" value={document.id} />
            <span>{document.label}{pages.length > 0 && <small> · {pages.length === 1 ? 'Page' : 'Pages'} {pages.join(', ')}</small>}</span>
          </label>
        })

        return <details className="review-issue" key={issue.id} name="case-review-issue">
          <summary>
            <span><strong>{title}</strong><span className="review-issue-reason">{message}</span></span>
            <span className="review-issue-chevron" aria-hidden="true" />
          </summary>
          <div className="review-issue-body">
            <p><strong>What to check</strong><br />{compliance
              ? 'Review the screening evidence and verify the identity of the matched entity before recording a disposition.'
              : rule?.guidance ?? 'Confirm that the submitted information addresses the issue above.'}</p>
            {canResolve && evidenceOptions.length > 0 && <form className="review-issue-form" onSubmit={(event) => onResolve(issue, event)}>
              <fieldset>
                <legend>Supporting documents</legend>
                <p className="review-issue-hint">Select at least one PDF that supports your decision. <a href="#supporting-documents">View uploaded PDFs</a></p>
                {options(related.length ? related : other)}
                {related.length > 0 && other.length > 0 && <details className="review-other-evidence">
                  <summary>Other uploaded PDFs</summary>
                  {options(other)}
                </details>}
              </fieldset>
              {compliance && <label className="review-issue-field">Disposition
                <select name="disposition" required defaultValue="">
                  <option value="" disabled>Select an outcome</option>
                  <option value="CONFIRMED">Confirm screening hold</option>
                  {canClearHold && <option value="CLEARED">Clear possible match</option>}
                </select>
              </label>}
              <label className="review-issue-field">Resolution notes
                <textarea name="rationale" required minLength={10} maxLength={1000} rows={3}
                  placeholder="Explain what you verified and how the selected evidence supports your decision." />
              </label>
              <button className="primary-button" disabled={busy}>{compliance ? 'Record disposition' : 'Resolve issue'}</button>
            </form>}
            {canResolve && !evidenceOptions.length && <p className="review-issue-hint">A clean supporting PDF is required before you can record a resolution.</p>}
          </div>
        </details>
      })}
    </div>
  </section>
}
