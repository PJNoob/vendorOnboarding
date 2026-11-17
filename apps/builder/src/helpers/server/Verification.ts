import { z } from 'zod'

import { env } from '@neo/env'
import { Prisma, type CheckResult, type DocumentKind, type SourceMode } from '@neo/prisma'
import { TaxIds, Values } from '@neo/schemas'

import { Commands } from './Commands'
import { screenOfac } from './OfacScreening'
import { Secrets } from './Security'
import { SerpScreening, serpScreening } from './SerpScreening'

export interface Evidence {
  documentId: string
  page: number
  text: string
}
export interface Finding {
  code: string
  evidence: Evidence[]
  message: string
  result: CheckResult
  rule: string
  source: SourceMode
  trace?: Prisma.InputJsonObject
}

type Current = Awaited<ReturnType<typeof Commands.current>>
type Entity = Current['snapshot']['ownershipEntity_submission'][number]

export class Verification {
  static readonly BLOCKED_THRESHOLD = 50
  static readonly ADVERSE_OWNER_PERCENT = 25
  static readonly ADVERSE_SEARCH_LIMIT = 5
  static readonly DATASET = 'training-fixture-v1'
  static readonly TIMEOUT_MS = 15_000

  // Legal-form words that suppliers and banks abbreviate differently ("Acme Limited" vs "ACME LTD").
  private static readonly LEGAL_FORMS: [RegExp, string][] = [
    [/\blimited\b/g, 'ltd'], [/\bincorporated\b/g, 'inc'], [/\bcorporation\b/g, 'corp'],
    [/\bcompany\b/g, 'co'], [/\bprivate\b/g, 'pvt'], [/\bl\.\s?l\.\s?c\.?/g, 'llc'], [/&/g, 'and'],
  ]

  // Words that a document of each kind is expected to contain. A file with readable text but none of
  // these is probably the wrong document (for example an ISO certificate uploaded as bank evidence).
  static readonly DOCUMENT_SIGNALS: Record<DocumentKind, { pattern: RegExp; expected: string; noun: string }> = {
    BANK: { expected: 'a bank letter or statement showing the account holder and account number', noun: 'bank evidence',
      pattern: /\b(bank|banking|iban|swift|bic|account\s+(number|no|holder|name)|routing|sort\s+code|beneficiary|ifsc)\b/i },
    CERTIFICATE: { expected: 'the accreditation certificate and its scope annex', noun: 'a quality certificate',
      pattern: /\b(iso|iec|accredit\w*|certificat\w*|scope|calibration)\b/i },
    OWNERSHIP: { expected: 'an ownership declaration listing each owner and percentage', noun: 'an ownership declaration',
      pattern: /\b(owner\w*|shareholder\w*|shareholding|beneficial|equity|parent|subsidiar\w*)\b|%|\bper\s?cent\b/i },
    REGISTRATION: { expected: 'the company registration or incorporation certificate', noun: 'a company registration document',
      pattern: /\b(registration|registered|registry|register|incorporat\w*|company\s+(number|no)|trade\s+licen[cs]e|articles\s+of|formation)\b/i },
    TAX: { expected: 'the tax registration certificate or tax form (for example a W-9 or VAT certificate)', noun: 'a tax document',
      pattern: /\b(tax\w*|w-?9|w-?8\w*|vat|trn|gstin?|ein|pan|tin|irs|revenue)\b/i },
  }

  private static compact(value: string) {
    let text = value.toLowerCase()
    for (const [pattern, replacement] of Verification.LEGAL_FORMS) text = text.replace(pattern, replacement)
    return text.replace(/[^a-z0-9]/g, '')
  }

  private static has(value: string, evidence: Evidence[]) {
    const key = Verification.compact(value)
    return Boolean(key) && evidence.some((item) => Verification.compact(item.text).includes(key))
  }

  /** True when two legal names are the same entity name once punctuation, case and legal-form spelling are ignored. */
  static sameName(left: string, right: string) {
    return Verification.compact(left) === Verification.compact(right)
  }

