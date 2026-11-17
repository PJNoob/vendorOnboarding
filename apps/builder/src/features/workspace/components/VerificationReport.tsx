import type { Output } from '@neo/schemas'

type Detail = Output<'detail'>

const CHECK_LABELS = {
  BANK_BENEFICIARY: 'Bank beneficiary and account',
  CERTIFICATE_SCOPE: 'Certificate scope',
  ENTITY_CONSISTENCY: 'Company identity',
  TAX_PROFILE: 'Tax profile',
} as const

const COMPARISON_LABELS = {
  MATCH: 'Match',
  MISMATCH: 'Mismatch',
  MISSING_EVIDENCE: 'Evidence missing',
} as const

const COMPARISON_STYLES = {
  MATCH: 'match',
  MISMATCH: 'mismatch',
  MISSING_EVIDENCE: 'review',
} as const

const RESOLUTION_LABELS = {
  DIFFERENT_ROLE: 'Resolved: different purpose',
  SAME_ENTITY: 'Resolved: same value',
  UNRESOLVED: 'Needs review',
} as const

const FIELD_LABELS: Record<string, string> = {
  account: 'Account number',
  activity: 'Activity',
  address: 'Address',
  expires_on: 'Expiry date',
  legal_name: 'Legal name',
  registry_id: 'Registration ID',
  site: 'Service site',
  standard: 'Standard',
  tax_id: 'Tax ID',
  vat_id: 'VAT ID',
}

export const DOCUMENT_LABELS: Record<string, string> = {
  BANK: 'Bank evidence',
  CERTIFICATE: 'Certificate',
  OWNERSHIP: 'Ownership declaration',
  REGISTRATION: 'Registration',
  TAX: 'Tax evidence',
}

