// Read-only connectivity checks; never enqueue work or send messages.
import { createRequire } from 'node:module'
const prismaRequire = createRequire(new URL('../../packages/prisma/package.json', import.meta.url))
const appRequire = createRequire(new URL('../../apps/builder/package.json', import.meta.url))
const { PrismaClient } = prismaRequire('@prisma/client')
const Redis = appRequire('ioredis')
const db = new PrismaClient()
const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 5000, retryStrategy: () => null })
redis.on('error', () => {})
const deadline = setTimeout(() => process.exit(1), 15000)
try {
  await db.$queryRaw`SELECT 1`
  if (await redis.ping() !== 'PONG') throw new Error('Redis is unavailable')
  const origin = process.env.DOCUMENT_SERVICE_URL || 'http://127.0.0.1:8080'
  const response = await fetch(new URL('/v1/verify', origin), {
    method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.DOCUMENT_SERVICE_TOKEN}` },
    signal: AbortSignal.timeout(5000),
  })
  // An authenticated, invalid request must be rejected before calling Google APIs.
  if (response.status !== 422) throw new Error('Document service authentication is unavailable')
} catch {
  process.exitCode = 1
} finally {
  await Promise.allSettled([db.$disconnect(), redis.quit()])
  clearTimeout(deadline)
}