  /** Flags uploaded documents whose readable text does not look like the kind they were uploaded as. */
  static documentTypes(documents: Map<DocumentKind, Evidence[]>): Finding {
    const mismatched: { kind: DocumentKind; pages: Evidence[] }[] = []
    for (const [kind, pages] of documents) {
      const signal = Verification.DOCUMENT_SIGNALS[kind]
      if (!signal) continue
      const byDocument = new Map<string, Evidence[]>()
      for (const page of pages) byDocument.set(page.documentId, [...byDocument.get(page.documentId) ?? [], page])
      for (const documentPages of byDocument.values()) {
        const text = documentPages.map((page) => page.text).join('\n')
        if (text.trim().length >= 40 && !signal.pattern.test(text)) mismatched.push({ kind, pages: documentPages })
      }
    }
    const message = mismatched.map(({ kind }) => {
      const signal = Verification.DOCUMENT_SIGNALS[kind]
      return `The file uploaded as ${kind.toLowerCase()} evidence does not look like ${signal.noun}. Upload ${signal.expected}.`
    }).join(' ')
    return {
      code: mismatched.length ? 'DOCUMENT_TYPE_MISMATCH' : 'MATCHED', evidence: mismatched.flatMap(({ pages }) => pages),
      message, result: mismatched.length ? 'FAIL' : 'PASS', rule: 'DOCUMENT_TYPE', source: 'MANUAL',
    }
  }

  /** Tax rule outcome: well-formed identifiers for the country that also appear in the tax evidence. */
  static tax(country: string, profile: { formType: string; vatRegistered: boolean }, taxId: string, vat: string, tax: Evidence[]) {
    const problem = TaxIds.problem(country, { taxId, vatRegistered: profile.vatRegistered, vatTrn: vat })
    if (problem) return { code: 'TAX_FORMAT_INVALID', message: problem, ok: false }
    const ok = country === 'US'
      ? profile.formType === 'W9' && Boolean(taxId) && Verification.has(taxId, tax)
      : profile.formType === 'OTHER_REVIEW' && !profile.vatRegistered ||
        profile.vatRegistered && Boolean(vat) && Verification.has(vat, tax)
    return { code: 'TAX_MISMATCH', message: 'Correct the tax details and provide matching tax evidence.', ok }
  }

  private static async matches(entities: Entity[]) {
    if (env.DEMO_SCREENING === 'true') {
      return {
        dataset: Verification.DATASET,
        matches: entities.filter((item) => item.registryId === 'FIXTURE-BLOCKED-001')
          .map((item) => ({ key: item.entityKey, match: 'BLOCKED' as const })),
      }
    }
    const subjects = entities.map(({ country, entityKey, legalName, registryId }) => ({
      country, key: entityKey, name: legalName, ...(registryId ? { registryId } : {}),
    }))
    if (env.SCREENING_PROVIDER === 'ofac') return screenOfac(subjects)
    const url = env.SCREENING_URL
    Commands.require(url && env.SCREENING_TOKEN, 'HTTP screening provider is not configured')
    const response = await fetch(url, {
      body: JSON.stringify({ entities: subjects }),
      headers: { Authorization: `Bearer ${env.SCREENING_TOKEN}`, 'Content-Type': 'application/json' },
      method: 'POST',
      signal: AbortSignal.timeout(Verification.TIMEOUT_MS),
    })
    if (!response.ok) throw new Error('screening service is unavailable')
    return z.object({
      dataset: z.string().min(1),
      matches: z.array(z.object({ key: z.string(), match: z.enum(['BLOCKED', 'POSSIBLE']) })),
    }).parse(await response.json())
  }

