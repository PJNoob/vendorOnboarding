import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

class RuntimeValues {
  static readonly BOOLEAN = ['false', 'true'] as const
  static readonly HEX_KEY = /^[a-fA-F0-9]{64}$/
}

export function demoAuthEnabled() {
  const { APP_URL, DEMO_AUTH, NODE_ENV } = process.env
  if (DEMO_AUTH !== 'true' || NODE_ENV === 'production' || !APP_URL || !URL.canParse(APP_URL)) return false
  const url = new URL(APP_URL)
  return ['http:', 'https:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
}

export const env = createEnv({
  experimental__runtimeEnv: {},
  server: {
    APP_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    BOOTSTRAP_ADMIN_EMAIL: z.email(),
    CERTIFICATE_RLM_MODEL: z.string().trim().min(1).max(128).default('qwen3:8b'),
    CERTIFICATE_RLM_URL: z.preprocess((value) => value === '' ? undefined : value, z.httpUrl().optional()),
    DATABASE_POOL_SIZE: z.coerce.number().int().positive(),
    DATABASE_URL: z.url(),
    DEMO_AUTH: z.enum(RuntimeValues.BOOLEAN).default('false'),
    DEMO_LOGIN_TOKEN: z.preprocess((value) => value === '' ? undefined : value, z.string().min(16).max(256).optional()),
    DEMO_SCREENING: z.enum(RuntimeValues.BOOLEAN),
    EMAIL_FROM: z.email(),
    GCS_CLEAN_BUCKET: z.string().min(1),
    GCS_QUARANTINE_BUCKET: z.string().min(1),
    GOOGLE_CLIENT_ID: demoAuthEnabled() ? z.string().optional() : z.string().min(1),
    GOOGLE_CLIENT_SECRET: demoAuthEnabled() ? z.string().optional() : z.string().min(1),
    PII_KEY: z.string().regex(RuntimeValues.HEX_KEY),
    REDIS_URL: z.url(),
    RESEND_API_KEY: z.string().min(1),
    SCREENING_PROVIDER: z.enum(['http', 'ofac']).default('http'),
    SCREENING_TOKEN: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional()),
    SCREENING_URL: z.preprocess((value) => value === '' ? undefined : value, z.url().optional()),
  },
  skipValidation: process.env.NEXT_PHASE === 'phase-production-build',
})

if (process.env.NEXT_PHASE !== 'phase-production-build' && env.DEMO_SCREENING === 'false' &&
  env.SCREENING_PROVIDER === 'http' && (!env.SCREENING_TOKEN || !env.SCREENING_URL)) {
  throw new Error('SCREENING_TOKEN and SCREENING_URL are required for the HTTP screening provider')
}
