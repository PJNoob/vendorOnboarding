import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

class RuntimeValues {
  static readonly BOOLEAN = ['false', 'true'] as const
  static readonly HEX_KEY = /^[a-fA-F0-9]{64}$/
}

const googleClientId = z.string().trim().regex(/^\d+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/, 'Use a Google Web application OAuth client ID')
const googleClientSecret = z.string().trim().min(1).refine(
  (value) => !/placeholder|example|replace|your[-_ ]|^demo|^local/i.test(value),
  'Use the matching Google OAuth client secret',
)

export function googleAuthConfigured(values: { GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string } = {
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
}) {
  return googleClientId.safeParse(values.GOOGLE_CLIENT_ID).success && googleClientSecret.safeParse(values.GOOGLE_CLIENT_SECRET).success
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
    DEMO_LOGIN_TOKEN: z.preprocess((value) => value === '' ? undefined : value, z.string().min(16).max(256).optional()),
    DEMO_SCREENING: z.enum(RuntimeValues.BOOLEAN),
    EMAIL_FROM: z.email(),
    GCS_CLEAN_BUCKET: z.string().min(1),
    GCS_QUARANTINE_BUCKET: z.string().min(1),
    GOOGLE_CLIENT_ID: demoAuthEnabled() ? z.string().optional() : googleClientId,
    GOOGLE_CLIENT_SECRET: demoAuthEnabled() ? z.string().optional() : googleClientSecret,
    PII_KEY: z.string().regex(RuntimeValues.HEX_KEY),
    REDIS_URL: z.url(),
    RESEND_API_KEY: z.string().min(1),
    SCREENING_TOKEN: z.string().min(1),
    SCREENING_URL: z.url(),
  },
  skipValidation: process.env.NEXT_PHASE === 'phase-production-build',
})
