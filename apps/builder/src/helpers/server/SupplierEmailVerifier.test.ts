import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TRPCError } from '@trpc/server'

import { SupplierEmailVerifier, type VerificationStore } from './SupplierEmailVerifier'

const email = 'supplier@example.com'
const errorIs = (message: string) => (error: unknown) => error instanceof TRPCError && error.message === message
function memoryStore() {
  let now = 0
  const values = new Map<string, { value: string; expires: number }>()
  const store: VerificationStore = {
    async get(key) { const row = values.get(key); return row && row.expires > now ? row.value : null },
    async set(key, value, ttlMs, onlyIfAbsent) {
      if (onlyIfAbsent && await this.get(key) !== null) return false
      values.set(key, { value, expires: now + ttlMs })
      return true
    },
  }
  return { store, values, advance: (ms: number) => { now += ms } }
}

function checker(request: typeof fetch) {
  return new SupplierEmailVerifier('test-secret', request, memoryStore().store)
}

test('malformed input and missing configuration never contact the verification API', async () => {
  let requests = 0
  const provider = new SupplierEmailVerifier('', async () => { requests++; throw new Error('must not request') }, memoryStore().store)
  await assert.rejects(provider.requireDeliverable('1325ye6t'), errorIs('Enter a valid mail'))
  await assert.rejects(provider.requireDeliverable(email), errorIs(SupplierEmailVerifier.NOT_CONFIGURED))
  assert.equal(requests, 0)
})

test('calls the documented GET endpoint with encoded credentials and binds the returned verdict to its recipient', async () => {
  const provider = checker(async (input, options) => {
    const url = new URL(String(input))
    assert.equal(url.origin + url.pathname, SupplierEmailVerifier.ENDPOINT)
    assert.equal(url.searchParams.get('key'), 'test-secret')
    assert.equal(url.searchParams.get('email'), email)
    assert.equal(options?.method, 'GET')
    assert.equal(options?.redirect, 'error')
    assert.ok(options?.signal)
    return Response.json({ email, code: 'ok', message: 'Accepted' })
  })
  await provider.requireDeliverable(' SUPPLIER@example.com ')
})

for (const code of ['ko', 'mb', '--']) {
  test(`mailbox result ${code} blocks the invitation`, async () => {
    const provider = checker(async () => Response.json({ email, code }))
    await assert.rejects(provider.requireDeliverable(email), errorIs(
      code === 'ko' ? SupplierEmailVerifier.INVALID : SupplierEmailVerifier.UNAVAILABLE,
    ))
  })
}

for (const [name, response, message] of [
  ['rate limit', () => new Response(null, { status: 429 }), SupplierEmailVerifier.RATE_LIMITED],
  ['expired token', () => new Response(null, { status: 403 }), SupplierEmailVerifier.TOKEN_INVALID],
  ['invalid token', () => new Response(null, { status: 401 }), SupplierEmailVerifier.TOKEN_INVALID],
  ['provider outage', () => new Response(null, { status: 503 }), SupplierEmailVerifier.UNAVAILABLE],
  ['malformed response', () => Response.json({ code: 'ok' }), SupplierEmailVerifier.UNAVAILABLE],
  ['recipient mismatch', () => Response.json({ email: 'different@example.com', code: 'ok' }), SupplierEmailVerifier.UNAVAILABLE],
  ['timeout', () => { throw new DOMException('https://example.com/?key=test-secret', 'TimeoutError') }, SupplierEmailVerifier.UNAVAILABLE],
] as const) {
  test(`${name} fails closed without leaking provider details`, async () => {
    await assert.rejects(checker(async () => response()).requireDeliverable(email), errorIs(message))
  })
}

test('web and worker share a recent valid result without a second API call; cached keys conceal addresses and tokens', async () => {
  let calls = 0
  const memory = memoryStore()
  const request: typeof fetch = async () => { calls++; return Response.json({ email, code: 'ok' }) }
  const web = new SupplierEmailVerifier('test-secret', request, memory.store)
  const worker = new SupplierEmailVerifier('test-secret', request, memory.store)
  await web.requireDeliverable(email)
  await worker.requireDeliverable(email)
  assert.equal(calls, 1)
  assert.ok(!JSON.stringify([...memory.values]).includes(email))
  assert.ok(!JSON.stringify([...memory.values]).includes('test-secret'))
  memory.advance(SupplierEmailVerifier.CACHE_MS + 1)
  await worker.requireDeliverable(email)
  assert.equal(calls, 2)
})

test('invalid results are cached and block repeated invitations without spending more checks', async () => {
  let calls = 0
  const provider = checker(async () => { calls++; return Response.json({ email, code: 'ko' }) })
  for (let i = 0; i < 2; i++) await assert.rejects(provider.requireDeliverable(email), errorIs(SupplierEmailVerifier.INVALID))
  assert.equal(calls, 1)
})

test('different recipients respect the shared free-token cooldown across instances', async () => {
  let calls = 0
  const memory = memoryStore()
  const request: typeof fetch = async (input) => {
    calls++
    return Response.json({ email: new URL(String(input)).searchParams.get('email'), code: 'ok' })
  }
  const web = new SupplierEmailVerifier('test-secret', request, memory.store)
  const worker = new SupplierEmailVerifier('test-secret', request, memory.store)
  await web.requireDeliverable(email)
  await assert.rejects(worker.requireDeliverable('other@example.com'), errorIs(SupplierEmailVerifier.RATE_LIMITED))
  assert.equal(calls, 1)
  memory.advance(SupplierEmailVerifier.INTERVAL_MS + 1)
  await worker.requireDeliverable('other@example.com')
  assert.equal(calls, 2)
})

test('an unavailable shared cache blocks before contacting the provider', async () => {
  let calls = 0
  const memory = memoryStore()
  memory.store.get = async () => { throw new Error('Redis is offline') }
  const provider = new SupplierEmailVerifier('test-secret', async () => { calls++; return Response.json({ email, code: 'ok' }) }, memory.store)
  await assert.rejects(provider.requireDeliverable(email), errorIs(SupplierEmailVerifier.UNAVAILABLE))
  assert.equal(calls, 0)
})