  private static async ownership({ snapshot }: Current, evidence: Evidence[]): Promise<Finding> {
    const entities = snapshot.ownershipEntity_submission
    const edges = snapshot.ownershipEdge_submission
    const source = env.DEMO_SCREENING === 'true' ? 'FIXTURE' : 'LIVE'
    const vendor = entities.find((item) => item.isVendor)
    const base = { evidence, rule: 'OWNERSHIP_SCREENING', source } as const
    if (!vendor || !snapshot.companyProfile || !evidence.length ||
      Verification.compact(vendor.legalName) !== Verification.compact(snapshot.companyProfile.legalName) ||
      !vendor.registryId || Verification.compact(vendor.registryId) !== Verification.compact(snapshot.companyProfile.registryId) ||
      !Verification.has(vendor.registryId, evidence) || !edges.some((edge) => edge.ownedEntityKey === vendor.entityKey)) {
      return { ...base, code: 'OWNERSHIP_INCOMPLETE', message: 'Provide the complete ownership declaration.', result: 'REVIEW' }
    }
    const seen = new Set<string>()
    const visiting = new Set<string>()
    const acyclic = Verification.walk(vendor.entityKey, edges, seen, visiting)
    if (!acyclic || seen.size !== entities.length) {
      return { ...base, code: 'OWNERSHIP_INCOMPLETE', message: 'Correct the ownership chain and totals.', result: 'REVIEW' }
    }
    const screening = await Verification.matches(entities)
    const blocked = new Set(screening.matches.filter((match) => match.match === 'BLOCKED').map((match) => match.key))
    let changed = true
    while (changed) {
      changed = false
      for (const entity of entities) {
        if (blocked.has(entity.entityKey)) continue
        const total = edges.filter((edge) => edge.ownedEntityKey === entity.entityKey && blocked.has(edge.ownerEntityKey))
          .reduce((sum, edge) => sum.plus(edge.percentage), new Prisma.Decimal(0))
        if (total.gte(Verification.BLOCKED_THRESHOLD)) {
          blocked.add(entity.entityKey)
          changed = true
        }
      }
    }
    const trace = { ...screening, blocked: [...blocked] }
    if (blocked.has(vendor.entityKey)) {
      return { ...base, code: 'OWNERSHIP_BLOCKED_CHAIN', message: '', result: 'REVIEW', trace }
    }
    if (screening.matches.length) {
      return { ...base, code: 'OWNERSHIP_POSSIBLE_MATCH', message: '', result: 'REVIEW', trace }
    }
    return { ...base, code: 'OWNERSHIP_CLEAR', message: '', result: 'PASS', trace }
  }

  private static walk(key: string, edges: Current['snapshot']['ownershipEdge_submission'], seen: Set<string>, visiting: Set<string>): boolean {
    if (visiting.has(key)) return false
    if (seen.has(key)) return true
    visiting.add(key)
    const parents = edges.filter((edge) => edge.ownedEntityKey === key)
    if (parents.length && !parents.reduce((sum, edge) => sum.plus(edge.percentage), new Prisma.Decimal(0)).eq(100)) return false
    if (!parents.every((edge) => Verification.walk(edge.ownerEntityKey, edges, seen, visiting))) return false
    visiting.delete(key)
    seen.add(key)
    return true
  }

  /** Fails when the supplier or its bank is in a banned country; sends owners in banned countries to review. */
  static countryRestriction({ policy, row, snapshot }: Current): Finding {
    const banned = new Set(policy.bannedCountries ?? Values.BANNED_COUNTRIES)
    const base = { evidence: [] as Evidence[], rule: 'COUNTRY_RESTRICTION', source: 'MANUAL' } as const
    const own = [
      ['case', row.country], ['company', snapshot.companyProfile?.country], ['bank', snapshot.bankProfile?.country],
    ].filter((item): item is [string, string] => typeof item[1] === 'string' && banned.has(item[1]))
    const owners = snapshot.ownershipEntity_submission.filter((item) => !item.isVendor && banned.has(item.country))
    const trace = {
      banned: [...banned].sort(),
      owners: owners.map((item) => ({ country: item.country, name: item.legalName })),
      supplier: own.map(([where, country]) => ({ country, where })),
    }
    if (own.length) {
      return { ...base, code: 'COUNTRY_BANNED', message: `The supplier or its bank is in a banned country (${[...new Set(own.map(([, country]) => country))].join(', ')}).`, result: 'FAIL', trace }
    }
    if (owners.length) {
      return { ...base, code: 'OWNER_COUNTRY_BANNED', message: '', result: 'REVIEW', trace }
    }
    return { ...base, code: 'MATCHED', message: '', result: 'PASS', trace }
  }

