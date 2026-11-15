import assert from 'node:assert/strict'
import { test } from 'node:test'

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
