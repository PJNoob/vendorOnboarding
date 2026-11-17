import assert from 'node:assert/strict'
import { test } from 'node:test'

import { SerpScreening } from './SerpScreening'

const subject = { country: 'AE', key: 'vendor', name: 'Acme Trading LLC' }
const answer = (results: object[]) => Response.json({ organic_results: results })

test('keeps only results that name the vendor and describe a ban, official sources first, without exposing the key', async () => {
  let calls = 0
  const request: typeof fetch = async (url, options) => {
    calls++
    assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer test-serp-key')
    assert.ok(!String(url).includes('test-serp-key'))
    return answer([
      { link: 'https://blog.example.com/a', snippet: 'Acme Trading LLC was blacklisted last year.', title: 'News' },
      { link: 'https://www.treasury.gov/list', snippet: 'Entry for ACME TRADING L.L.C. sanctioned', title: 'List' },
      { link: 'https://example.com/b', snippet: 'Acme Trading LLC opens a new office.', title: 'Press' },
      { link: 'https://example.com/c', snippet: 'Other Corp was banned.', title: 'Other' },
    ])
  }
  const serp = new SerpScreening('test-serp-key', request)
  const hits = await serp.search(subject)
  assert.deepEqual(hits.map((hit) => hit.official), [false, true].reverse())
  assert.equal(hits.length, 2)
  assert.ok(!JSON.stringify(hits).includes('test-serp-key'))
  await serp.search(subject)
  assert.equal(calls, 1)
})

for (const status of [401, 429, 500]) {
  test(`provider ${status} is reported as unavailable, never as a clear result`, async () => {
    const serp = new SerpScreening('test-serp-key', async () => new Response(null, { status }))
    await assert.rejects(serp.search(subject), new RegExp(String(status)))
  })
}

test('a missing key is not configured and refuses to search', async () => {
  const serp = new SerpScreening(undefined, async () => answer([]))
  assert.equal(serp.configured, false)
  await assert.rejects(serp.search(subject), /not configured/)
})
