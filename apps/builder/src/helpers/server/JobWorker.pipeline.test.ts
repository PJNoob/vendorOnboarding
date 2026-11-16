import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'
import type { Document, WorkItem } from '@neo/prisma'
import { CheckEvidenceRepository, CheckRunRepository, DocumentRepository, ExtractionRepository, IssueRepository, OnboardingCaseRepository, SubmissionRepository, WorkItemRepository } from '@neo/prisma/repositories'
import { Commands } from './Commands'
import { DocumentProcessor } from './DocumentProcessor'
import { DocumentVerification } from './DocumentVerification'
import { Worker } from './JobWorker'
import { ReviewEvidence } from './ReviewEvidence'
import { ReviewService } from './ReviewService'
import { Verification } from './Verification'

afterEach(() => mock.restoreAll())
const document = { id: 'document', tenantId: 'tenant', submissionId: 'submission', status: 'CLEAN', kind: 'BANK' } as Document
const work = { id: 'verify', submissionId: 'submission', tenantId: 'tenant', kind: 'VERIFY', attempt: 1, leaseEpoch: 1, createdAt: new Date() } as WorkItem
const snapshot = (items: unknown[] = []) => ({ row: { id: 'case', tenantId: 'tenant' }, policy: { documents: ['BANK'], rules: ['BANK_BENEFICIARY'] }, snapshot: { id: 'submission', workItem_submission: items, document_submission: [document] } })
const instance = () => Object.create(Worker.prototype) as Worker
function setup(current: ReturnType<typeof snapshot>) {
  mock.method(SubmissionRepository, 'findFirst', async () => ({ id: 'submission', caseId: 'case', number: 1 }) as never)
  mock.method(Commands, 'current', async () => current as never)
}

test('scan hands off to extraction with a distinct deduplication key', async () => {
  const worker = instance()
  worker['commit'] = async (_work, effect) => { await effect?.({} as never) }
  mock.method(DocumentRepository, 'findFirst', async () => document)
  mock.method(DocumentProcessor, 'scan', async () => ({ cleanKey: 'clean', cleanGeneration: '1' }))
  mock.method(DocumentRepository, 'updateMany', async () => ({ count: 1 }))
  const enqueue = mock.method(Commands, 'enqueue', async () => ({}) as never)
  await worker['perform']({ ...work, kind: 'SCAN', dedupeKey: document.id, payload: { documentId: document.id } })
  assert.equal(enqueue.mock.calls[0].arguments[1], 'EXTRACT')
  assert.notEqual(enqueue.mock.calls[0].arguments[2], document.id)
  assert.equal(enqueue.mock.calls[0].arguments[2], DocumentProcessor.extractionKey(document.id))
})

test('duplicate extraction skips OCR when its result is durable', async () => {
  const worker = instance()
  worker['commit'] = async () => {}
  mock.method(DocumentRepository, 'findFirst', async () => document)
  mock.method(ExtractionRepository, 'findFirst', async () => ({ id: 'saved' }) as never)
  const extract = mock.method(DocumentProcessor, 'extract', async () => [])
  await worker['perform']({ ...work, kind: 'EXTRACT', payload: { documentId: document.id } })
  assert.equal(extract.mock.callCount(), 0)
})

for (const kind of ['SCAN', 'EXTRACT']) test(`verification defers during active ${kind} without consuming retries`, async () => {
  const worker = instance()
  setup(snapshot([{ kind, state: 'RUNNING' }]))
  const update = mock.method(WorkItemRepository, 'updateMany', async () => ({ count: 1 }))
  const evaluate = mock.method(DocumentVerification, 'evaluate', async () => [])
  await worker['verify'](work)
  assert.deepEqual(update.mock.calls[0].arguments[0]?.data?.attempt, { decrement: 1 })
  assert.equal(evaluate.mock.callCount(), 0)
})

test('failed extraction never produces verification results', async () => {
  const worker = instance()
  setup(snapshot([{ kind: 'EXTRACT', state: 'FAILED', dedupeKey: DocumentProcessor.extractionKey(document.id) }]))
  const evaluate = mock.method(DocumentVerification, 'evaluate', async () => [])
  await assert.rejects(worker['verify'](work), /document processing failed/)
  assert.equal(evaluate.mock.callCount(), 0)
})

test('verification cannot omit a missing current extraction', async () => {
  const worker = instance()
  mock.method(ExtractionRepository, 'findFirst', async () => null)
  await assert.rejects(worker['evidence'](snapshot() as never), /current document extraction is unavailable/)
})

test('an old submission cannot write verification results', async () => {
  const worker = instance()
  const current = snapshot(); current.snapshot.id = 'new-submission'
  setup(current)
  let committed = 0
  worker['commit'] = async () => { committed++ }
  const evaluate = mock.method(DocumentVerification, 'evaluate', async () => [])
  await worker['verify'](work)
  assert.equal(committed, 1)
  assert.equal(evaluate.mock.callCount(), 0)
})

for (const [local, agent, expected] of [['PASS', 'REVIEW', 'REVIEW'], ['FAIL', 'PASS', 'FAIL'], ['PASS', 'PASS', 'PASS']] as const) test(`local ${local} and agent ${agent} persist ${expected} for human review`, async () => {
  const worker = instance()
  const current = snapshot()
  current.policy.rules = ['CERTIFICATE_SCOPE']
  setup(current)
  worker['evidence'] = async () => new Map()
  worker['commit'] = async (_work, effect) => { await effect?.({} as never) }
  mock.method(Commands, 'caseRow', async () => ({ id: 'case', currentNumber: 1, status: 'SUBMITTED' }) as never)
  const base = { code: 'TEST', evidence: [], message: 'Review evidence.', rule: 'CERTIFICATE_SCOPE', source: 'LIVE' as const }
  const suggest = mock.method(ReviewEvidence, 'generateScopeSuggestion', async () => ({
    certificateScopeReviewRef: 'certificate-scope/tenant/submission/fixture', certificateScopeReviewModel: 'configured-gemini-model',
  }))
  mock.method(Verification, 'evaluate', async () => [{ ...base, result: local }])
  mock.method(DocumentVerification, 'evaluate', async () => [{ ...base, result: agent, trace: { reportRef: 'report' } }])
  mock.method(CheckRunRepository, 'findFirst', async () => null)
  const checks = mock.method(CheckRunRepository, 'create', async () => ({ id: 'check' }) as never)
  mock.method(CheckEvidenceRepository, 'createMany', async () => ({ count: 0 }))
  mock.method(IssueRepository, 'findFirst', async () => null)
  mock.method(IssueRepository, 'create', async () => ({}) as never)
  mock.method(IssueRepository, 'updateMany', async () => ({ count: 0 }))
  const cases = mock.method(OnboardingCaseRepository, 'updateMany', async () => ({ count: 1 }))
  mock.method(ReviewService, 'notify', async () => {})
  mock.method(Commands, 'audit', async () => {})
  await worker['verify'](work)
  assert.equal(checks.mock.calls[0].arguments[0]?.data?.result, expected)
  assert.equal(suggest.mock.callCount(), expected === 'PASS' ? 0 : 1)
  assert.deepEqual(checks.mock.calls[0].arguments[0]?.data?.evidenceJson, expected === 'PASS' ? { reportRef: 'report' } : {
    reportRef: 'report', certificateScopeReviewRef: 'certificate-scope/tenant/submission/fixture',
    certificateScopeReviewModel: 'configured-gemini-model',
  })
  assert.equal(cases.mock.calls[0].arguments[0]?.data?.status, 'PENDING')
})
