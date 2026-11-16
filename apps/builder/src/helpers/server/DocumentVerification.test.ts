import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'
import { DocumentVerification } from './DocumentVerification'
import { ObjectStore } from './Providers'
import { Secrets } from './Security'

afterEach(() => mock.restoreAll())
const report = () => ({ submissionId: 'submission', version: 'langgraph-gemini-v1', recommendation: 'CONSISTENT', findings: [{ rule: 'ENTITY_CONSISTENCY', result: 'PASS', code: 'DOCUMENTS_CONSISTENT', message: 'Consistent.', evidence: [{ documentId: 'document', page: 1, field: 'legal_name', value: 'Acme', quote: 'Acme' }] }] })
const current = () => ({ row: { tenantId: 'tenant' }, snapshot: { id: 'submission', companyProfile: { legalName: 'Acme' }, document_submission: [{ id: 'document', status: 'CLEAN', kind: 'REGISTRATION' }] }, policy: { documents: ['REGISTRATION'], rules: ['ENTITY_CONSISTENCY'] } })
const pages = () => new Map([['REGISTRATION', [{ documentId: 'document', page: 1, text: 'Acme' }]]])

test('service receives authenticated pages and reports are encrypted', async () => {
  let stored: Buffer | undefined
  mock.method(ObjectStore.STORAGE, 'bucket', () => ({ file: () => ({ save: async (value: Buffer) => { stored = value } }) }) as never)
  const request = mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(report())))
  const findings = await DocumentVerification.evaluate(current() as never, pages() as never)
  const options = request.mock.calls[0].arguments[1]
  assert.ok(options)
  assert.match(String((options.headers as Record<string, string>).Authorization), /^Bearer /)
  const payload = JSON.parse(options.body as string)
  assert.equal(payload.submissionId, 'submission')
  assert.equal(payload.documents[0].pages[0].documentId, 'document')
  assert.ok(stored)
  assert.deepEqual(JSON.parse(Secrets.decrypt(stored, 'tenant')), report())
  assert.ok(findings[0].trace?.reportRef)
})

for (const invalid of ['submission', 'evidence', 'rules']) test(`invalid service ${invalid} cannot be persisted`, async () => {
  const value = report()
  if (invalid === 'submission') value.submissionId = 'other'
  if (invalid === 'evidence') value.findings[0].evidence[0].quote = 'invented'
  if (invalid === 'rules') value.findings = []
  mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(value)))
  const store = mock.method(ObjectStore.STORAGE, 'bucket', () => { throw new Error('must not store an invalid report') })
  await assert.rejects(DocumentVerification.evaluate(current() as never, pages() as never), /invalid report|unsupported evidence/)
  assert.equal(store.mock.callCount(), 0)
})

test('provider failures do not echo supplier details', async () => {
  mock.method(globalThis, 'fetch', async () => new Response('private document text', { status: 503 }))
  await assert.rejects(DocumentVerification.extract('document', Buffer.from('%PDF-')), { message: 'document service unavailable (503)' })
})

test('cloud certificate review sends bounded calls to the authenticated Gemini sidecar', async () => {
  const signal = AbortSignal.timeout(45_000)
  const request = mock.method(globalThis, 'fetch', async () => Response.json({
    model: 'configured-gemini-model', text: '{"inspect":[1]}',
  }))
  const result = await DocumentVerification.generateCertificateEvidence('Select sections', { index: [1] }, signal)
  const [url, options] = request.mock.calls[0].arguments
  assert.equal(new URL(String(url)).pathname, '/v1/certificate-scope/generate')
  assert.equal(options?.signal, signal)
  assert.match(String((options?.headers as Record<string, string>).Authorization), /^Bearer /)
  assert.deepEqual(JSON.parse(options?.body as string), { instruction: 'Select sections', data: '{"index":[1]}' })
  assert.equal(result.model, 'configured-gemini-model')
})

test('encrypted certificate suggestions can only be read for the current case snapshot', async () => {
  const { ReviewEvidence } = await import('./ReviewEvidence')
  const suggestion = {
    model: 'configured-gemini-model', status: 'suggested',
    citations: [{ documentId: 'certificate', field: 'site', page: 2, quote: 'North Lab excluded.' }],
  }
  const trace = {
    certificateScopeReviewModel: suggestion.model,
    certificateScopeReviewRef: 'certificate-scope/tenant/submission/reference',
  }
  const currentSnapshot = {
    row: { tenantId: 'tenant', status: 'PENDING' },
    snapshot: {
      id: 'submission',
      checkRun_submission: [{ ruleKey: 'CERTIFICATE_SCOPE', evidenceJson: trace }],
      document_submission: [{ id: 'certificate', kind: 'CERTIFICATE', status: 'CLEAN' }],
    },
  }
  const file = mock.fn(() => ({
    download: async () => [Secrets.encrypt(JSON.stringify(suggestion), 'tenant')],
  }))
  mock.method(ObjectStore.STORAGE, 'bucket', () => ({ file }) as never)
  assert.deepEqual(await ReviewEvidence.scopeSuggestion(currentSnapshot as never), suggestion)
  currentSnapshot.row.status = 'SUBMITTED'
  assert.equal(await ReviewEvidence.scopeSuggestion(currentSnapshot as never), undefined)
  currentSnapshot.row.status = 'PENDING'
  currentSnapshot.snapshot.id = 'different-submission'
  assert.equal(await ReviewEvidence.scopeSuggestion(currentSnapshot as never), undefined)
  assert.equal(file.mock.callCount(), 1)
})
