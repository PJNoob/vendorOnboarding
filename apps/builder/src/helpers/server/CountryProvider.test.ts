import assert from 'node:assert/strict'
import { test } from 'node:test'

import { profiles, inputs } from '@neo/schemas'
import { CountryProvider } from './CountryProvider'

const record = (code: string, name: string) => ({ codes: { alpha_2: code }, names: { common: name } })

test('fetches every page, sorts names, and shares cached requests without exposing the key', async () => {
  const offsets: string[] = []
  const request: typeof fetch = async (url, options) => {
    assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer test-country-key')
    assert.equal(new URL(String(url)).searchParams.get('response_fields'), 'names.common,codes.alpha_2')
    const offset = new URL(String(url)).searchParams.get('offset')!
    offsets.push(offset)
    return Response.json({ data: {
      objects: offset === '0' ? [record('', 'Territory without ISO code'), record('US', 'United States')] : [record('IN', 'India')],
      meta: { more: offset === '0' },
    } })
  }
  const provider = new CountryProvider('test-country-key', request)
  const [first, second] = await Promise.all([provider.list(), provider.list()])
  assert.deepEqual(first, [{ code: 'IN', name: 'India' }, { code: 'US', name: 'United States' }])
  assert.deepEqual(first, second)
  assert.deepEqual(await provider.list(), first)
  assert.deepEqual(offsets, ['0', '2'])
  assert.ok(!JSON.stringify(first).includes('test-country-key'))
})

for (const status of [401, 429, 503]) {
  test(`country API ${status} keeps forms available without repeated quota usage`, async () => {
    let calls = 0
    const provider = new CountryProvider('test-country-key', async () => { calls++; return new Response(null, { status }) })
    assert.deepEqual(await provider.list(), CountryProvider.FALLBACK)
    await provider.list()
    assert.equal(calls, 1)
  })
}

test('profile, invitation, and filter schemas accept international country codes', () => {
  assert.equal(profiles.bank.shape.country.safeParse('IN').success, true)
  assert.equal(profiles.company.shape.country.safeParse('GB').success, true)
  assert.equal(profiles.company.shape.country.safeParse('invalid').success, false)
  assert.equal(inputs.create.shape.country.safeParse('IN').success, true)
  assert.equal(inputs.list.shape.country.safeParse('IN').success, true)
  assert.equal(inputs.create.shape.country.safeParse('invalid').success, false)
})
