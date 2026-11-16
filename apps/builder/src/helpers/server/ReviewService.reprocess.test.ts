import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'
import { ExtractionRepository, OnboardingCaseRepository, OutboxEventRepository, WorkItemRepository } from '@neo/prisma/repositories'
import { Commands } from './Commands'
import { DocumentProcessor } from './DocumentProcessor'
import { ReviewService } from './ReviewService'
import type { Actor } from './Security'

afterEach(() => mock.restoreAll())
const actor = { id: 'admin', tenantId: 'tenant', channel: 'GOOGLE' } as Actor
const input = { caseId: 'case', submissionId: 'submission', expectedCaseRevision: 2, idempotencyKey: 'request' }
function setup() {
  const current = { row: { id: 'case', revision: 2, status: 'SUBMITTED' }, snapshot: { id: 'submission', submittedAt: new Date(), document_submission: [{ id: 'doc', status: 'CLEAN' }], workItem_submission: [{ id: 'verify', kind: 'VERIFY', state: 'FAILED', dedupeKey: 'submission' }] } }
  mock.method(Commands, 'execute', async (_actor: any, _op: any, _input: any, _authorize: any, apply: any) => apply({}))
  mock.method(Commands, 'current', async () => current as never)
  mock.method(ExtractionRepository, 'findFirst', async () => null)
  mock.method(OnboardingCaseRepository, 'updateMany', async () => ({ count: 1 }))
  mock.method(OutboxEventRepository, 'create', async () => ({}) as never)
  mock.method(Commands, 'audit', async () => {})
  return current
}

test('reprocess queues missing OCR and resets verification', async () => {
  setup()
  const enqueue = mock.method(Commands, 'enqueue', async () => ({}) as never)
  const reset = mock.method(WorkItemRepository, 'updateMany', async () => ({ count: 1 }))
  assert.deepEqual(await ReviewService.reprocess(actor, input), { id: 'submission', revision: 3 })
  assert.equal(enqueue.mock.calls[0].arguments[2], DocumentProcessor.extractionKey('doc'))
  assert.equal(reset.mock.calls[0].arguments[0]?.data?.state, 'READY')
})

test('reprocess reuses durable extraction results', async () => {
  setup()
  mock.method(ExtractionRepository, 'findFirst', async () => ({ id: 'saved' }) as never)
  const enqueue = mock.method(Commands, 'enqueue', async () => ({}) as never)
  mock.method(WorkItemRepository, 'updateMany', async () => ({ count: 1 }))
  await ReviewService.reprocess(actor, input)
  assert.equal(enqueue.mock.callCount(), 0)
})

test('reprocess rejects stale versions and active jobs', async () => {
  const current = setup()
  current.snapshot.id = 'new-submission'
  await assert.rejects(ReviewService.reprocess(actor, input), /current submitted application/)
  current.snapshot.id = 'submission'; current.snapshot.workItem_submission[0].state = 'RUNNING'
  await assert.rejects(ReviewService.reprocess(actor, input), /active document processing job/)
})
