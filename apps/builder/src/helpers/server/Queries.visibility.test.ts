import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'
import { CaseAccessRepository, InvitationRepository, NotificationRepository, OnboardingCaseRepository, SubmissionRepository } from '@neo/prisma/repositories'
import { outputs } from '@neo/schemas'
import { Commands } from './Commands'
import { Queries } from './Queries'
import { Secrets, Security, type Actor } from './Security'

afterEach(() => mock.restoreAll())

function current() {
  const now = new Date()
  return {
    row: { id: 'case', tenantId: 'tenant', category: 'CALIBRATION', country: 'US', createdById: 'requester',
      createdBy: { name: 'Procurement Requester', email: 'requester@example.test' }, createdAt: now, updatedAt: now,
      requestedSite: 'Boston laboratory', revision: 4, currentNumber: 1, status: 'REJECTED' },
    policy: { documents: ['BANK'], rules: ['BANK_BENEFICIARY'] },
    snapshot: { id: 'submission', draftRevision: 5, submittedAt: now, attestedAt: now, submittedById: 'supplier',
      companyProfile: { legalName: 'Acme', registryId: 'REG123', country: 'US', jurisdiction: 'MA', addressLine1: '1 Main Street', city: 'Boston', contactName: 'Supplier Contact', contactEmail: 'supplier@example.test' },
      bankProfile: { beneficiary: 'Acme', accountLast4: '9012', accountCiphertext: Secrets.encrypt('123456789012', 'tenant'), routingCiphertext: Secrets.encrypt('021000021', 'tenant'), country: 'US', currency: 'USD' },
      taxProfile: { formType: 'W9', vatRegistered: false, taxIdCiphertext: Secrets.encrypt('12-3456789', 'tenant') },
      checkRun_submission: [], document_submission: [], workItem_submission: [], qualification_submission: [], ownershipEdge_submission: [],
      ownershipEntity_submission: [{ entityKey: 'vendor', legalName: 'Acme', country: 'US', isVendor: true }],
      decision_submission: [{ outcome: 'REJECT', rationale: 'Bank account 999988887777 does not match declared 123456789012.', createdAt: now, reviewer: { name: 'Independent Reviewer' } }],
      issue_submission: [{ id: 'issue', code: 'BANK_MISMATCH', checkRule: 'BANK_BENEFICIARY', ownerRole: 'REVIEWER', supplierMessage: 'Bank details do not match the evidence.', resolvedAt: null }],
    },
  }
}

function setup(role: string) {
  const value = current()
  mock.method(Commands, 'current', async () => value as never)
  mock.method(Security, 'buyer', async () => ({ role }) as never)
  mock.method(InvitationRepository, 'findFirst', async () => ({ id: 'invitation', recipientCiphertext: Secrets.encrypt('invited@example.test', 'tenant') }) as never)
  mock.method(NotificationRepository, 'findFirst', async () => null)
  mock.method(CaseAccessRepository, 'findMany', async () => [])
  return value
}

for (const role of ['ADMIN', 'REVIEWER', 'BUYER', 'AUDITOR']) test(`${role} sees rejection reason and vendor contacts; full financial fields require authorized roles`, async () => {
  setup(role)
  const actor = { id: 'viewer', tenantId: 'tenant', channel: Security.BUYER, verified: true } as Actor
  const detail = outputs.detail.parse(await Queries.detail(actor, 'case'))
  assert.equal(detail.case.supplierEmail, 'supplier@example.test')
  assert.equal(detail.case.requestedSite, 'Boston laboratory')
  assert.equal(detail.issues[0].checkRule, 'BANK_BENEFICIARY')
  assert.equal(detail.case.requesterName, 'Procurement Requester')
  assert.match(detail.decisions[0].rationale!, /does not match declared/)
  assert.equal(detail.decisions[0].reviewerName, 'Independent Reviewer')
  const bank = detail.values.bank as Record<string, unknown>
  const tax = detail.values.tax as Record<string, unknown>
  if (role === 'ADMIN' || role === 'REVIEWER') {
    assert.equal(bank.account, '123456789012')
    assert.equal(bank.routing, '021000021')
    assert.equal(tax.taxId, '12-3456789')
    assert.ok(detail.values.ownership)
  } else {
    assert.equal(bank.account, undefined)
    assert.equal(bank.routing, undefined)
    assert.equal(tax.taxId, undefined)
    assert.equal(detail.values.ownership, undefined)
  }
})

