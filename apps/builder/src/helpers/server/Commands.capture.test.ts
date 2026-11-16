import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'
import { NotificationRepository, WorkItemRepository } from '@neo/prisma/repositories'
import { Commands } from './Commands'
import { Secrets, type Actor } from './Security'

const runtime = process.env as Record<string, string | undefined>
const previousCapture = runtime.LOCAL_CAPTURE_TEST_EMAILS
const previousMode = runtime.NODE_ENV
afterEach(() => {
  mock.restoreAll()
  if (previousCapture === undefined) delete runtime.LOCAL_CAPTURE_TEST_EMAILS; else runtime.LOCAL_CAPTURE_TEST_EMAILS = previousCapture
  if (previousMode === undefined) delete runtime.NODE_ENV; else runtime.NODE_ENV = previousMode
})

for (const [email, mode, captured] of [
  ['vendor@example.test', 'test', true],
  ['vendor@example.com', 'test', false],
  ['vendor@example.test', 'production', false],
] as const) test(`local QA capture for ${email} in ${mode}: ${captured}`, async () => {
  runtime.LOCAL_CAPTURE_TEST_EMAILS = 'true'
  runtime.NODE_ENV = mode
  mock.method(Commands, 'enqueue', async () => ({ id: 'work' }) as never)
  const update = mock.method(WorkItemRepository, 'updateMany', async () => ({ count: 1 }))
  const create = mock.method(NotificationRepository, 'create', async () => ({}) as never)
  await Commands.notify({ tenantId: 'tenant' } as Actor, email, 'Invitation', 'key', 'Synthetic QA message', {} as never)
  const created = create.mock.calls[0].arguments[0]
  assert.ok(created)
  const record = created.data
  assert.equal(record.deliveryState, captured ? 'CAPTURED_TEST' : 'QUEUED')
  assert.equal(Secrets.decrypt(record.payloadCiphertext as Uint8Array, 'tenant/work'), 'Synthetic QA message')
  assert.equal(update.mock.callCount(), captured ? 1 : 0)
  if (captured) { const updated = update.mock.calls[0].arguments[0]; assert.ok(updated); assert.equal(updated.data.state, 'SUCCEEDED') }
})
