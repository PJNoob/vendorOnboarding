import { z } from 'zod'

import { certificateScopeSuggestion } from '@neo/schemas'

import { Commands } from './Commands'
import { Security, type Actor } from './Security'

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
type Snapshot = Awaited<ReturnType<typeof Commands.current>>['snapshot']

export class ReviewEvidence {
  static readonly ROLES = ['REVIEWER', 'COMPLIANCE'] as const

  static scopeSuggestion(snapshot: Snapshot) {
    const check = snapshot.checkRun_submission.find((row) => row.ruleKey === 'CERTIFICATE_SCOPE')
    const parsed = certificateTrace.safeParse(check?.evidenceJson)
    if (!parsed.success) return undefined
    const suggestion = parsed.data.certificateScopeReview
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
    const { snapshot } = await Commands.current(actor, caseId)
    return { caseId, submissionId: snapshot.id, suggestion: ReviewEvidence.scopeSuggestion(snapshot) ?? null }
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