export function VerificationReport({ report, documents }: {
  report: NonNullable<Detail['verificationReport']>
  documents: Detail['documents']
}) {
  const matches = report.findings.filter((finding) => finding.result === 'PASS').length
  const needsReview = report.findings.length - matches

  return <details className="check-details verification-report" open>
    <summary>Cross-document verification <span className={`verification-result ${needsReview ? 'review' : 'match'}`}>
      {report.recommendation === 'CONSISTENT' ? 'Consistent' : 'Needs review'}
    </span></summary>

    {report.findings.length > 0 && <>
      <figure className="verification-chart">
        <figcaption>Check results</figcaption>
        <div className="verification-chart-track" role="img"
          aria-label={`${matches} matching, ${needsReview} requiring review`}>
          {matches > 0 && <span className="match" style={{ flexGrow: matches }} />}
          {needsReview > 0 && <span className="review" style={{ flexGrow: needsReview }} />}
        </div>
        <div className="verification-chart-legend">
          <span><i className="match" />{matches} matching</span>
          <span><i className="review" />{needsReview} need review</span>
        </div>
      </figure>

      <div className="table-scroll verification-table">
        <table>
          <caption>Verification findings</caption>
          <thead><tr><th scope="col">Check</th><th scope="col">Result</th><th scope="col">Finding</th></tr></thead>
          <tbody>{report.findings.map((finding) => <tr key={finding.rule}>
            <th scope="row">{CHECK_LABELS[finding.rule]}</th>
            <td><span className={`verification-result ${finding.result === 'PASS' ? 'match' : 'review'}`}>
              {finding.result === 'PASS' ? 'Matching' : 'Needs review'}
            </span></td>
            <td>{finding.message || 'No additional details recorded.'}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </>}

    {report.findings.map((finding) => {
      if (!finding.comparisons?.length && !finding.evidence.length && !finding.resolutions?.length) return null
      return <details className="verification-evidence" key={finding.rule}>
        <summary>{CHECK_LABELS[finding.rule]} evidence</summary>
        {!!finding.comparisons?.length && <div className="table-scroll verification-table">
          <table>
            <caption>Declared and extracted values</caption>
            <thead><tr><th scope="col">Field</th><th scope="col">Document</th><th scope="col">Supplier declared</th>
              <th scope="col">Document shows</th><th scope="col">Comparison</th></tr></thead>
            <tbody>{finding.comparisons.map((entry, index) => <tr key={`${entry.field}-${entry.kind}-${index}`}>
              <th scope="row">{FIELD_LABELS[entry.field] ?? entry.field}</th>
              <td>{DOCUMENT_LABELS[entry.kind]}</td>
              <td>{entry.declared}</td>
              <td>{entry.observed.length ? entry.observed.join(' · ') : 'No supported value'}</td>
              <td><span className={`verification-result ${COMPARISON_STYLES[entry.status]}`}>
                {COMPARISON_LABELS[entry.status]}
              </span></td>
            </tr>)}</tbody>
          </table>
        </div>}
        {!!finding.resolutions?.length && <div className="table-scroll verification-table">
          <table>
            <caption>Differences reviewed by the analysis agent</caption>
            <thead><tr><th scope="col">Field</th><th scope="col">Outcome</th><th scope="col">Reason</th></tr></thead>
            <tbody>{finding.resolutions.map((entry, index) => <tr key={`${entry.field}-${index}`}>
              <th scope="row">{FIELD_LABELS[entry.field] ?? entry.field}</th>
              <td>{RESOLUTION_LABELS[entry.verdict]}</td>
              <td>{entry.reason}</td>
            </tr>)}</tbody>
          </table>
        </div>}
        {finding.evidence.length > 0 && <div className="table-scroll verification-table">
          <table>
            <caption>Quoted document evidence</caption>
            <thead><tr><th scope="col">Field</th><th scope="col">Source</th><th scope="col">Extracted value</th>
              <th scope="col">OCR excerpt</th></tr></thead>
            <tbody>{finding.evidence.map((entry, index) => {
              const document = documents.find((item) => item.id === entry.documentId)
              const label = document ? DOCUMENT_LABELS[document.kind] : 'Document'
              const duplicate = document && documents.some((item) => item.kind === document.kind && item.id !== document.id)
              return <tr key={`${entry.documentId}-${entry.page}-${entry.field}-${index}`}>
                <th scope="row">{FIELD_LABELS[entry.field] ?? entry.field}</th>
                <td title={entry.documentId}>{label}{duplicate ? ` (${entry.documentId.slice(-6)})` : ''}, page {entry.page}</td>
                <td>{entry.value}</td>
                <td><q>{entry.quote}</q></td>
              </tr>
            })}</tbody>
          </table>
        </div>}
      </details>
    })}

    <details className="verification-evidence">
      <summary>Analysis APIs and MCP tools</summary>
      <div className="table-scroll verification-table">
        <table>
          <caption>Processing and evidence access</caption>
          <thead><tr><th scope="col">Step</th><th scope="col">Service or tool</th><th scope="col">Purpose</th></tr></thead>
          <tbody>
            <tr><th scope="row">OCR</th><td>Gemini on Vertex AI</td><td><code>POST /v1/extract/&#123;documentId&#125;</code> on the private document service extracts page text.</td></tr>
            <tr><th scope="row">AI analysis</th><td>LangGraph and Gemini on Vertex AI</td><td><code>POST /v1/verify</code> on the private document service compares fields and records findings. Report version <code>{report.version}</code>.</td></tr>
            <tr><th scope="row">Case report</th><td><code>GET /api/v1/cases/get</code></td><td>Returns this saved report to authorized workspace roles.</td></tr>
            <tr><th scope="row">MCP evidence</th><td><code>POST /api/mcp</code></td><td><code>get_certificate_scope_evidence</code> and <code>get_screening_evidence</code> read saved evidence. The worker runs the analysis automatically.</td></tr>
          </tbody>
        </table>
      </div>
    </details>
  </details>
}
