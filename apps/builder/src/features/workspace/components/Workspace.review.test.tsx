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
