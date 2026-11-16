import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'
import { TRPCError } from '@trpc/server'
import type { WorkItem } from '@neo/prisma'
import { BaseRepository, NotificationRepository, WorkItemRepository } from '@neo/prisma/repositories'
import { Worker } from './JobWorker'
import { Security } from './Security'
import { SupplierEmailVerifier } from './SupplierEmailVerifier'

afterEach(() => mock.restoreAll())
const item = { id: 'work', tenantId: 'tenant', kind: 'NOTIFY', attempt: 5, leaseEpoch: 1 } as WorkItem
function worker() { return Object.create(Worker.prototype) as Worker }

test('the invitation loop polls every 35 seconds independently of document jobs', async () => {
  const instance = worker()
  let calls = 0
  const waits: number[] = []
  instance['dispatchInvitation'] = async () => { calls++ }
  await instance['invitationLoop'](() => waits.length === 3, async (ms) => { waits.push(ms) })
  assert.equal(calls, 3)
  assert.deepEqual(waits, [35_000, 35_000, 35_000])
  assert.equal(Worker.POLL_MS, 2_000)
})

test('only one due invitation is dispatched across worker instances in each 35-second slot', async () => {
  const first = worker(), second = worker()
  const published: string[] = []
  let slotTaken = false
  const redis = { set: async (...args: unknown[]) => {
    assert.equal(args[3], 35_000)
    assert.equal(args[4], 'NX')
    if (slotTaken) return null
    slotTaken = true
    return 'OK'
  } }
  for (const instance of [first, second]) {
    Object.defineProperty(instance, 'redis', { value: redis })
    instance['publish'] = async (work) => { published.push(work.id) }
  }
  const pending = mock.method(WorkItemRepository, 'findFirst', async () => item)
  await Promise.all([first['dispatchInvitation'](), second['dispatchInvitation']()])
  assert.deepEqual(published, ['work'])
  assert.deepEqual(pending.mock.calls[0].arguments[0]?.orderBy, [{ availableAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }])
})

test('regular dispatch excludes supplier invitations so it cannot bypass the slower queue', async () => {
  const instance = worker()
  const pending = mock.method(WorkItemRepository, 'findMany', async () => [])
  await instance['dispatch']()
  const where = pending.mock.calls[0].arguments[0]?.where
  assert.deepEqual(where?.NOT, { notification_workItem: { some: { template: Worker.INVITATION_TEMPLATE } } })
})

for (const message of [SupplierEmailVerifier.RATE_LIMITED]) {
  test(`transient verification retries after 35 seconds without exhausting delivery attempts: ${message}`, async () => {
    const instance = worker()
    mock.method(BaseRepository, 'runInTransaction', async (apply: any) => apply({}))
    mock.method(Security, 'lock', async () => [] as never)
    const workUpdate = mock.method(WorkItemRepository, 'updateMany', async () => ({ count: 1 }))
    const notification = mock.method(NotificationRepository, 'updateMany', async () => ({ count: 1 }))
    const before = Date.now()
    await instance['fail'](item, new TRPCError({ code: 'TOO_MANY_REQUESTS', message }))
    const data = workUpdate.mock.calls[0].arguments[0]?.data
    assert.equal(data?.state, 'READY')
    assert.deepEqual(data?.attempt, { decrement: 1 })
    assert.ok(new Date(data?.availableAt as Date).getTime() >= before + 35_000)
    assert.equal(notification.mock.calls[0].arguments[0]?.data?.deliveryState, 'QUEUED')
  })
}
