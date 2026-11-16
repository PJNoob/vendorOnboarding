import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'
import { DocumentRepository } from '@neo/prisma/repositories'
import { ContextFactory } from './context'
import { Commands } from './Commands'
import { DocumentTransfer } from './DocumentTransfer'
import { ObjectStore } from './Providers'
import { Security } from './Security'

const previous = process.env.LOCAL_GCLOUD_AUTH
afterEach(() => { mock.restoreAll(); if (previous === undefined) delete process.env.LOCAL_GCLOUD_AUTH; else process.env.LOCAL_GCLOUD_AUTH = previous })
function setup(origin = 'http://localhost:3000', bytes = Buffer.from('%PDF-test')) {
  process.env.LOCAL_GCLOUD_AUTH = 'true'
  const response: any = { code: 0, body: undefined, setHeader() {}, status(code: number) { this.code = code; return this }, json(body: unknown) { this.body = body; return this }, end() { return this } }
  const request: any = { method: 'PUT', query: { key: 'object' }, headers: { origin, 'content-type': 'application/pdf' },
    async *[Symbol.asyncIterator]() { yield bytes } }
  const actor = { id: 'vendor', channel: Security.SUPPLIER, tenantId: '', verified: true }
  mock.method(ContextFactory, 'create', async () => ({ actor }) as never)
  mock.method(DocumentRepository, 'findFirst', async () => ({ objectKey: 'object', status: 'RESERVED', tenantId: 'tenant', submissionId: 'submission', sizeBytes: 9,
    createdAt: new Date(), submission: { caseId: 'case' } }) as never)
  const access = mock.method(Security, 'access', async () => ({ tenantId: 'tenant' }) as never)
  mock.method(Commands, 'current', async () => ({ row: { status: 'DRAFT' }, snapshot: { id: 'submission', submittedAt: null } }) as never)
  const saved = mock.fn(async (_bytes: Buffer, _options: any) => {})
  mock.method(ObjectStore.STORAGE, 'bucket', () => ({ file: () => ({ save: saved }) }) as never)
  return { request, response, saved, access }
}

test('local upload requires a signed-in supplier and sends no bytes to storage anonymously', async () => {
  const f = setup()
  mock.method(ContextFactory, 'create', async () => ({}))
  await DocumentTransfer.handle(f.request, f.response, true)
  assert.equal(f.response.code, 401)
  assert.equal(f.saved.mock.callCount(), 0)
})
test('local upload blocks a cross-origin request before writing to storage', async () => {
  const f = setup('https://untrusted.example')
  await DocumentTransfer.handle(f.request, f.response, true)
  assert.equal(f.response.code, 403)
  assert.equal(f.saved.mock.callCount(), 0)
})
test('a mismatched upload size is rejected without writing a cloud object', async () => {
  const f = setup('http://localhost:3000', Buffer.from('%PDF-too-large'))
  await DocumentTransfer.handle(f.request, f.response, true)
  assert.equal(f.response.code, 413)
  assert.equal(f.saved.mock.callCount(), 0)
})
test('authorized current-draft PDF upload uses create-only cloud storage', async () => {
  const f = setup()
  await DocumentTransfer.handle(f.request, f.response, true)
  assert.equal(f.response.code, 204)
  assert.equal(f.access.mock.callCount(), 1)
  assert.equal(f.saved.mock.callCount(), 1)
  assert.deepEqual(f.saved.mock.calls[0].arguments[1].preconditionOpts, { ifGenerationMatch: 0 })
})
