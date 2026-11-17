import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { DocumentKind } from '@neo/prisma'
import { TaxIds } from '@neo/schemas'

import { type Evidence, Verification } from './Verification'

const docs = (entries: [DocumentKind, Evidence[]][]) => new Map(entries)

const page = (documentId: string, text: string) => ({ documentId, page: 1, text })

test('tax identifiers are validated for the claimed country, including checksums', () => {
  for (const [country, kind, value] of [
    ['US', 'TAX_ID', '12-3456789'], ['AE', 'VAT', '100123456700003'], ['IN', 'VAT', '27AAPFU0939F1ZV'],
    ['GB', 'VAT', 'GB 980 7806 84'], ['AU', 'TAX_ID', '51 824 753 556'], ['DE', 'VAT', 'DE123456789'],
  ] as const) assert.equal(TaxIds.check(country, kind, value).valid, true, `${country} ${value}`)
  for (const [country, kind, value] of [
    ['US', 'TAX_ID', '100123456700003'], // a UAE TRN declared for a US supplier
    ['AE', 'VAT', '12-3456789'], ['IN', 'VAT', '27AAPFU0939F1ZX'], ['GB', 'VAT', 'GB980780685'], ['AU', 'TAX_ID', '51824753557'],
  ] as const) assert.equal(TaxIds.check(country, kind, value).valid, false, `${country} ${value}`)
})

test('tax format problems explain the expected identifier for the country', () => {
  assert.equal(TaxIds.problem('US', { taxId: '12-3456789', vatRegistered: false }), undefined)
  assert.match(TaxIds.problem('US', { taxId: '1234567', vatRegistered: false }) ?? '', /not valid for US.*EIN.*12-3456789/)
  assert.match(TaxIds.problem('AE', { vatRegistered: true }) ?? '', /Enter the VAT registration number/)
  assert.match(TaxIds.problem('AE', { vatRegistered: true, vatTrn: '123456789012345' }) ?? '', /UAE Tax Registration Number/)
  // Countries without a published rule only need a plausible identifier and are reviewed manually.
  assert.equal(TaxIds.problem('BR', { taxId: '12.345.678/0001-95'.replace('/', ''), vatRegistered: false }), undefined)
})

test('the tax rule reports a wrong-format identifier separately from missing evidence', () => {
  const evidence = [page('tax', 'Form W-9 Employer identification number 12-3456789')]
  assert.deepEqual(Verification.tax('US', { formType: 'W9', vatRegistered: false }, '12-3456789', '', evidence).ok, true)
  const wrong = Verification.tax('US', { formType: 'W9', vatRegistered: false }, '123', '', evidence)
  assert.equal(wrong.ok, false)
  assert.equal(wrong.code, 'TAX_FORMAT_INVALID')
  const unevidenced = Verification.tax('US', { formType: 'W9', vatRegistered: false }, '98-7654321', '', evidence)
  assert.deepEqual([unevidenced.ok, unevidenced.code], [false, 'TAX_MISMATCH'])
  const uae = Verification.tax('AE', { formType: 'OTHER_REVIEW', vatRegistered: true }, '', '100123456700003',
    [page('tax', 'Tax Registration Certificate TRN 100123456700003')])
  assert.equal(uae.ok, true)
})

test('legal names match across common legal-form spellings but not different companies', () => {
  assert.equal(Verification.sameName('Cedar Meridian QA Calibration Limited', 'CEDAR MERIDIAN QA CALIBRATION LTD.'), true)
  assert.equal(Verification.sameName('Acme Corporation', 'Acme Corp'), true)
  assert.equal(Verification.sameName('Smith & Sons LLC', 'Smith and Sons L.L.C.'), true)
  assert.equal(Verification.sameName('Acme Ltd', 'Acme Holdings Ltd'), false)
})

test('documents uploaded under the wrong kind are flagged with what to upload instead', () => {
  const finding = Verification.documentTypes(docs([
    ['BANK', [page('bank', 'ISO/IEC 17025 accreditation certificate. Scope of calibration activities at Site A.')]],
    ['TAX', [page('tax', 'Form W-9 Request for Taxpayer Identification Number. EIN 12-3456789.')]],
  ]))
  assert.equal(finding.result, 'FAIL')
  assert.equal(finding.code, 'DOCUMENT_TYPE_MISMATCH')
  assert.match(finding.message, /uploaded as bank evidence does not look like bank evidence\. Upload a bank letter/)
  assert.doesNotMatch(finding.message, /tax evidence/)
  assert.deepEqual(finding.evidence.map((item) => item.documentId), ['bank'])
})

test('correct and unreadable documents do not trigger the document-type check', () => {
  const finding = Verification.documentTypes(docs([
    ['BANK', [page('bank', 'First National Bank confirms account holder Acme Ltd, account number 12345678, SWIFT FNBAUS33.')]],
    ['OWNERSHIP', [page('own', 'Acme Ltd is owned 100% by Acme Holdings Ltd, its sole shareholder and parent company.')]],
    ['REGISTRATION', [page('reg', '')]], // unreadable pages are handled by the extraction review, not here
  ]))
  assert.deepEqual([finding.result, finding.code, finding.message], ['PASS', 'MATCHED', ''])
})
