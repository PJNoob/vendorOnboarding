import type { Output } from '@neo/schemas'

type Detail = Output<'detail'>
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const display = (value: unknown) => value === true ? 'Yes' : value === false ? 'No' : value === undefined || value === null || value === '' ? 'Not provided' : String(value)

function Fields({ title, values, fields }: { title: string; values: Record<string, unknown>; fields: [string, string][] }) {
  return <section className="submitted-section"><h3>{title}</h3><dl className="submitted-fields">{fields.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{display(values[key])}</dd></div>)}</dl></section>
}

export function SupplierDetails({ detail, supplier = false }: { detail: Detail; supplier?: boolean }) {
  const request = object(detail.values.request)
  const invitation = object(detail.values.invitation)
  const bank = object(detail.values.bank)
  const tax = object(detail.values.tax)
  const routingFields: [string, string][] = !supplier || 'routing' in bank ? [['routing', 'Routing number']] : []
  const taxIdentifierFields: [string, string][] = !supplier || 'taxId' in tax ? [['taxId', 'Tax ID'], ['vatTrn', 'VAT / GST registration number']] : []
  const ownership = object(detail.values.ownership)
  const final = detail.decisions.find((decision) => ['APPROVE', 'REJECT'].includes(decision.outcome))
  const rejected = final?.outcome === 'REJECT'
  const qualifications = Array.isArray(detail.values.qualifications) ? detail.values.qualifications : []
  const entities = Array.isArray(ownership.entities) ? ownership.entities : []
  const edges = Array.isArray(ownership.edges) ? ownership.edges : []
  const entityName = (key: unknown) => object(entities.find((entry) => object(entry).key === key)).legalName || key
  return <div className="submitted-profile">
    {!supplier && final && <section className={rejected ? 'decision-summary rejected-decision' : 'decision-summary approved-decision'} aria-label={rejected ? 'Reason for rejection' : 'Approval decision'}>
      <h3>{rejected ? 'Reason for rejection' : 'Approval decision'}</h3>
      <p>{final.rationale || (rejected ? 'No reviewer rationale was recorded. Review the verification issues below.' : 'Approved by the independent reviewer.')}</p>
      {rejected && detail.issues.length > 0 && <ul>{detail.issues.map((issue) => <li key={issue.id}>{issue.message || issue.code.replaceAll('_', ' ')}</li>)}</ul>}
      <small>{final.reviewerName ? `Decision by ${final.reviewerName} · ` : ''}{new Date(final.at).toLocaleString()}</small>
    </section>}
    <Fields title="Vendor contact & service request" values={{ ...request, supplierEmail: detail.case.supplierEmail, invitedEmail: invitation.email, serviceSite: detail.case.requestedSite }} fields={[
      ['supplierEmail', 'Supplier email'], ...(!supplier ? [['invitedEmail', 'Invited email'] as [string, string]] : []), ['serviceSite', 'Requested service site'], ['activity', 'Requested activity'],
      ['country', 'Invitation country'], ['requesterName', 'Requester'], ['requesterEmail', 'Requester email'], ['createdAt', 'Request created'], ['submittedAt', 'Supplier submitted'], ['attestedAt', 'Supplier attested'],
    ]} />
    <Fields title="Company details" values={object(detail.values.company)} fields={[
      ['legalName', 'Legal name'], ['registryId', 'Registration ID'], ['jurisdiction', 'Jurisdiction'], ['country', 'Country'],
      ['addressLine1', 'Street address'], ['addressLine2', 'Address line 2'], ['city', 'City'], ['postalCode', 'Postal code'], ['contactName', 'Contact name'], ['contactEmail', 'Contact email'],
    ]} />
    <Fields title="Banking details" values={bank} fields={[
      ['beneficiary', 'Beneficiary'], [typeof bank.account === 'string' ? 'account' : 'accountLast4', typeof bank.account === 'string' ? 'Account number' : 'Account ending'],
      ...routingFields,
      ['country', 'Bank country'], ['currency', 'Currency'],
    ]} />
    <Fields title="Tax details" values={tax} fields={[
      ['formType', 'Tax form'], ['vatRegistered', 'VAT registered'],
      ...taxIdentifierFields,
    ]} />
    <section className="submitted-section"><h3>Qualifications & service sites</h3>{qualifications.length ? qualifications.map((value, index) => <Fields key={index} title={`Qualification ${index + 1}`} values={object(value)} fields={[
      ['activity', 'Activity'], ['site', 'Service site'], ['standard', 'Standard'],
    ]} />) : <p>Not provided</p>}</section>
    <section className="submitted-section"><h3>Ownership declaration</h3>{entities.length ? <>
      {entities.map((value, index) => <Fields key={index} title={`Entity ${index + 1}`} values={object(value)} fields={[
        ['legalName', 'Legal name'], ['registryId', 'Registration ID'], ['country', 'Country'], ['isVendor', 'Vendor entity'],
      ]} />)}
      {edges.map((value, index) => <Fields key={index} title={`Ownership link ${index + 1}`} values={{ ...object(value), ownerName: entityName(object(value).ownerKey), ownedName: entityName(object(value).ownedKey) }} fields={[
        ['ownerName', 'Owner'], ['ownedName', 'Owned entity'], ['percentage', 'Ownership percentage'], ['evidenceDocumentId', 'Evidence document'],
      ]} />)}
    </> : <p>Ownership information is available to the supplier, admin, reviewer and compliance team.</p>}</section>
    {!supplier && detail.decisions.length > 0 && <section className="submitted-section"><h3>Decision history</h3>{detail.decisions.map((decision, index) => <article key={`${decision.at}-${index}`} className="decision-history"><strong>{decision.outcome.replaceAll('_', ' ')}</strong><p>{decision.rationale || 'No additional rationale recorded.'}</p><small>{decision.reviewerName || 'Reviewer'} · {new Date(decision.at).toLocaleString()}</small></article>)}</section>}
  </div>
}
