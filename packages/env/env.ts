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
    DATABASE_POOL_SIZE: z.coerce.number().int().positive(),
    DATABASE_URL: z.url(),
    DEMO_AUTH: z.enum(RuntimeValues.BOOLEAN).default('false'),
    DEMO_SCREENING: z.enum(RuntimeValues.BOOLEAN),
    EMAIL_FROM: z.email(),
    GCS_CLEAN_BUCKET: z.string().min(1),
    GCS_QUARANTINE_BUCKET: z.string().min(1),
    GOOGLE_CLIENT_ID: demoAuthEnabled() ? z.string().optional() : z.string().min(1),
    GOOGLE_CLIENT_SECRET: demoAuthEnabled() ? z.string().optional() : z.string().min(1),
    PII_KEY: z.string().regex(RuntimeValues.HEX_KEY),
    REDIS_URL: z.url(),
    RESEND_API_KEY: z.string().min(1),
    SCREENING_TOKEN: z.string().min(1),
    SCREENING_URL: z.url(),
  },
  skipValidation: process.env.NEXT_PHASE === 'phase-production-build',
})
