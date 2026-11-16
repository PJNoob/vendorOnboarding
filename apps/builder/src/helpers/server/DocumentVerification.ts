import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import { env } from '@neo/env'
import { verificationReport } from '@neo/schemas'
import type { DocumentKind } from '@neo/prisma'

import { Commands } from './Commands'
import { ObjectStore } from './Providers'
import { Secrets } from './Security'
import type { Evidence, Finding } from './Verification'

type Current = Awaited<ReturnType<typeof Commands.current>>

export class DocumentVerification {
  static readonly REPORT = verificationReport
  static readonly RULES = ['BANK_BENEFICIARY', 'CERTIFICATE_SCOPE', 'ENTITY_CONSISTENCY', 'TAX_PROFILE'] as const
  static readonly TIMEOUT = 120_000

  private static async request(path: string, body: string | Buffer, contentType: string,
    signal = AbortSignal.timeout(DocumentVerification.TIMEOUT)) {
    if (!env.DOCUMENT_SERVICE_TOKEN) throw new Error('DOCUMENT_SERVICE_TOKEN is not configured')
    const response = await fetch(new URL(path, env.DOCUMENT_SERVICE_URL), {
      method: 'POST', headers: { Authorization: `Bearer ${env.DOCUMENT_SERVICE_TOKEN}`, 'Content-Type': contentType },
      body: typeof body === 'string' ? body : new Uint8Array(body), redirect: 'error', signal,
    })
    if (!response.ok) throw new Error(`document service unavailable (${response.status})`)
    return response.json()
  }

  static async generateCertificateEvidence(instruction: string, data: unknown, signal: AbortSignal) {
    const response = await this.request('/v1/certificate-scope/generate',
      JSON.stringify({ instruction, data: JSON.stringify(data) }), 'application/json', signal)
    return z.strictObject({ model: z.string().min(1).max(128), text: z.string().min(1).max(10_000) }).parse(response)
  }

  static async extract(documentId: string, bytes: Buffer): Promise<Evidence[]> {
    const result = z.strictObject({ pages: z.array(z.strictObject({
      documentId: z.literal(documentId), page: z.int().min(1).max(50), text: z.string().max(10_000),
    })).max(50) }).parse(await this.request(`/v1/extract/${encodeURIComponent(documentId)}`, bytes, 'application/pdf'))
    return result.pages
  }

  static async evaluate(current: Current, pages: Map<DocumentKind, Evidence[]>): Promise<Finding[]> {
    const { row, snapshot, policy } = current
    const expected: { field: string; value: string; rule: string; kind: DocumentKind }[] = []
    const add = (field: string, value: string | null | undefined, rule: string, kind: DocumentKind) => {
      if (value) expected.push({ field, value, rule, kind })
    }
    add('legal_name', snapshot.companyProfile?.legalName, 'ENTITY_CONSISTENCY', 'REGISTRATION')
    add('registry_id', snapshot.companyProfile?.registryId, 'ENTITY_CONSISTENCY', 'REGISTRATION')
    add('legal_name', snapshot.bankProfile?.beneficiary, 'BANK_BENEFICIARY', 'BANK')
    if (snapshot.bankProfile) add('account', Secrets.decrypt(snapshot.bankProfile.accountCiphertext, row.tenantId), 'BANK_BENEFICIARY', 'BANK')
    if (snapshot.taxProfile?.taxIdCiphertext) add('tax_id', Secrets.decrypt(snapshot.taxProfile.taxIdCiphertext, row.tenantId), 'TAX_PROFILE', 'TAX')
    if (snapshot.taxProfile?.vatTrnCiphertext) add('vat_id', Secrets.decrypt(snapshot.taxProfile.vatTrnCiphertext, row.tenantId), 'TAX_PROFILE', 'TAX')
    add('site', row.requestedSite, 'CERTIFICATE_SCOPE', 'CERTIFICATE')
    add('activity', row.category, 'CERTIFICATE_SCOPE', 'CERTIFICATE')
    const rules = DocumentVerification.RULES.filter((rule) => policy.rules.includes(rule))
    const report = this.REPORT.parse(await this.request('/v1/verify', JSON.stringify({
      submissionId: snapshot.id, requiredKinds: policy.documents, rules, expected,
      documents: snapshot.document_submission.filter((doc) => doc.status === 'CLEAN').map((doc) => ({
        documentId: doc.id, kind: doc.kind, pages: (pages.get(doc.kind) ?? []).filter((page) => page.documentId === doc.id),
      })),
    }), 'application/json'))
    if (report.submissionId !== snapshot.id || report.findings.length !== rules.length ||
      new Set(report.findings.map((item) => item.rule)).size !== rules.length ||
      report.findings.some((item) => !rules.includes(item.rule))) throw new Error('document service returned an invalid report')
    const allPages = [...pages.values()].flat()
    if (report.findings.some((finding) => finding.evidence.some((evidence) => !allPages.some((page) =>
      page.documentId === evidence.documentId && page.page === evidence.page && page.text.includes(evidence.quote))))) {
      throw new Error('document service returned unsupported evidence')
    }
    // Detailed field values and excerpts remain encrypted, like the extracted pages.
    const reportRef = `verification/${row.tenantId}/${snapshot.id}/${randomUUID()}`
    await ObjectStore.STORAGE.bucket(env.GCS_CLEAN_BUCKET).file(reportRef).save(
      Secrets.encrypt(JSON.stringify(report), row.tenantId), { preconditionOpts: { ifGenerationMatch: 0 }, resumable: false },
    )
    return report.findings.map((finding) => ({
      rule: finding.rule, result: finding.result, code: finding.code,
      message: finding.result === 'PASS' ? '' : finding.message, source: 'LIVE',
      trace: { reportRef, agentVersion: report.version },
      evidence: finding.evidence.map((item) => ({ documentId: item.documentId, page: item.page, text: item.quote })),
    }))
  }
}
