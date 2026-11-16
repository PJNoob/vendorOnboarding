import { createHash, createHmac } from 'node:crypto'
import { get } from 'node:https'
import { TRPCError } from '@trpc/server'
import IORedis from 'ioredis'
import { z } from 'zod'

import { env } from '@neo/env'

const resultSchema = z.object({ email: z.email(), code: z.enum(['ok', 'ko', 'mb', '--']) })

export interface VerificationStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttlMs: number, onlyIfAbsent?: boolean): Promise<boolean>
}

let redis: IORedis | undefined
function connection() {
  if (!redis || redis.status === 'end') {
    redis = new IORedis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 2_000, retryStrategy: () => null })
    // Convert connection errors into the safe verification error below.
    redis.on('error', () => {})
  }
  return redis
}

const sharedStore: VerificationStore = {
  get: (key) => connection().get(key),
  async set(key, value, ttlMs, onlyIfAbsent) {
    return (onlyIfAbsent
      ? await connection().set(key, value, 'PX', ttlMs, 'NX')
      : await connection().set(key, value, 'PX', ttlMs)) === 'OK'
  },
}

// Next may log fetch URLs. Use native HTTPS because this API requires a secret
// query parameter; never log the request URL or attach it to a surfaced error.
const requestProvider: typeof fetch = (input, options) => new Promise((resolve, reject) => {
  const request = get(new URL(String(input)), { signal: options?.signal ?? undefined }, (response) => {
    const chunks: Buffer[] = []
    let length = 0
    response.on('data', (chunk: Buffer) => {
      length += chunk.length
      if (length > 65_536) { request.destroy(new Error('verification response too large')); return }
      chunks.push(chunk)
    })
    response.on('error', reject)
    response.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: response.statusCode ?? 502 })))
  })
  request.on('error', reject)
})

export class SupplierEmailVerifier {
  static readonly INVALID = 'Incorrect supplier credentials. Enter the correct supplier email.'
  static readonly UNAVAILABLE = 'Unable to verify supplier email. Invitation was not sent. Please try again.'
  static readonly NOT_CONFIGURED = 'Supplier email verification is not configured. Invitation was not sent.'
  static readonly RATE_LIMITED = 'Email verification is busy or its free limit has been reached. Invitation was not sent. Wait at least 35 seconds and try again.'
  static readonly TOKEN_INVALID = 'The email verification token is invalid or expired. Invitation was not sent.'
  static readonly ENDPOINT = 'https://happy.mailtester.ninja/ninja'
  static readonly TIMEOUT_MS = 15_000
  static readonly CACHE_MS = 5 * 60_000
  static readonly INTERVAL_MS = 35_000

  constructor(
    private readonly token = env.MAILTESTER_NINJA_API_KEY,
    private readonly request: typeof fetch = requestProvider,
    private readonly store: VerificationStore = sharedStore,
  ) {}

  async requireDeliverable(value: string): Promise<void> {
    const email = value.trim().toLowerCase()
    if (!z.email().safeParse(email).success) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Enter a valid mail' })
    if (!this.token) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: SupplierEmailVerifier.NOT_CONFIGURED })

    // Shared cache lets the web and worker reuse a recent verdict without consuming
    // two checks or immediately hitting the free token's 30-second request limit.
    const keyId = createHash('sha256').update(this.token).digest('hex')
    const cacheKey = `supplier-email:${keyId}:${createHmac('sha256', this.token).update(email).digest('hex')}`
    let cached: string | null
    let acquired = false
    try {
      cached = await this.store.get(cacheKey)
      if (cached !== 'ok' && cached !== 'ko') {
        acquired = await this.store.set(`supplier-email-rate:${keyId}`, '1', SupplierEmailVerifier.INTERVAL_MS, true)
      }
    } catch {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: SupplierEmailVerifier.UNAVAILABLE })
    }
    if (cached === 'ok') return
    if (cached === 'ko') throw new TRPCError({ code: 'BAD_REQUEST', message: SupplierEmailVerifier.INVALID })
    if (!acquired) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: SupplierEmailVerifier.RATE_LIMITED })

    let result: z.infer<typeof resultSchema>
    try {
      const url = new URL(SupplierEmailVerifier.ENDPOINT)
      url.searchParams.set('email', email)
      url.searchParams.set('key', this.token)
      const response = await this.request(url, {
        method: 'GET', signal: AbortSignal.timeout(SupplierEmailVerifier.TIMEOUT_MS), redirect: 'error',
        cache: 'no-store',
      })
      if (response.status === 429) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: SupplierEmailVerifier.RATE_LIMITED })
      if (response.status === 401 || response.status === 403) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: SupplierEmailVerifier.TOKEN_INVALID })
      if (!response.ok) throw new Error('verification unavailable')
      result = resultSchema.parse(await response.json())
      if (result.email.toLowerCase() !== email) throw new Error('verification recipient mismatch')
    } catch (error) {
      if (error instanceof TRPCError) throw error
      // Never expose fetch errors: they may contain the credential-bearing URL.
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: SupplierEmailVerifier.UNAVAILABLE })
    }
    if (result.code === 'ok' || result.code === 'ko') {
      try { await this.store.set(cacheKey, result.code, SupplierEmailVerifier.CACHE_MS) } catch {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: SupplierEmailVerifier.UNAVAILABLE })
      }
    }
    if (result.code === 'ko') throw new TRPCError({ code: 'BAD_REQUEST', message: SupplierEmailVerifier.INVALID })
    if (result.code !== 'ok') throw new TRPCError({ code: 'PRECONDITION_FAILED', message: SupplierEmailVerifier.UNAVAILABLE })
  }
}

export const supplierEmailVerifier = new SupplierEmailVerifier()
