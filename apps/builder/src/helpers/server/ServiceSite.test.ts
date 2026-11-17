import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inputs, profiles } from '@neo/schemas'

const create = { category: 'CALIBRATION' as const, country: 'US', requestedSite: 'Kabul laboratory', supplierEmail: 'supplier@example.com', idempotencyKey: 'd31e3c5a-1255-4699-aef1-55bc112d7f37' }

test('requested service sites must be able to name a place', () => {
  assert.equal(inputs.create.safeParse(create).success, true)
  for (const requestedSite of ['', '  ', 'ab', '123', '---']) {
    assert.equal(inputs.create.safeParse({ ...create, requestedSite }).success, false, requestedSite)
  }
})

test('qualification sites follow the same rule', () => {
  const row = { activity: 'CALIBRATION', site: 'Kabul', standard: 'ISO/IEC 17025' }
  assert.equal(profiles.qualifications.safeParse([row]).success, true)
  assert.equal(profiles.qualifications.safeParse([{ ...row, site: '12' }]).success, false)
})
