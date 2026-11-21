import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'

import {
  BaseRepository, DecisionRepository, IdempotencyRecordRepository, MembershipRepository,
  OnboardingCaseRepository, SupplierRepository,
} from '@neo/prisma/repositories'
import { inputs } from '@neo/schemas'

import { casesRouter } from '@/features/cases/api/router'
import { Commands } from './Commands'
import { ReviewService } from './ReviewService'
import { Security, type Actor } from './Security'

const actor: Actor = { channel: Security.BUYER, createdAt: new Date(), email: 'admin@example.test', id: 'admin',
  requestId: 'request', tenantId: 'tenant', verified: true }
const input = inputs.deleteSupplier.parse({ caseId: 'case', expectedCaseRevision: 2,
  idempotencyKey: 'd31e3c5a-1255-4699-aef1-55bc112d7f37', supplierId: 'supplier' })
afterEach(() => mock.restoreAll())

function setup() {
  const tx = {} as never
  mock.method(BaseRepository, 'runInTransaction', async (apply: any) => apply(tx))
  const lock = mock.method(Security, 'lock', async () => {})
  const member = { role: 'ADMIN' }
  mock.method(MembershipRepository, 'findFirst', async () => member as never)
  const records = new Map<string, any>()
  mock.method(IdempotencyRecordRepository, 'findUnique', async ({ where }: any) => records.get(where.tenantId_actorId_operation_key.operation) ?? null)
  mock.method(IdempotencyRecordRepository, 'create', async ({ data }: any) => { records.set(data.operation, data); return data })
  const current = { row: { id: 'case', revision: 2, status: 'APPROVED', createdById: 'other' },
    snapshot: { id: 'submission', submittedAt: new Date(), companyProfile: { country: 'us', jurisdiction: ' ma ', registryId: 'reg123' },
      issue_submission: [], checkRun_submission: Commands.MANDATORY_RULES.map((ruleKey) => ({ ruleKey, result: 'PASS' })) },
    policy: { rules: [] } }
  mock.method(Commands, 'current', async () => current as never)
  let registered = true
  const remove = mock.method(SupplierRepository, 'deleteMany', async ({ where }: any, transaction: any) => {
    assert.equal(transaction, tx)
    const count = registered && where.tenantId === 'tenant' && where.approvedSubmissionId === 'submission' && where.id === 'supplier' ? 1 : 0
    if (count) registered = false
    return { count }
  })
  mock.method(SupplierRepository, 'findFirst', async () => registered ? { id: 'supplier' } as never : null)
  const create = mock.method(SupplierRepository, 'create', async ({ data }: any) => { registered = true; return { id: 'new-supplier', ...data } })
  const update = mock.method(OnboardingCaseRepository, 'updateMany', async () => ({ count: 1 }))
  const audit = mock.method(Commands, 'audit', async () => {})
  mock.method(DecisionRepository, 'create', async () => ({ id: 'decision' }) as never)
  mock.method(ReviewService, 'notify', async () => {})
  return { tx, lock, member, current, remove, create, update, audit }
}

test('admin deletion is tenant scoped, audited, revision guarded and safely replayed through the API', async () => {
  const state = setup()
  const caller = casesRouter.createCaller({ actor, origin: 'http://localhost:3000' })
  const result = await caller.deleteSupplier(input)
  assert.deepEqual(result, { id: 'supplier', revision: 3 })
  assert.deepEqual(await caller.deleteSupplier(input), result)
  assert.equal(state.remove.mock.callCount(), 1)
  assert.deepEqual(state.remove.mock.calls[0].arguments[0], { where: { approvedSubmissionId: 'submission', id: 'supplier', tenantId: 'tenant' } })
  assert.deepEqual(state.update.mock.calls[0].arguments, [{ data: { revision: { increment: 1 } }, where: { id: 'case', tenantId: 'tenant' } }, state.tx])
  assert.deepEqual(state.audit.mock.calls[0].arguments, [actor, 'SUPPLIER_DELETED', 'case', state.tx, { submissionId: 'submission', supplierId: 'supplier' }])
  assert.equal(state.lock.mock.calls[0].arguments[0], 'tenant')
  await assert.rejects(caller.deleteSupplier({ ...input, supplierId: 'changed' }), { code: 'CONFLICT' })
})