test('requester dashboard includes supplier submission, service site, contacts and issue summary', async () => {
  const value = current()
  mock.method(OnboardingCaseRepository, 'findMany', async () => [{ ...value.row,
    invitation_case: [], submission_case: [{ ...value.snapshot, workItem_submission: [] }],
  }] as never)
  const result = outputs.list.parse(await Queries.list({ tenantId: 'tenant' } as Actor, { limit: 25 }))
  assert.equal(result.items[0].supplierEmail, 'supplier@example.test')
  assert.equal(result.items[0].requesterEmail, 'requester@example.test')
  assert.equal(result.items[0].issueCount, 1)
  assert.match(result.items[0].issueSummary![0], /Bank details/)
  assert.ok(result.items[0].submittedAt)
})

test('buyer detail shows the supplier creator email for an invitation-free blank draft', async () => {
  const value = setup('REVIEWER')
  value.row.status = 'DRAFT'
  value.row.createdBy = { name: 'Supplier', email: 'supplier-creator@example.test' }
  value.snapshot.companyProfile = null as never
  mock.method(InvitationRepository, 'findFirst', async () => null)
  const detail = await Queries.detail({ id: 'reviewer', tenantId: 'tenant', channel: Security.BUYER, verified: true } as Actor, 'case')
  assert.equal(detail.case.supplierEmail, 'supplier-creator@example.test')
  assert.equal(detail.case.invitationDelivery, undefined)
})

test('buyer list shows supplier creator email before a self-started profile is completed', async () => {
  const value = current()
  mock.method(OnboardingCaseRepository, 'findMany', async () => [{ ...value.row, status: 'DRAFT',
    createdBy: { name: 'Supplier', email: 'supplier-creator@example.test' }, invitation_case: [], submission_case: [],
  }] as never)
  const result = await Queries.list({ tenantId: 'tenant' } as Actor, { limit: 25 })
  assert.equal(result.items[0].supplierEmail, 'supplier-creator@example.test')
  assert.equal(result.items[0].status, 'DRAFT')
})


test('only the submitting supplier can see the submitted financial identifiers', async () => {
  setup('BUYER')
  mock.method(Security, 'access', async () => ({ tenantId: 'tenant' }) as never)
  const supplier = { id: 'supplier', channel: Security.SUPPLIER, verified: true } as Actor

  const submitted = outputs.detail.parse(await Queries.detail(supplier, 'case'))
  assert.equal((submitted.values.bank as Record<string, unknown>).account, '123456789012')
  assert.equal((submitted.values.tax as Record<string, unknown>).taxId, '12-3456789')

  const shared = outputs.detail.parse(await Queries.detail({ ...supplier, id: 'other-contact' }, 'case'))
  const bank = shared.values.bank as Record<string, unknown>
  assert.equal(bank.account, undefined)
  assert.equal(bank.accountLast4, '9012')
  assert.equal((shared.values.tax as Record<string, unknown>).taxId, undefined)
})


test('a revision includes supplier correction instructions from the immediately preceding submission', async () => {
  const value = setup('ADMIN')
  Object.assign(value.snapshot, { number: 2 })
  value.row.currentNumber = 2
  const previous = mock.method(SubmissionRepository, 'findFirst', async () => ({
    issue_submission: [
      { supplierMessage: 'Upload a new certificate.' },
      { supplierMessage: 'Upload a new certificate.' },
    ],
  }) as never)
  const actor = { id: 'viewer', tenantId: 'tenant', channel: Security.BUYER, verified: true } as Actor
  const detail = outputs.detail.parse(await Queries.detail(actor, 'case'))
  assert.deepEqual(detail.previousCorrectionInstructions, ['Upload a new certificate.'])
  assert.equal(previous.mock.callCount(), 1)
})
