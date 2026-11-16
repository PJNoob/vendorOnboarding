import assert from 'node:assert/strict'
import test from 'node:test'

import { reviewCertificateScope } from './CertificateScopeReview'
import { parseSdn, screenOfac } from './OfacScreening'

const xml = `<?xml version="1.0"?>
<sdnList xmlns="https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/XML">
  <publshInformation><Publish_Date>01/02/2025</Publish_Date><Record_Count>1</Record_Count></publshInformation>
  <sdnEntry>
    <uid>501</uid><firstName>Áda</firstName><lastName>Example</lastName>
    <akaList><aka><uid>502</uid><lastName>Example &amp; Co</lastName></aka></akaList>
    <addressList><address><uid>503</uid><country>Example</country></address></addressList>
  </sdnEntry>
</sdnList>`

test('indexes SDN names and aliases by the parent record ID', () => {
  const feed = parseSdn(xml)
  assert.equal(feed.publishedOn, '2025-01-02')
  assert.deepEqual([...feed.records.get('adaexample') ?? []], ['501'])
  assert.deepEqual([...feed.records.get('exampleada') ?? []], ['501'])
  assert.deepEqual([...feed.records.get('exampleco') ?? []], ['501'])
})

test('rejects incomplete or malformed SDN data', () => {
  assert.throws(() => parseSdn(xml.replace('<Record_Count>1', '<Record_Count>2')))
  assert.throws(() => parseSdn(xml.replace('01/02/2025', '02/30/2025')))
  assert.throws(() => parseSdn(xml.replace('</sdnList>', '')))
  assert.throws(() => parseSdn(xml.replace('<sdnList', '<!DOCTYPE sdnList [<!ENTITY fake "name">]><sdnList')))
})

test('only follows the approved SDN export redirect and rejects stale refreshes', async (context) => {
  let location = 'https://untrusted.example/Published/feed/SDN.XML'
  let age = '0'
  const fetch = context.mock.method(globalThis, 'fetch', async (url: URL | string) => {
    if (String(url).startsWith('https://sanctionslistservice.ofac.treas.gov/')) {
      return new Response(null, { status: 302, headers: { location } })
    }
    return new Response(xml, { headers: { age } })
  })
  const entities = [{ key: 'supplier', name: 'Example & Co' }]
  await assert.rejects(screenOfac(entities), /Unexpected OFAC SDN feed redirect/)
  assert.equal(fetch.mock.callCount(), 1)

  location = 'https://wc2h-sls-prod-public-published.s3.us-gov-west-1.amazonaws.com/Published/feed/SDN.XML'
  const result = await screenOfac(entities)
  assert.deepEqual(result.matches, [{ key: 'supplier', match: 'POSSIBLE', recordIds: ['501'] }])
  assert.match(result.dataset, /^OFAC-SDN:2025-01-02:[a-f0-9]{64}$/)
  assert.equal((await screenOfac(entities)).dataset, result.dataset)
  assert.equal(fetch.mock.callCount(), 3)

  context.mock.method(Date, 'now', () => Date.parse(result.fetchedAt) + 60 * 60 * 1000)
  age = '3600'
  await assert.rejects(screenOfac(entities), /OFAC SDN feed is unavailable/)
})

const scope = { activity: 'CALIBRATION', site: 'Example City', standards: ['ISO 17025'] }
const pages = [
  { documentId: 'cert', page: 1, text: 'Accreditation standard: ISO 17025.' },
  { documentId: 'annex', page: 2, text: 'Scope annex: calibration at Example City.' },
]
const model = { name: 'fixture', url: 'http://127.0.0.1:11434' }

test('recurses into selected certificate sections and discards fabricated excerpts', async (context) => {
  const requests: unknown[] = []
  context.mock.method(globalThis, 'fetch', async (_url: URL, request: RequestInit) => {
    const payload = JSON.parse(String(request.body))
    const input = JSON.parse(payload.messages[1].content)
    requests.push(input)
    const content = input.index ? { inspect: [1, 2, 2, 99] } :
      input.text === pages[0].text ? { citations: [{ field: 'standard', quote: 'ISO 17025' }] } :
        { citations: [{ field: 'site', quote: 'Example City' }, { field: 'activity', quote: 'impostor activity' }] }
    return Response.json({ message: { content: JSON.stringify(content) } })
  })

  const result = await reviewCertificateScope(pages, scope, model)
  assert.equal(requests.length, 3)
  assert.equal(result.status, 'suggested')
  assert.deepEqual(result.citations.map(({ documentId, page, quote }) => ({ documentId, page, quote })), [
    { documentId: 'annex', page: 2, quote: 'Example City' },
    { documentId: 'cert', page: 1, quote: 'ISO 17025' },
  ])
})

test('keeps certificate evidence optional when the model fails', async (context) => {
  const fetch = context.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 503 }))
  assert.equal((await reviewCertificateScope([], scope, model)).status, 'no_evidence')
  assert.equal(fetch.mock.callCount(), 0)
  assert.deepEqual(await reviewCertificateScope(pages, scope, model), {
    citations: [], model: model.name, status: 'unavailable',
  })
})

test('Gemini section selection and subcalls retain source quotes and the configured model', async () => {
  const scopes: unknown[] = []
  const result = await reviewCertificateScope(pages, scope, {
    name: 'Gemini',
    async generate(_instruction, data) {
      const input = data as { index?: unknown; text?: string }
      scopes.push(data)
      const content = input.index ? { inspect: [1, 2] } : {
        citations: input.text === pages[0].text
          ? [{ field: 'standard', quote: 'ISO 17025' }]
          : [{ field: 'site', quote: 'Example City' }, { field: 'activity', quote: 'invented' }],
      }
      return { model: 'configured-gemini-model', text: JSON.stringify(content) }
    },
  })
  assert.equal(scopes.length, 3)
  assert.equal(result.status, 'suggested')
  assert.equal(result.model, 'configured-gemini-model')
  assert.deepEqual(result.citations.map((citation) => citation.quote), ['Example City', 'ISO 17025'])
})
