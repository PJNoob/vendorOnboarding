import assert from 'node:assert/strict'
import { test } from 'node:test'

import { issueDetail } from './IssueDetail'

const entities = [
  { entityKey: 'v', legalName: 'Acme Ltd' },
  { entityKey: 'p', legalName: 'Blocked Holdings' },
]

test('blocked chain names the sanctioned entity and inherited vendor', () => {
  const trace = { blocked: ['p', 'v'], matches: [{ key: 'p', match: 'BLOCKED' }] }
  assert.equal(issueDetail('OWNERSHIP_BLOCKED_CHAIN', trace, entities),
    'Sanctioned entity: Blocked Holdings. Blocked through ownership: Acme Ltd.')
})

test('possible match, banned-country owner and adverse media name the entity', () => {
  assert.match(issueDetail('OWNERSHIP_POSSIBLE_MATCH', { blocked: [], matches: [{ key: 'p', match: 'POSSIBLE' }] }, entities) ?? '', /Blocked Holdings/)
  assert.match(issueDetail('OWNER_COUNTRY_BANNED', { owners: [{ country: 'IR', name: 'Foo LLC' }] }, entities) ?? '', /Foo LLC \(IR\)/)
  assert.match(issueDetail('ADVERSE_MEDIA_MATCH', { hits: [{ entity: 'Acme Ltd', results: [] }] }, entities) ?? '', /Acme Ltd/)
})

test('unknown codes or malformed traces give no detail', () => {
  assert.equal(issueDetail('TAX_MISMATCH', {}, entities), undefined)
  assert.equal(issueDetail('OWNERSHIP_BLOCKED_CHAIN', null, entities), undefined)
})
