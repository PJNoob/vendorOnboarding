import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Output } from '@neo/schemas'
import { SupplierDetails } from './SupplierDetails'
import { Workspace } from './Workspace'

const summary = { caseId: 'case', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), number: 1,
  revision: 4, name: 'QA Vendor', requestedSite: 'Boston laboratory', status: 'REJECTED' as const,
  supplierEmail: 'supplier@example.test', requesterName: 'Requester', issueCount: 1,
  issueSummary: ['Account differs from the bank evidence.'], submittedAt: new Date().toISOString() }

test('rejection view displays decision rationale, email, service site and all submitted profile sections', () => {
  const detail = { case: summary, decisions: [{ outcome: 'REJECT', at: summary.updatedAt, rationale: 'Rejected because declared account 1234 differs from document account 9999.', reviewerName: 'Test Reviewer' }],
    issues: [{ id: 'issue', code: 'BANK_MISMATCH', owner: 'REVIEWER', message: 'Account differs from the bank evidence.' }],
    values: { request: { requesterName: 'Requester', requesterEmail: 'requester@example.test', activity: 'CALIBRATION' }, invitation: { email: 'invited@example.test' },
      company: { legalName: 'QA Vendor', contactName: 'Contact', contactEmail: 'supplier@example.test', registryId: 'REG123', country: 'US', jurisdiction: 'MA', addressLine1: '1 Main Street', city: 'Boston' },
      bank: { account: '1234', routing: '021000021', beneficiary: 'QA Vendor', country: 'US', currency: 'USD' }, tax: { formType: 'W9', taxId: '12-3456789', vatRegistered: false },
      qualifications: [{ activity: 'CALIBRATION', site: 'Boston laboratory', standard: 'ISO17025' }], ownership: { entities: [{ key: 'vendor', legalName: 'QA Vendor', isVendor: true, country: 'US' }], edges: [{ ownerKey: 'owner', ownedKey: 'vendor', percentage: '100' }] } },
  } as unknown as Output<'detail'>
  const html = renderToStaticMarkup(createElement(SupplierDetails, { detail }))
  for (const text of ['Reason for rejection', 'declared account 1234 differs from document account 9999', 'supplier@example.test', 'invited@example.test', 'Boston laboratory', 'Company details', 'Banking details', '021000021', 'Tax details', '12-3456789', 'Qualifications', 'ISO17025', 'Ownership declaration', 'Ownership percentage', 'Decision history', 'Test Reviewer']) assert.ok(html.includes(text), text)
})

test('supplier requests and actionable issues appear on the requester overview', () => {
  class RequesterWorkspace extends Workspace {
    constructor(props: Workspace['props']) { super(props); this.state = { ...this.state, loading: false, email: 'requester@example.test', tenantId: 'tenant',
      memberships: [{ id: 'membership', tenantId: 'tenant', role: 'BUYER' }], cases: [{ ...summary, status: 'PENDING' }] } }
  }
  const html = renderToStaticMarkup(createElement(RequesterWorkspace, { countries: [] }))
  for (const text of ['Supplier requests &amp; issues', 'supplier@example.test', 'Boston laboratory', '1 open issues', 'Account differs from the bank evidence.', 'Review request']) assert.ok(html.includes(text), text)
})

function supplierDetail(status: Output<'detail'>['case']['status']): Output<'detail'> {
  return {
    case: { ...summary, issueCount: 0, status, submittedAt: status === 'DRAFT' ? undefined : summary.submittedAt },
    checks: [], decisions: [], issues: [], required: ['BANK', 'TAX'], draftRevision: 4,
    documents: [
      { id: 'bank', kind: 'BANK', status: 'CLEAN' },
      { id: 'tax', kind: 'TAX', status: status === 'DRAFT' ? 'UPLOADED' : 'CLEAN' },
    ],
    run: { stages: [] }, submissionId: 'submission',
    values: {
      company: { legalName: 'QA Vendor' },
      bank: { beneficiary: 'QA Vendor', account: '123456789012' },
      ...(status !== 'DRAFT' ? { tax: { formType: 'W9', taxId: '12-3456789' } } : {}),
      qualifications: [{ activity: 'Calibration', site: 'Boston laboratory', standard: 'ISO17025' }],
      ownership: { entities: [{ key: 'vendor', country: 'US', legalName: 'QA Vendor', isVendor: true }], edges: [] },
    },
  }
}