  /** Searches the web for bans, sanctions or debarment naming the vendor or its larger owners. */
  static async adverse({ snapshot }: Current, serp: SerpScreening = serpScreening, demo = env.DEMO_SCREENING === 'true'): Promise<Finding> {
    const base = { evidence: [] as Evidence[], rule: 'ADVERSE_SCREENING', source: demo ? 'FIXTURE' : 'LIVE' } as const
    if (demo) return { ...base, code: 'MATCHED', message: '', result: 'PASS', trace: { dataset: Verification.DATASET } }
    const entities = snapshot.ownershipEntity_submission
    const edges = snapshot.ownershipEdge_submission
    const vendor = entities.find((item) => item.isVendor)
    const profile = snapshot.companyProfile
    const subjects = [
      ...(vendor ? [{ country: vendor.country, key: vendor.entityKey, name: vendor.legalName }]
        : profile ? [{ country: profile.country, key: 'vendor', name: profile.legalName }] : []),
      ...entities.filter((item) => !item.isVendor && edges.some((edge) => edge.ownerEntityKey === item.entityKey &&
        new Prisma.Decimal(edge.percentage).gte(Verification.ADVERSE_OWNER_PERCENT)))
        .map((item) => ({ country: item.country, key: item.entityKey, name: item.legalName })),
    ].slice(0, Verification.ADVERSE_SEARCH_LIMIT)
    if (!subjects.length || !serp.configured) {
      return { ...base, code: 'SCREENING_UNAVAILABLE', message: 'Web screening is not configured; search for bans manually.', result: 'REVIEW' }
    }
    const results = await Promise.allSettled(subjects.map((subject) => serp.search(subject)))
    const hits = results.flatMap((result, index) => result.status === 'fulfilled' && result.value.length
      ? [{ entity: subjects[index].name, results: result.value }] : [])
    const trace = { checked: subjects.map((item) => item.name), hits, provider: 'searchapi.io' }
    if (hits.length) {
      return { ...base, code: 'ADVERSE_MEDIA_MATCH', message: '', result: 'REVIEW', trace }
    }
    if (results.some((result) => result.status === 'rejected')) {
      return { ...base, code: 'SCREENING_UNAVAILABLE', message: 'Web screening could not be completed; search for bans manually.', result: 'REVIEW', trace }
    }
    return { ...base, code: 'MATCHED', message: '', result: 'PASS', trace }
  }

  static certificateStandards(current: Current) {
    const { row, snapshot } = current
    return [...new Set(snapshot.qualification_submission.filter((item) =>
      Verification.compact(item.site) === Verification.compact(row.requestedSite) &&
      Verification.compact(item.activity) === Verification.compact(row.category)).map(({ standard }) => standard))]
  }

  static async evaluate(current: Current, documents: Map<DocumentKind, Evidence[]>) {
    const { row, snapshot } = current
    const { bankProfile, companyProfile, taxProfile } = snapshot
    Commands.require(companyProfile && bankProfile && taxProfile, 'submission is missing required profiles')
    const registration = documents.get('REGISTRATION') ?? []
    const bank = documents.get('BANK') ?? []
    const certificate = documents.get('CERTIFICATE') ?? []
    const tax = documents.get('TAX') ?? []
    const account = Secrets.decrypt(bankProfile.accountCiphertext, row.tenantId)
    const taxId = taxProfile.taxIdCiphertext ? Secrets.decrypt(taxProfile.taxIdCiphertext, row.tenantId) : ''
    const vat = taxProfile.vatTrnCiphertext ? Secrets.decrypt(taxProfile.vatTrnCiphertext, row.tenantId) : ''
    const taxResult = Verification.tax(row.country, taxProfile, taxId, vat, tax)
    const standards = Verification.certificateStandards(current)
    const certificateFinding = Verification.local('CERTIFICATE_SCOPE', certificate.some((item) =>
      Verification.has(row.requestedSite, [item]) && Verification.has(row.category, [item]) &&
      standards.some((standard) => Verification.has(standard, [item]))),
      certificate, 'SCOPE_MISMATCH', 'Upload the certificate scope annex covering the requested site and calibration activity.')
    const findings: Finding[] = [
      Verification.local('BANK_BENEFICIARY', Verification.sameName(bankProfile.beneficiary, companyProfile.legalName)
        && Verification.has(bankProfile.beneficiary, bank) && Verification.has(account, bank), bank, 'BANK_MISMATCH', 'Provide bank evidence matching the company name and account.'),
      certificateFinding,
      Verification.local('ENTITY_CONSISTENCY', Verification.has(companyProfile.legalName, registration) && Verification.has(companyProfile.registryId, registration),
        registration, 'REGISTRATION_MISMATCH', 'Provide registration evidence matching the company name and registration identifier.'),
      Verification.local('TAX_PROFILE', taxResult.ok, tax, taxResult.code, taxResult.message),
      Verification.documentTypes(documents),
    ]
    const [adverse, ownership] = await Promise.all([
      Verification.adverse(current), Verification.ownership(current, documents.get('OWNERSHIP') ?? []),
    ])
    return [...findings, Verification.countryRestriction(current), adverse, ownership]
  }

  static local(rule: string, valid: boolean, evidence: Evidence[], code: string, message: string): Finding {
    return { code: valid ? 'MATCHED' : code, evidence, message: valid ? '' : message, result: valid ? 'PASS' : 'FAIL', rule, source: 'MANUAL' }
  }
}
