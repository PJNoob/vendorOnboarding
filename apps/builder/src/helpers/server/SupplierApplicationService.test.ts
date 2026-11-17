import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'

import {
  BaseRepository, CaseAccessRepository, IdempotencyRecordRepository, InvitationRepository,
  OnboardingCaseRepository, PolicyVersionRepository, SubmissionRepository,
} from '@neo/prisma/repositories'
import { inputs } from '@neo/schemas'

import { supplierRouter } from '@/features/supplier/api/router'
import { Commands } from './Commands'
import { type Actor, Security } from './Security'
import { SupplierApplicationService } from './SupplierApplicationService'
import { TeamService } from './TeamService'

const actor: Actor = { id: 'supplier', email: 'supplier@example.test', channel: Security.SUPPLIER,
  verified: true, tenantId: 'spoofed-tenant', requestId: 'request', createdAt: new Date() }
const input = inputs.createSupplierApplication.parse({ category: 'CALIBRATION', country: 'US', requestedSite: 'Boston laboratory',
  idempotencyKey: 'd31e3c5a-1255-4699-aef1-55bc112d7f37' })
afterEach(() => mock.restoreAll())

function setup() {
  const tx = {} as never
  mock.method(BaseRepository, 'runInTransaction', async (apply: any) => apply(tx))
  const lock = mock.method(Security, 'lock', async () => {})
  let saved: any = null
  mock.method(IdempotencyRecordRepository, 'findUnique', async () => saved)
  const remember = mock.method(IdempotencyRecordRepository, 'create', async ({ data }: any) => {
    saved = { ...data, id: 'saved' }
    return saved
  })
  const policy = mock.method(PolicyVersionRepository, 'findFirst', async () => ({ id: 'policy' }) as never)
  const create = mock.method(OnboardingCaseRepository, 'create', async () => ({ id: 'new-case', revision: 0 }) as never)
  const submission = mock.method(SubmissionRepository, 'create', async () => ({ id: 'submission' }) as never)
  const access = mock.method(CaseAccessRepository, 'upsert', async () => ({ id: 'access' }) as never)
  const audit = mock.method(Commands, 'audit', async () => {})
  const invite = mock.method(InvitationRepository, 'create', async () => { throw new Error('must not invite') })
  const notify = mock.method(Commands, 'notify', async () => { throw new Error('must not email') })
  return { tx, lock, remember, policy, create, submission, access, audit, invite, notify }
}

test('first-time supplier creates an accessible blank draft in Harbor, ignoring the requested tenant', async () => {
  const mocks = setup()
  const result = await supplierRouter.createCaller({ actor, origin: 'http://localhost:3000' }).create(input)
  assert.deepEqual(result, { id: 'new-case', revision: 0 })
  assert.equal(mocks.lock.mock.calls[0].arguments[0], TeamService.BOOTSTRAP_TENANT)
  const data = mocks.create.mock.calls[0].arguments[0]?.data
  assert.deepEqual(data, { category: 'CALIBRATION', country: 'US', requestedSite: input.requestedSite,
    createdById: actor.id, currentNumber: 1, policyId: 'policy', status: 'DRAFT', tenantId: TeamService.BOOTSTRAP_TENANT })
  assert.deepEqual(mocks.submission.mock.calls[0].arguments[0]?.data, {
    caseId: 'new-case', number: 1, tenantId: TeamService.BOOTSTRAP_TENANT,
  })
  assert.deepEqual(mocks.access.mock.calls[0].arguments[0]?.create, {
    caseId: 'new-case', tenantId: TeamService.BOOTSTRAP_TENANT, userId: actor.id,
  })
  for (const operation of [mocks.policy, mocks.create, mocks.submission, mocks.access, mocks.remember]) {
    assert.equal(operation.mock.calls[0].arguments[1], mocks.tx, 'all records share the command transaction')
  }
  const where = mocks.policy.mock.calls[0].arguments[0]?.where
  assert.equal(where?.tenantId, TeamService.BOOTSTRAP_TENANT)
  assert.ok(where?.publishedAt)
  assert.equal(mocks.audit.mock.calls[0].arguments[1], 'SUPPLIER_APPLICATION_CREATED')
  assert.equal(mocks.invite.mock.callCount(), 0)
  assert.equal(mocks.notify.mock.callCount(), 0)
})

test('retrying a creation returns the original application; changed input requires a fresh key', async () => {
  const mocks = setup()
  const first = await SupplierApplicationService.create(actor, input)
  assert.deepEqual(await SupplierApplicationService.create(actor, input), first)
  assert.equal(mocks.create.mock.callCount(), 1)
  await assert.rejects(SupplierApplicationService.create(actor, { ...input, requestedSite: 'Changed site' }), { code: 'CONFLICT' })
  assert.equal(mocks.create.mock.callCount(), 1)
})

test('missing published policy fails before creating any records', async () => {
  const mocks = setup()
  mock.method(PolicyVersionRepository, 'findFirst', async () => null)
  await assert.rejects(SupplierApplicationService.create(actor, input), /Applications are not available/)
  assert.equal(mocks.create.mock.callCount(), 0)
  assert.equal(mocks.access.mock.callCount(), 0)
  assert.equal(mocks.remember.mock.callCount(), 0)
})

test('access-creation failure propagates out of the transaction without recording success', async () => {
  const mocks = setup()
  mock.method(CaseAccessRepository, 'upsert', async () => { throw new Error('database failure') })
  await assert.rejects(SupplierApplicationService.create(actor, input), /database failure/)
  assert.equal(mocks.remember.mock.callCount(), 0)
  assert.equal(mocks.audit.mock.callCount(), 0)
})

for (const identity of [{ ...actor, channel: Security.BUYER }, { ...actor, channel: Security.DEMO }, { ...actor, verified: false }]) {
  test(`creation rejects channel=${identity.channel}, verified=${identity.verified} before starting a transaction`, async () => {
    const transaction = mock.method(BaseRepository, 'runInTransaction')
    await assert.rejects(SupplierApplicationService.create(identity, input), { code: 'FORBIDDEN' })
    assert.equal(transaction.mock.callCount(), 0)
  })
}

test('API rejects anonymous requests, foreign origins, and supplier-selected identity or tenant fields', async () => {
  await assert.rejects(supplierRouter.createCaller({ origin: 'http://localhost:3000' }).create(input), { code: 'UNAUTHORIZED' })
  await assert.rejects(supplierRouter.createCaller({ actor, origin: 'https://other.example.test' }).create(input), { code: 'FORBIDDEN' })
  const caller = supplierRouter.createCaller({ actor, origin: 'http://localhost:3000' })
  for (const extra of [{ tenantId: 'another-tenant' }, { supplierEmail: 'someoneelse@example.test' }]) {
    await assert.rejects(caller.create({ ...input, ...extra }), { code: 'BAD_REQUEST' })
  }
  for (const change of [{ requestedSite: ' ' }, { country: 'not-a-country' }]) {
    await assert.rejects(caller.create({ ...input, ...change }), { code: 'BAD_REQUEST' })
  }
})

test('creating a new application cannot grant access to another application', async () => {
  mock.method(CaseAccessRepository, 'findFirst', async () => null)
  await assert.rejects(Security.access(actor, 'someone-elses-case'), { code: 'NOT_FOUND' })
})
