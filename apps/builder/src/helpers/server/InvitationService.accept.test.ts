import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'
import { InvitationRepository, CaseAccessRepository, OnboardingCaseRepository } from '@neo/prisma/repositories'
import { Commands } from './Commands'
import { InvitationService } from './InvitationService'
import { type Actor, Secrets, Security } from './Security'

const actor: Actor = { id: 'supplier', email: 'supplier@example.com', channel: Security.SUPPLIER, verified: true, tenantId: '', requestId: 'request', createdAt: new Date() }
const invite = { id: 'invitation', caseId: 'case', tenantId: 'tenant', emailKey: Secrets.mac(actor.email, 'email'), expiresAt: new Date(Date.now() + 60_000), redeemedAt: null, revokedAt: null }
const input = { invitationId: invite.id, idempotencyKey: 'd31e3c5a-1255-4699-aef1-55bc112d7f37' }
afterEach(() => mock.restoreAll())
function transaction() {
  mock.method(Commands, 'execute', async (...args: any[]) => { await args[3]({}); return args[4]({}) })
  mock.method(Commands, 'audit', async () => {})
}

test('pending invitations are scoped to the verified supplier email without disclosing invitation secrets', async () => {
  const lookup = mock.method(InvitationRepository, 'findMany', async () => [{ ...invite, case: { requestedSite: 'Test site', country: 'US' } }] as never)
  const result = await InvitationService.pending(actor)
  assert.equal(lookup.mock.calls[0].arguments[0]?.where?.emailKey, invite.emailKey)
  assert.deepEqual(result.items, [{ id: invite.id, caseId: 'case', requestedSite: 'Test site', country: 'US', expiresAt: invite.expiresAt.toISOString() }])
  assert.ok(!JSON.stringify(result).includes(invite.emailKey))
})

for (const identity of [{ ...actor, channel: Security.BUYER }, { ...actor, verified: false }]) {
  test(`pending invitations reject channel=${identity.channel}, verified=${identity.verified}`, async () => {
    const lookup = mock.method(InvitationRepository, 'findMany')
    await assert.rejects(InvitationService.pending(identity), { code: 'FORBIDDEN' })
    assert.equal(lookup.mock.callCount(), 0)
  })
}

test('accepting creates supplier access and changes an invited case to a draft profile', async () => {
  transaction()
  mock.method(InvitationRepository, 'findUnique', async () => invite as never)
  mock.method(CaseAccessRepository, 'findFirst', async () => null)
  mock.method(Commands, 'caseRow', async () => ({ id: 'case', status: 'INVITED', revision: 0 }) as never)
  const consumed = mock.method(InvitationRepository, 'updateMany', async () => ({ count: 1 }))
  const access = mock.method(CaseAccessRepository, 'upsert', async () => ({ id: 'access' }) as never)
  const update = mock.method(OnboardingCaseRepository, 'updateMany', async () => ({ count: 1 }))
  assert.deepEqual(await InvitationService.accept(actor, input), { id: 'case', revision: 1 })
  assert.equal(consumed.mock.callCount(), 1)
  assert.equal(access.mock.calls[0].arguments[0]?.create.userId, actor.id)
  assert.equal(update.mock.calls[0].arguments[0]?.data?.status, 'DRAFT')
})

test('reopening an accepted link returns the existing profile without consuming it twice', async () => {
  transaction()
  mock.method(InvitationRepository, 'findUnique', async () => ({ ...invite, redeemedAt: new Date() }) as never)
  mock.method(CaseAccessRepository, 'findFirst', async () => ({ id: 'access', revokedAt: null }) as never)
  mock.method(Commands, 'caseRow', async () => ({ id: 'case', status: 'DRAFT', revision: 1 }) as never)
  const consumed = mock.method(InvitationRepository, 'updateMany')
  assert.deepEqual(await InvitationService.redeem(actor, { token: 'a'.repeat(43), idempotencyKey: input.idempotencyKey }), { id: 'case', revision: 1 })
  assert.equal(consumed.mock.callCount(), 0)
})

for (const identity of [{ ...actor, email: 'someoneelse@example.com' }, { ...actor, channel: Security.BUYER }]) {
  test(`another email or a Google buyer session cannot accept supplier access: ${identity.email}/${identity.channel}`, async () => {
    mock.method(InvitationRepository, 'findUnique', async () => invite as never)
    const access = mock.method(CaseAccessRepository, 'upsert')
    await assert.rejects(InvitationService.accept(identity, input))
    assert.equal(access.mock.callCount(), 0)
  })
}

for (const badInvite of [{ ...invite, expiresAt: new Date(0) }, { ...invite, revokedAt: new Date() }]) {
  test(`expired or revoked invitations cannot grant access: ${badInvite.revokedAt ? 'revoked' : 'expired'}`, async () => {
    transaction()
    mock.method(InvitationRepository, 'findUnique', async () => badInvite as never)
    mock.method(CaseAccessRepository, 'findFirst', async () => null)
    const access = mock.method(CaseAccessRepository, 'upsert')
    await assert.rejects(InvitationService.accept(actor, input), /expired or been revoked/)
    assert.equal(access.mock.callCount(), 0)
  })
}