test('the registration cannot be approved twice until the old approved supplier is deleted', async () => {
  const state = setup()
  state.current.row.status = 'PENDING'
  const approval = { caseId: 'new-case', expectedCaseRevision: 2, idempotencyKey: 'approval', outcome: 'APPROVE' as const,
    rationale: 'All mandatory checks passed.', submissionId: 'submission' }
  await assert.rejects(ReviewService.decide(actor, approval), /registration already exists/)
  state.current.row.status = 'APPROVED'
  await ReviewService.deleteSupplier(actor, input)
  state.current.row.status = 'PENDING'
  state.current.row.id = 'new-case'
  state.current.snapshot.id = 'new-submission'
  const result = await ReviewService.decide(actor, { ...approval, submissionId: 'new-submission' })
  assert.equal(result.id, 'decision')
  assert.equal(state.create.mock.calls[0].arguments[0].data.registryKey, 'US/MA/REG123')
  assert.equal(state.create.mock.calls[0].arguments[0].data.approvedSubmissionId, 'new-submission')
})

for (const role of ['BUYER', 'REVIEWER', 'AUDITOR', 'COMPLIANCE']) test(`${role} cannot delete an approved supplier`, async () => {
  const state = setup()
  state.member.role = role
  await assert.rejects(casesRouter.createCaller({ actor, origin: 'http://localhost:3000' }).deleteSupplier(input), { code: 'FORBIDDEN' })
  assert.equal(state.remove.mock.callCount(), 0)
})

test('supplier identities and expired sessions cannot delete approved suppliers', async () => {
  const state = setup()
  for (const identity of [{ ...actor, channel: Security.SUPPLIER }, { ...actor, verified: false },
    { ...actor, createdAt: new Date(Date.now() - Security.FRESH_MS - 1000) }]) {
    await assert.rejects(async () => ReviewService.deleteSupplier(identity, input), { code: 'FORBIDDEN' })
  }
  assert.equal(state.remove.mock.callCount(), 0)
})

test('stale case revisions and non-approved cases fail before deletion', async () => {
  const state = setup()
  await assert.rejects(ReviewService.deleteSupplier(actor, { ...input, expectedCaseRevision: 1 }), { code: 'CONFLICT' })
  for (const status of ['DRAFT', 'INVITED', 'SUBMITTED', 'PENDING', 'REJECTED']) {
    state.current.row.status = status
    await assert.rejects(ReviewService.deleteSupplier(actor, input), /approved application/)
  }
  assert.equal(state.remove.mock.callCount(), 0)
})

test('missing, foreign, or mismatched suppliers cannot change case history or emit success', async () => {
  const state = setup()
  await assert.rejects(ReviewService.deleteSupplier(actor, { ...input, supplierId: 'other-supplier' }), /unavailable/)
  state.current.snapshot.id = 'other-submission'
  await assert.rejects(ReviewService.deleteSupplier(actor, input), /unavailable/)
  state.current.snapshot.id = 'submission'
  await assert.rejects(ReviewService.deleteSupplier({ ...actor, tenantId: 'other-tenant' }, input), /unavailable/)
  assert.equal(state.update.mock.callCount(), 0)
  assert.equal(state.audit.mock.callCount(), 0)
})

test('delete failure propagates without changing the case or recording success', async () => {
  const state = setup()
  mock.method(SupplierRepository, 'deleteMany', async () => { throw new Error('database failure') })
  await assert.rejects(ReviewService.deleteSupplier(actor, input), /database failure/)
  assert.equal(state.update.mock.callCount(), 0)
  assert.equal(state.audit.mock.callCount(), 0)
})
