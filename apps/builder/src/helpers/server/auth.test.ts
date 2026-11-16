import assert from 'node:assert/strict'
import { test } from 'node:test'

import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'

import { env, googleAuthConfigured } from '@neo/env'

import { Authentication } from './auth'
import { Security } from './Security'

const credentials = {
  GOOGLE_CLIENT_ID: '123456789-testclient.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'GOCSPX-test-credential',
}

test('Google callbacks use the provider parameter to mark buyer sessions', async () => {
  const before = Authentication.create(false).options.databaseHooks!.session!.create!.before!
  for (const [path, id, expected] of [
    ['/callback/:id', 'google', Security.BUYER],
    ['/callback/:id', 'github', Security.UNKNOWN],
    ['/sign-in/email-otp', undefined, Security.SUPPLIER],
    ['/sign-in/demo', undefined, Security.DEMO],
  ] as const) {
    const result = await before({} as Parameters<typeof before>[0], {
      path, params: { id },
    } as unknown as Parameters<typeof before>[1])
    assert.ok(result && 'data' in result)
    assert.equal(result.data.authChannel, expected)
  }
})

test('Google OAuth requires a real client ID shape and a non-placeholder secret', () => {
  assert.equal(googleAuthConfigured(credentials), true)
  for (const values of [
    {},
    { ...credentials, GOOGLE_CLIENT_ID: '' },
    { ...credentials, GOOGLE_CLIENT_ID: 'local-google-client' },
    { ...credentials, GOOGLE_CLIENT_ID: 'your-client.apps.googleusercontent.com' },
    { ...credentials, GOOGLE_CLIENT_SECRET: '' },
    { ...credentials, GOOGLE_CLIENT_SECRET: 'local-google-secret' },
    { ...credentials, GOOGLE_CLIENT_SECRET: 'your-client-secret' },
  ]) assert.equal(googleAuthConfigured(values), false)
  assert.equal(googleAuthConfigured({
    GOOGLE_CLIENT_ID: ` ${credentials.GOOGLE_CLIENT_ID} `,
    GOOGLE_CLIENT_SECRET: ` ${credentials.GOOGLE_CLIENT_SECRET} `,
  }), true)
})

test('unconfigured Google credentials return an actionable error without redirecting to Google', {
  skip: googleAuthConfigured(env) ? 'Run with demo mode and missing or placeholder Google credentials' : false,
}, async () => {
  const auth = Authentication.create(false)
  const response = await auth.handler(new Request(`${env.APP_URL}/api/auth/sign-in/social`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: new URL(env.APP_URL).origin },
    body: JSON.stringify({ provider: 'google', callbackURL: '/', errorCallbackURL: '/' }),
  }))
  assert.equal(response.status, 503)
  assert.equal(response.headers.get('location'), null)
  assert.match((await response.json()).message, /Google sign-in is not configured/)
})

test('invalid callbacks return to the application sign-in page', async () => {
  const response = await Authentication.create(false).handler(new Request(`${env.APP_URL}/api/auth/callback/google?error=access_denied`))
  assert.equal(response.status, 302)
  const destination = new URL(response.headers.get('location')!, env.APP_URL)
  assert.equal(destination.origin, new URL(env.APP_URL).origin)
  assert.equal(destination.pathname, '/')
  assert.equal(destination.searchParams.get('error'), 'state_not_found')
})

for (const [localVerified, googleVerified] of [[true, true], [true, false], [false, true]] as const) {
  test(`existing email Google callback: local verified=${localVerified}, Google verified=${googleVerified}`, async () => {
    const db = { user: [], account: [], session: [], verification: [] }
    const options = Authentication.create(false).options
    const auth = betterAuth({
      ...options,
      database: memoryAdapter(db),
      socialProviders: { google: { clientId: credentials.GOOGLE_CLIENT_ID, clientSecret: credentials.GOOGLE_CLIENT_SECRET } },
      rateLimit: { enabled: false },
      // Test credentials are synthetic; keep the production guards in separate tests.
      hooks: undefined,
    })
    const context = await auth.$context
    const email = 'existing-user@example.test'
    const user = await context.internalAdapter.createUser({ email, emailVerified: localVerified, name: 'Existing user' }, { method: 'email-otp' })
    const provider = context.socialProviders.find((entry) => entry.id === 'google')!
    // Stub only Google's network boundary. Exercise actual OAuth state, linking and session creation.
    provider.validateAuthorizationCode = async () => ({ accessToken: 'synthetic-access-token' })
    provider.getUserInfo = async () => ({
      user: { email, emailVerified: googleVerified, name: 'Google user' },
      data: { sub: 'google-subject', email, email_verified: googleVerified },
    })
    const start = await auth.handler(new Request(`${env.APP_URL}/api/auth/sign-in/social`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: new URL(env.APP_URL).origin },
      body: JSON.stringify({ provider: 'google', callbackURL: '/', errorCallbackURL: '/' }),
    }))
    assert.equal(start.status, 200)
    const authorization = new URL((await start.json()).url)
    const state = authorization.searchParams.get('state')!
    assert.ok(state)
    const cookies = start.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ')
    const callback = await auth.handler(new Request(`${env.APP_URL}/api/auth/callback/google?code=synthetic-code&state=${encodeURIComponent(state)}`, {
      headers: { Cookie: cookies },
    }))
    assert.equal(callback.status, 302)
    const destination = new URL(callback.headers.get('location')!, env.APP_URL)
    const success = localVerified && googleVerified
    assert.equal(destination.searchParams.get('error'), success ? null : 'account_not_linked')
    const accounts = await context.internalAdapter.findAccounts(user.id)
    assert.equal(accounts.length, success ? 1 : 0)
    assert.equal(db.user.length, 1, 'preserve the existing user identity')
    if (success) {
      assert.equal(accounts[0].userId, user.id)
      assert.equal(accounts[0].providerId, 'google')
      const sessionCookies = callback.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ')
      const session = await auth.api.getSession({ headers: new Headers({ Cookie: sessionCookies }) })
      assert.equal(session?.user.id, user.id)
      assert.equal(session?.session.authChannel, Security.BUYER)
    } else {
      assert.equal(db.session.length, 0, 'unverified identities cannot sign in')
    }
  })
}
