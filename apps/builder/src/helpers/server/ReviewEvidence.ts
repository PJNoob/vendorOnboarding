import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import { env } from '@neo/env'
import { certificateScopeSuggestion } from '@neo/schemas'

import { reviewCertificateScope } from './CertificateScopeReview'
import { Commands } from './Commands'
import { DocumentVerification } from './DocumentVerification'
import { ObjectStore } from './Providers'
import { Secrets, Security, type Actor } from './Security'
import { Verification, type Evidence } from './Verification'

const screeningTrace = z.object({
  blocked: z.array(z.string()),
  dataset: z.string(),
  fetchedAt: z.iso.datetime().optional(),
  matches: z.array(z.object({
    key: z.string(),
    match: z.enum(['BLOCKED', 'POSSIBLE']),
    recordIds: z.array(z.string()).optional(),
  })).optional(),
  publishedOn: z.iso.date().optional(),
  sourceUrl: z.url().optional(),
})

const certificateTrace = z.object({ certificateScopeReview: certificateScopeSuggestion })
const certificateReference = z.object({
  certificateScopeReviewRef: z.string(),
  certificateScopeReviewModel: z.string().min(1).max(128),
})
type Current = Awaited<ReturnType<typeof Commands.current>>

export class ReviewEvidence {
  static readonly ROLES = ['ADMIN', 'REVIEWER', 'COMPLIANCE'] as const

  private static scopePrefix(current: Current) {
    return `certificate-scope/${current.row.tenantId}/${current.snapshot.id}/`
  }

  static async generateScopeSuggestion(current: Current, pages: Evidence[], availableMs?: number) {
    const { CERTIFICATE_RLM_PROVIDER, CERTIFICATE_RLM_MODEL, CERTIFICATE_RLM_URL } = env
    const model = CERTIFICATE_RLM_PROVIDER === 'gemini'
      ? { name: 'Gemini', generate: DocumentVerification.generateCertificateEvidence.bind(DocumentVerification) }
      : CERTIFICATE_RLM_PROVIDER === 'ollama' && CERTIFICATE_RLM_URL
        ? { name: CERTIFICATE_RLM_MODEL, url: CERTIFICATE_RLM_URL }
        : undefined
    if (!model) return undefined

    const suggestion = await reviewCertificateScope(pages, {
      activity: current.row.category, site: current.row.requestedSite,
      standards: Verification.certificateStandards(current),
    }, model, availableMs)
    if (!suggestion.citations.length) return { certificateScopeReview: suggestion }
    const ref = ReviewEvidence.scopePrefix(current) + randomUUID()
    try {
      await ObjectStore.STORAGE.bucket(env.GCS_CLEAN_BUCKET).file(ref).save(
        Secrets.encrypt(JSON.stringify(suggestion), current.row.tenantId),
        { preconditionOpts: { ifGenerationMatch: 0 }, resumable: false },
      )
      return { certificateScopeReviewRef: ref, certificateScopeReviewModel: suggestion.model }
    } catch {
      return { certificateScopeReview: { citations: [], model: suggestion.model, status: 'unavailable' as const } }
    }
  }

  static async scopeSuggestion(current: Current) {
    const { row, snapshot } = current
    if (row.status === 'SUBMITTED') return undefined
    const check = snapshot.checkRun_submission.find((item) => item.ruleKey === 'CERTIFICATE_SCOPE')
    const reference = certificateReference.safeParse(check?.evidenceJson)
    const inline = certificateTrace.safeParse(check?.evidenceJson)
    let suggestion = inline.success ? inline.data.certificateScopeReview : undefined
    if (reference.success && reference.data.certificateScopeReviewRef.startsWith(ReviewEvidence.scopePrefix(current))) {
      try {
        const [bytes] = await ObjectStore.STORAGE.bucket(env.GCS_CLEAN_BUCKET).file(reference.data.certificateScopeReviewRef).download()
        suggestion = certificateScopeSuggestion.parse(JSON.parse(Secrets.decrypt(bytes, row.tenantId)))
      } catch {
        suggestion = { citations: [], model: reference.data.certificateScopeReviewModel, status: 'unavailable' }
      }
    }
    if (!suggestion) return undefined
    const documents = new Set(snapshot.document_submission
      .filter((document) => document.kind === 'CERTIFICATE' && document.status === 'CLEAN')
      .map((document) => document.id))
    const citations = suggestion.citations.filter((citation) => documents.has(citation.documentId))
    return {
      ...suggestion, citations,
      status: suggestion.status === 'suggested' && !citations.length ? 'no_evidence' as const : suggestion.status,
    }
  }

  static async certificate(actor: Actor, caseId: string) {
    await Security.buyer(actor, ReviewEvidence.ROLES)
    const current = await Commands.current(actor, caseId)
    return { caseId, submissionId: current.snapshot.id, suggestion: await ReviewEvidence.scopeSuggestion(current) ?? null }
  }

  static async screening(actor: Actor, caseId: string) {
    await Security.buyer(actor, ReviewEvidence.ROLES)
    const { snapshot } = await Commands.current(actor, caseId)
    const checks = snapshot.checkRun_submission.filter((row) => row.ruleKey === 'OWNERSHIP_SCREENING')
    const latest = checks[0]
    const source = latest?.sourceRef ? checks.find((row) => row.id === latest.sourceRef) : latest
    const trace = screeningTrace.safeParse(source?.evidenceJson)
    const verification = snapshot.workItem_submission.find((item) => item.kind === 'VERIFY')
    const status = verification?.state === 'FAILED' ? 'unavailable' :
      verification && ['RUNNING', 'READY'].includes(verification.state) ? 'pending' :
      !trace.success ? 'not_recorded' :
      !source?.validUntil || source.validUntil <= new Date() ? 'expired' : 'recorded'
    return {
      caseId, submissionId: snapshot.id, status,
      check: latest ? {
        id: latest.id, reason: latest.reasonCode, result: latest.result, source: latest.sourceMode,
      } : null,
      screeningEvidence: trace.success && source ? {
        ...trace.data, checkId: source.id, checkedAt: source.checkedAt.toISOString(),
        source: source.sourceMode, validUntil: source.validUntil?.toISOString() ?? null,
      } : null,
    }
  }
}
