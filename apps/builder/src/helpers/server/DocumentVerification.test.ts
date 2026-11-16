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
