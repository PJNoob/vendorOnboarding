import { z } from 'zod'

import { env } from '@neo/env'
import { Prisma, type CheckResult, type DocumentKind, type SourceMode } from '@neo/prisma'

import { reviewCertificateScope } from './CertificateScopeReview'
import { Commands } from './Commands'
import { screenOfac } from './OfacScreening'
import { Secrets } from './Security'

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
  static readonly DATASET = 'training-fixture-v1'
  static readonly TIMEOUT_MS = 15_000

  private static compact(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '')
  }

  private static has(value: string, evidence: Evidence[]) {
    const key = Verification.compact(value)
    return Boolean(key) && evidence.some((item) => Verification.compact(item.text).includes(key))
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
    const taxOk = row.country === 'US'
      ? taxProfile.formType === 'W9' && /^\d{9}$/.test(taxId.replace(/-/g, '')) && Verification.has(taxId, tax)
      : taxProfile.formType === 'OTHER_REVIEW' && !taxProfile.vatRegistered ||
        taxProfile.vatRegistered && /^\d{15}$/.test(vat) && Verification.has(vat, tax)
    const qualifications = snapshot.qualification_submission.filter((item) =>
      Verification.compact(item.site) === Verification.compact(row.requestedSite) &&
      Verification.compact(item.activity) === Verification.compact(row.category))
    const certificateFinding = Verification.local('CERTIFICATE_SCOPE', certificate.some((item) =>
      Verification.has(row.requestedSite, [item]) && Verification.has(row.category, [item]) &&
      qualifications.some(({ standard }) => Verification.has(standard, [item]))),
      certificate, 'SCOPE_MISMATCH', 'Upload the certificate scope annex covering the requested site and calibration activity.')
    const findings: Finding[] = [
      Verification.local('BANK_BENEFICIARY', Verification.compact(bankProfile.beneficiary) === Verification.compact(companyProfile.legalName)
        && Verification.has(bankProfile.beneficiary, bank) && Verification.has(account, bank), bank, 'BANK_MISMATCH', 'Provide bank evidence matching the company name and account.'),
      certificateFinding,
      Verification.local('ENTITY_CONSISTENCY', Verification.has(companyProfile.legalName, registration) && Verification.has(companyProfile.registryId, registration),
        registration, 'REGISTRATION_MISMATCH', 'Provide registration evidence matching the company name and registration identifier.'),
      Verification.local('TAX_PROFILE', taxOk, tax, 'TAX_MISMATCH', 'Correct the tax details and provide matching tax evidence.'),
    ]
    const ownership = await Verification.ownership(current, documents.get('OWNERSHIP') ?? [])
    const modelUrl = env.CERTIFICATE_RLM_URL
    if (modelUrl && certificateFinding.result === 'FAIL' && current.policy.rules.includes(certificateFinding.rule)) {
      certificateFinding.trace = { certificateScopeReview: await reviewCertificateScope(certificate, {
        activity: row.category, site: row.requestedSite, standards: qualifications.map(({ standard }) => standard),
      }, { name: env.CERTIFICATE_RLM_MODEL, url: modelUrl }) }
    }
    return [...findings, ownership]
  }

  static local(rule: string, valid: boolean, evidence: Evidence[], code: string, message: string): Finding {
    return { code: valid ? 'MATCHED' : code, evidence, message: valid ? '' : message, result: valid ? 'PASS' : 'FAIL', rule, source: 'MANUAL' }
  }
}
