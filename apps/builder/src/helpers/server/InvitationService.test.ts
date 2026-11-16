import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'
import { TRPCError } from '@trpc/server'
import { InvitationRepository, OnboardingCaseRepository, PolicyVersionRepository, SubmissionRepository, NotificationRepository } from '@neo/prisma/repositories'
import { Commands } from './Commands'
import { InvitationService } from './InvitationService'
import { type Actor, Secrets, Security } from './Security'
import { supplierEmailVerifier } from './SupplierEmailVerifier'

const actor: Actor = { id: 'buyer', email: 'buyer@example.com', tenantId: 'tenant', requestId: 'request', channel: Security.BUYER, verified: true, createdAt: new Date() }
const input = { category: 'CALIBRATION' as const, country: 'US', requestedSite: 'Service site', supplierEmail: 'supplier@example.com', idempotencyKey: 'd31e3c5a-1255-4699-aef1-55bc112d7f37' }
afterEach(() => mock.restoreAll())
function transaction() {
  mock.method(Commands, 'execute', async (...args: any[]) => { await args[3]({}); return args[4]({}) })
  mock.method(Security, 'buyer', async () => ({ role: 'BUYER' }) as never)
  mock.method(Commands, 'audit', async () => {})
}

test('supplier creation queues the invitation atomically without calling the mailbox API', async () => {
  transaction()
  const verify = mock.method(supplierEmailVerifier, 'requireDeliverable', async () => { throw new Error('API must run in background') })
  mock.method(PolicyVersionRepository, 'findFirst', async () => ({ id: 'policy' }) as never)
  mock.method(OnboardingCaseRepository, 'create', async () => ({ id: 'case', revision: 0 }) as never)
  mock.method(SubmissionRepository, 'create', async () => ({ id: 'submission' }) as never)
  mock.method(InvitationRepository, 'create', async () => ({ id: 'invite' }) as never)
  mock.method(Commands, 'current', async () => ({ snapshot: { id: 'submission' } }) as never)
  mock.method(Commands, 'enqueue', async () => ({ id: 'work' }) as never)
  const queued = mock.method(NotificationRepository, 'create', async () => ({ id: 'notification' }) as never)
  assert.deepEqual(await InvitationService.create(actor, input), { id: 'case', revision: 0 })
  assert.equal(verify.mock.callCount(), 0)
  const args = queued.mock.calls[0].arguments[0]
  assert.ok(args)
  const data = args.data
  assert.equal(data.deliveryState, 'QUEUED')
  assert.equal(data.template, 'Supplier onboarding invitation')
  assert.equal(Secrets.decrypt(data.recipientCiphertext as Buffer, 'tenant/work'), input.supplierEmail)
})

test('reissuing an invitation also queues verification rather than spending an API call', async () => {
  transaction()
  const verify = mock.method(supplierEmailVerifier, 'requireDeliverable')
  mock.method(Commands, 'caseRow', async () => ({ id: 'case', status: 'INVITED', revision: 0 }) as never)
  mock.method(InvitationRepository, 'findFirst', async () => ({ recipientCiphertext: Secrets.encrypt(input.supplierEmail, actor.tenantId) }) as never)
  const revoke = mock.method(InvitationRepository, 'updateMany', async () => ({ count: 1 }))
  mock.method(InvitationRepository, 'create', async () => ({ id: 'replacement' }) as never)
  mock.method(Commands, 'current', async () => ({ snapshot: { id: 'submission' } }) as never)
  const notify = mock.method(Commands, 'notify', async () => {})
  await InvitationService.reissue(actor, { caseId: 'case', expectedCaseRevision: 0, idempotencyKey: input.idempotencyKey })
  assert.equal(verify.mock.callCount(), 0)
  assert.equal(revoke.mock.callCount(), 1)
  assert.equal(notify.mock.callCount(), 1)
})

test('authorization is checked before queueing any invitation', async () => {
  transaction()
  mock.method(Security, 'buyer', async () => { throw new TRPCError({ code: 'FORBIDDEN' }) })
  const notify = mock.method(Commands, 'notify')
  await assert.rejects(InvitationService.create(actor, input), { code: 'FORBIDDEN' })
  assert.equal(notify.mock.callCount(), 0)
})
