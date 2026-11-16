import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'
import { TRPCError } from '@trpc/server'

import type { WorkItem } from '@neo/prisma'
import { InvitationRepository, NotificationRepository } from '@neo/prisma/repositories'
import { Commands } from './Commands'
import { Worker } from './JobWorker'
import { MailProvider } from './Providers'
import { Secrets } from './Security'
import { supplierEmailVerifier, SupplierEmailVerifier } from './SupplierEmailVerifier'

afterEach(() => mock.restoreAll())

for (const status of ['invalid', 'unknown', 'safe']) {
  test(`queued invitation with ${status} verification: only safe recipients reach the mail provider`, async () => {
    // Exercise notification delivery without starting Redis or sending real emails.
    const worker = Object.create(Worker.prototype) as Worker
    const work = { id: 'work', tenantId: 'tenant', dedupeKey: 'invite', createdAt: new Date() } as WorkItem
    let failureCode: string | undefined
    worker['commit'] = async (_work, effect, reason) => { failureCode = reason; if (effect) await effect({} as never) }
    mock.method(NotificationRepository, 'findFirst', async () => ({
      id: 'notification', template: 'Supplier onboarding invitation',
      recipientCiphertext: Secrets.encrypt('supplier@example.com', 'tenant/work'),
      payloadCiphertext: Secrets.encrypt('Invitation', 'tenant/work'),
    }) as never)
    mock.method(InvitationRepository, 'findFirst', async () => ({ id: 'invite', expiresAt: new Date(Date.now() + 60_000) }) as never)
    const revoke = mock.method(InvitationRepository, 'updateMany', async () => ({ count: 1 }))
    const update = mock.method(NotificationRepository, 'updateMany', async () => ({ count: 1 }))
    mock.method(Commands, 'audit', async () => {})
    mock.method(supplierEmailVerifier, 'requireDeliverable', async () => {
      if (status !== 'safe') throw new TRPCError({
        code: status === 'invalid' ? 'BAD_REQUEST' : 'PRECONDITION_FAILED',
        message: status === 'invalid' ? SupplierEmailVerifier.INVALID : SupplierEmailVerifier.UNAVAILABLE,
      })
    })
    const send = mock.method(MailProvider, 'send', async () => 'provider-message')
    await worker['notify'](work)
    const updateArgs = update.mock.calls.at(-1)!.arguments[0]
    assert.ok(updateArgs)
    const expectedState = status === 'invalid' ? 'INVALID' : status === 'unknown' ? 'VERIFICATION_FAILED' : 'SENT'
    assert.equal(updateArgs.data?.deliveryState, expectedState)
    assert.equal(revoke.mock.callCount(), status === 'invalid' || status === 'unknown' ? 1 : 0)
    assert.equal(failureCode, status === 'invalid' ? 'INVALID_SUPPLIER_EMAIL' : status === 'unknown' ? 'EMAIL_VERIFICATION_FAILED' : undefined)
    assert.equal(send.mock.callCount(), status === 'safe' ? 1 : 0)
  })
}