function renderSupplier(detail: Output<'detail'>) {
  class SupplierWorkspace extends Workspace {
    constructor(props: Workspace['props']) {
      super(props)
      this.state = { ...this.state, loading: false, email: 'supplier@example.test', authChannel: 'EMAIL_OTP', detail }
    }
  }
  return renderToStaticMarkup(createElement(SupplierWorkspace, { countries: [{ code: 'US', name: 'United States' }] }))
}

test('draft steps show saved sections and wait for clean PDFs before marking Documents complete', () => {
  const detail = supplierDetail('DRAFT')
  const html = renderSupplier(detail)
  for (const step of ['Company', 'Banking', 'Qualifications', 'Ownership']) {
    assert.ok(html.includes(step + '<span class="sr-only"> saved</span>'), step)
  }
  assert.doesNotMatch(html, /Tax<span class="sr-only"> saved/)
  assert.doesNotMatch(html, /Documents<span class="sr-only"> complete/)
  detail.documents[1].status = 'CLEAN'
  assert.match(renderSupplier(detail), /Documents<span class="sr-only"> complete/)
})

test('supplier can reopen a submitted application as a read-only record throughout review', () => {
  for (const status of ['SUBMITTED', 'PENDING', 'APPROVED'] as const) {
    const html = renderSupplier(supplierDetail(status))
    for (const label of ['Submitted application', 'Company details', 'Banking details', 'Tax details', 'Ownership declaration',
      'ISO17025', '123456789012', '12-3456789', 'Supporting documents', 'Download']) assert.ok(html.includes(label), label)
    if (status !== 'APPROVED') assert.match(html, /Submitted for review/)
    assert.doesNotMatch(html, /Application steps|Save company|Upload supporting document|Submit for review|>Remove</)
  }
})

test('the supplier sees which saved steps still block submission', () => {
  assert.match(renderSupplier(supplierDetail('DRAFT')), /Required before submission: Tax, Documents\./)
})

test('the Admin can record a decision only after verification is finished', () => {
  function renderAdmin(status: Output<'detail'>['case']['status']) {
    class AdminWorkspace extends Workspace {
      constructor(props: Workspace['props']) {
        super(props)
        this.state = { ...this.state, loading: false, email: 'admin@example.test', tenantId: 'tenant',
          memberships: [{ id: 'membership', tenantId: 'tenant', role: 'ADMIN' }], detail: supplierDetail(status) }
      }
    }
    return renderToStaticMarkup(createElement(AdminWorkspace, { countries: [] }))
  }

  assert.match(renderAdmin('PENDING'), /Record decision/)
  assert.doesNotMatch(renderAdmin('DRAFT'), /Record decision/)
  const submitting = renderAdmin('SUBMITTED')
  assert.doesNotMatch(submitting, /Record decision/)
  assert.match(submitting, /AI verification status/)
})

test('the review queue includes applications undergoing automated verification', () => {
  class ReviewQueue extends Workspace {
    constructor(props: Workspace['props']) {
      super(props)
      this.state = { ...this.state, loading: false, email: 'admin@example.test', tenantId: 'tenant', view: 'reviews',
        memberships: [{ id: 'membership', tenantId: 'tenant', role: 'ADMIN' }], cases: [
          { ...summary, status: 'SUBMITTED', name: 'Awaiting automated checks' },
          { ...summary, caseId: 'draft', status: 'DRAFT', name: 'Draft only' },
        ] }
    }
  }

  const html = renderToStaticMarkup(createElement(ReviewQueue, { countries: [] }))
  assert.match(html, /Awaiting automated checks/)
  assert.doesNotMatch(html, /Draft only|All suppliers/)
})
