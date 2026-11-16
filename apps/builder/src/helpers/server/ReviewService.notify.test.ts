import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'
import { InvitationRepository } from '@neo/prisma/repositories'
import { Commands } from './Commands'
import { ReviewService } from './ReviewService'
import { type Actor, Secrets, Security } from './Security'

const actor = { id: 'reviewer', tenantId: 'tenant', channel: Security.BUYER } as Actor
afterEach(() => mock.restoreAll())

test('review updates for supplier-created applications go to the creating account', async () => {
  mock.method(InvitationRepository, 'findFirst', async () => null)
  mock.method(Commands, 'caseRow', async () => ({ createdBy: { email: 'supplier@example.test' } }) as never)
  const notify = mock.method(Commands, 'notify', async () => {})
  for (const message of ['Your onboarding was approved.', 'Your onboarding was declined.', 'A correction is requested.']) {
    await ReviewService.notify(actor, 'case', 'submission', message, message, {} as never)
  }
  assert.equal(notify.mock.callCount(), 3)
  for (const call of notify.mock.calls) {
    assert.equal(call.arguments[1], 'supplier@example.test')
    assert.equal(call.arguments[6], 'submission')
  }
})

test('invited applications retain their original notification recipient', async () => {
  mock.method(InvitationRepository, 'findFirst', async () => ({ recipientCiphertext: Secrets.encrypt('invited@example.test', actor.tenantId) }) as never)
  const lookup = mock.method(Commands, 'caseRow')
  const notify = mock.method(Commands, 'notify', async () => {})
  await ReviewService.notify(actor, 'case', 'submission', 'decision', 'Your onboarding was approved.', {} as never)
  assert.equal(notify.mock.calls[0].arguments[1], 'invited@example.test')
  assert.equal(lookup.mock.callCount(), 0)
})
