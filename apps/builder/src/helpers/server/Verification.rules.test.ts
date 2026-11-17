import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { DocumentKind } from '@neo/prisma'
import { TaxIds } from '@neo/schemas'

import { Commands } from './Commands'
import { ReviewService } from './ReviewService'
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
    ['TAX', [page('tax', 'Federal Tax Authority. Tax Registration Certificate. TRN 100123456700003.')]],
    ['REGISTRATION', [page('reg', '')]], // unreadable pages are handled by the extraction review, not here
  ]))
  assert.deepEqual([finding.result, finding.code, finding.message], ['PASS', 'MATCHED', ''])
})

const country = (overrides: { bank?: string; company?: string; owners?: string[]; policy?: string[]; row?: string; vendor?: string } = {}) => ({
  policy: { bannedCountries: overrides.policy, documents: [], rules: [] },
  row: { country: overrides.row ?? 'US' },
  snapshot: {
    bankProfile: { country: overrides.bank ?? 'US' }, companyProfile: { country: overrides.company ?? overrides.row ?? 'US' },
    ownershipEdge_submission: [{ ownedEntityKey: 'vendor', ownerEntityKey: 'owner', percentage: 60 }],
    ownershipEntity_submission: [
      { country: overrides.vendor ?? overrides.row ?? 'US', entityKey: 'vendor', isVendor: true, legalName: 'Vendor Ltd' },
      ...(overrides.owners ?? []).map((code) => ({ country: code, entityKey: 'owner', isVendor: false, legalName: 'Owner Ltd' })),
    ],
  },
}) as never

test('a banned supplier, company or bank country fails the country check', () => {
  for (const overrides of [{ row: 'IR' }, { company: 'KP' }, { bank: 'SY' }]) {
    const finding = Verification.countryRestriction(country(overrides))
    assert.deepEqual([finding.result, finding.code], ['FAIL', 'COUNTRY_BANNED'])
  }
  assert.equal(Verification.countryRestriction(country()).result, 'PASS')
})

test('an owner in a banned country goes to compliance review and a tenant list overrides the default', () => {
  const owner = Verification.countryRestriction(country({ owners: ['CU'] }))
  assert.deepEqual([owner.result, owner.code, owner.message], ['REVIEW', 'OWNER_COUNTRY_BANNED', ''])
  assert.equal(Verification.countryRestriction(country({ policy: ['RU'], row: 'IR' })).result, 'PASS')
  assert.equal(Verification.countryRestriction(country({ policy: ['RU'], row: 'RU' })).result, 'FAIL')
})

test('adverse screening reviews hits and provider failures but passes clean results', async () => {
  const entity = country()
  const serp = (search: () => Promise<never[]>) => ({ configured: true, search }) as never
  const hit = [{ link: 'https://x.gov', official: true, snippet: 's', title: 't' }] as never[]
  const flagged = await Verification.adverse(entity, serp(async () => hit), false)
  assert.deepEqual([flagged.result, flagged.code, flagged.message], ['REVIEW', 'ADVERSE_MEDIA_MATCH', ''])
  const failed = await Verification.adverse(entity, serp(async () => { throw new Error('down') }), false)
  assert.deepEqual([failed.result, failed.code], ['REVIEW', 'SCREENING_UNAVAILABLE'])
  assert.equal((await Verification.adverse(entity, serp(async () => []), false)).result, 'PASS')
  assert.equal((await Verification.adverse(entity, { configured: false } as never, false)).code, 'SCREENING_UNAVAILABLE')
  assert.equal((await Verification.adverse(entity, { configured: false } as never, true)).source, 'FIXTURE')
})

test('the vendor country must be the same in the application, company profile and ownership declaration', () => {
  const ownership = Verification.countryRestriction(country({ row: 'AE', vendor: 'US' }))
  assert.deepEqual([ownership.result, ownership.code], ['FAIL', 'COUNTRY_MISMATCH'])
  assert.match(ownership.message, /your company in the ownership declaration \(US\) does not match the application country \(AE\)/)
  const company = Verification.countryRestriction(country({ company: 'IN', row: 'AE' }))
  assert.deepEqual([company.result, company.code], ['FAIL', 'COUNTRY_MISMATCH'])
  assert.match(company.message, /the company profile \(IN\)/)
  // A bank abroad is legitimate; only the vendor's own country must agree.
  assert.equal(Verification.countryRestriction(country({ bank: 'GB', row: 'AE' })).result, 'PASS')
  // A banned vendor country in the ownership declaration is still a ban, not just a mismatch.
  assert.equal(Verification.countryRestriction(country({ vendor: 'KP' })).code, 'COUNTRY_BANNED')
})

test('non-US tax identifiers must appear in the tax evidence, not only be well formed', () => {
  const profile = { formType: 'OTHER_REVIEW', vatRegistered: true }
  const evidence = [page('tax', 'GST registration certificate GSTIN 27AAPFU0939F1ZV. PAN AAPFU0939F')]
  assert.equal(Verification.tax('IN', profile, 'AAPFU0939F', '27AAPFU0939F1ZV', evidence).ok, true)
  const pan = Verification.tax('IN', profile, 'AAAPL1234C', '27AAPFU0939F1ZV', evidence)
  assert.deepEqual([pan.ok, pan.code], [false, 'TAX_MISMATCH'])
  const abn = Verification.tax('AU', { formType: 'OTHER_REVIEW', vatRegistered: false }, '51824753556', '',
    [page('tax', 'ABN registration details for Acme Pty Ltd')])
  assert.deepEqual([abn.ok, abn.code], [false, 'TAX_MISMATCH'])
})

test('every check the worker computes is recorded and required for approval', () => {
  // The worker drops findings whose rule is not in Commands.rules(policy); a check missing here is silently lost.
  const rules = Commands.rules({ rules: [...ReviewService.RULES] })
  for (const rule of ['ADVERSE_SCREENING', 'BANK_BENEFICIARY', 'CERTIFICATE_SCOPE', 'COUNTRY_RESTRICTION', 'DOCUMENT_TYPE',
    'ENTITY_CONSISTENCY', 'OWNERSHIP_SCREENING', 'TAX_PROFILE']) assert.ok(rules.includes(rule), rule)
  assert.ok(Commands.rules({ rules: ['BANK_BENEFICIARY'] }).includes('DOCUMENT_TYPE'))
})

test('a UAE commercial licence is accepted as registration evidence', () => {
  const finding = Verification.documentTypes(docs([
    ['REGISTRATION', [page('reg', 'Dubai Economy and Tourism. Commercial Licence. Licence No: DED-884213. Legal form: LLC.')]],
  ]))
  assert.equal(finding.result, 'PASS')
})
