import {
  AuditEventRepository, BaseRepository, DocumentRepository, InvitationRepository, MembershipRepository, OnboardingCaseRepository,
  CaseAccessRepository, NotificationRepository, SubmissionRepository, SupplierRepository,
} from '@neo/prisma/repositories'
import { type Input, type Output, Values } from '@neo/schemas'

import { env } from '@neo/env'
import { Commands } from './Commands'
import { DocumentVerification } from './DocumentVerification'
import { DocumentProcessor } from './DocumentProcessor'
import { demoIdentity } from './DemoIdentity'
import { issueDetail } from './IssueDetail'
import { ObjectStore } from './Providers'
import { localGoogleStorageEnabled } from './LocalGoogleStorage'
import { ReviewEvidence } from './ReviewEvidence'
import { type Actor, Secrets, Security } from './Security'

type Current = Awaited<ReturnType<typeof Commands.current>>

export class Queries {
  static readonly HOUR_MS = 3_600_000
  static readonly READERS = Values.BUYER_ROLES

  private static async scope(actor: Actor, caseId: string) {
    if (actor.channel === Security.SUPPLIER) {
      const access = await Security.access(actor, caseId)
      return { ...actor, tenantId: access.tenantId }
    }
    await Security.buyer(actor, Queries.READERS)
    return actor
  }

  // Check runs are ordered newest attempt first, so the first screening run is the current one.
  static screeningStage(result: string | undefined, status: string, failed: boolean) {
    if (result === 'PASS') return 'Clear'
    if (result) return 'Hold'
    if (failed) return 'Provider unavailable'
    return status === 'SUBMITTED' ? 'Running' : 'Waiting'
  }

  private static stages({ policy, row, snapshot }: Current): Output<'run'> {
    const failed = snapshot.workItem_submission.some((item) => item.state === 'FAILED' &&
      (item.kind === 'VERIFY' || item.kind === 'EXTRACT' && snapshot.document_submission.some((document) =>
        item.dedupeKey === DocumentProcessor.extractionKey(document.id)) || item.kind === 'SCAN' &&
        snapshot.document_submission.some((document) => document.status !== 'CLEAN' && item.dedupeKey === document.id)))
    const extracting = snapshot.workItem_submission.some((item) => item.kind === 'EXTRACT' && ['READY', 'RUNNING'].includes(item.state))
    const followUp = snapshot.workItem_submission.filter((item) => item.kind === 'NOTIFY').at(-1)
    return { stages: [
      { name: 'Intake', state: row.status === 'INVITED' ? 'Waiting' : 'Started' },
      { name: 'Documents', state: snapshot.document_submission.some((doc) => doc.status === 'REJECTED') ? 'Action required' :
        policy.documents.every((kind) => snapshot.document_submission.some((doc) => doc.kind === kind && doc.status === 'CLEAN')) ? 'Clean' : 'Waiting' },
      { name: 'Extraction', state: failed ? 'Action required' : extracting ? 'Running' : snapshot.workItem_submission.some((item) => item.kind === 'EXTRACT' && item.state === 'SUCCEEDED') ? 'Recorded' : 'Waiting' },
      { name: 'Checks', state: failed ? 'Provider unavailable' : row.status === 'SUBMITTED' ? 'Running' : snapshot.checkRun_submission.length ? 'Recorded' : 'Waiting' },
      { name: 'Screening', state: Queries.screeningStage(snapshot.checkRun_submission.find((check) => check.ruleKey === 'OWNERSHIP_SCREENING')?.result, row.status, failed) },
      { name: 'Decision', state: row.status },
      { name: 'Follow-up', state: followUp?.state ?? 'Waiting' },
    ] }
  }

  static async analytics(actor: Actor, input: Input<'analytics'>): Promise<Output<'analytics'>> {
    const from = new Date(input.from)
    const to = new Date(input.to)
    Commands.require(from < to && to.getTime() - from.getTime() <= 90 * Commands.DAY_MS, 'select a date range of at most 90 days')
    const rows = await OnboardingCaseRepository.findMany({
      include: { submission_case: { include: { decision_submission: true, issue_submission: true } } },
      where: { tenantId: actor.tenantId },
    })
    const counts: Record<string, number> = Object.fromEntries(Values.CASE_STATES.map((status) => [status, 0]))
    const durations: number[] = []
    let cohort = 0
    let reviewerAction = 0
    let reworked = 0
    let supplierAction = 0
    for (const row of rows) {
      counts[row.status] += 1
      const current = row.submission_case.find((item) => item.number === row.currentNumber)
      if (row.createdAt >= from && row.createdAt < to && row.submission_case.some((item) => item.submittedAt)) {
        cohort += 1
        if ((row.currentNumber ?? 0) > 1) reworked += 1
      }
      const final = current?.decision_submission.find((item) => item.outcome === 'APPROVE' || item.outcome === 'REJECT')
      if (final && final.createdAt >= from && final.createdAt < to) durations.push((final.createdAt.getTime() - row.createdAt.getTime()) / Queries.HOUR_MS)
      if (row.status === 'PENDING') {
        if (current?.issue_submission.some((item) => !item.resolvedAt && item.supplierMessage)) supplierAction += 1
        else reviewerAction += 1
      }
    }
    durations.sort((left, right) => left - right)
    const middle = Math.floor(durations.length / 2)
    const medianHours = durations.length ? (durations[middle] + durations[Math.floor((durations.length - 1) / 2)]) / 2 : 0
    return { cohort, completed: durations.length, counts, medianHours, reviewerAction, reworked, reworkRate: cohort ? reworked / cohort : 0, supplierAction }
  }

  static async audit(actor: Actor, input: Input<'audit'>): Promise<Output<'audit'>> {
    await Commands.caseRow(actor, input.caseId)
    const rows = await AuditEventRepository.findMany({
      cursor: input.cursor ? { id: input.cursor } : undefined,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: input.cursor ? 1 : 0, take: input.limit + 1,
      where: { entityId: input.caseId, tenantId: actor.tenantId },
    })
    const items = rows.slice(0, input.limit).map((row) => ({
      action: row.action, actorId: row.actorId ?? '', at: row.createdAt.toISOString(), id: row.id, requestId: row.requestId,
    }))
    return { items, ...(rows.length > input.limit ? { nextCursor: items.at(-1)?.id } : {}) }
  }

  static async detail(actor: Actor, caseId: string): Promise<Output<'detail'>> {
    const scoped = await Queries.scope(actor, caseId)
    const current = await Commands.current(scoped, caseId)
    const { row, snapshot } = current
    const buyer = Security.isBuyer(actor)
    const membership = buyer ? await Security.buyer(scoped, Queries.READERS) : undefined
    const privileged = membership?.role === 'ADMIN' || membership?.role === 'REVIEWER' || membership?.role === 'COMPLIANCE'
    const submittedBySupplier = actor.channel === Security.SUPPLIER && snapshot.submittedAt && snapshot.submittedById === actor.id
    const canReadFinancialFields = privileged || submittedBySupplier
    const { bankProfile, companyProfile, taxProfile } = snapshot
    const invite = buyer ? await InvitationRepository.findFirst({
      orderBy: { createdAt: 'desc' }, where: { caseId, tenantId: scoped.tenantId },
    }) : undefined
    const delivery = invite ? await NotificationRepository.findFirst({
      where: { tenantId: scoped.tenantId, workItem: { dedupeKey: invite.id } },
    }) : undefined
    const accesses = buyer ? await CaseAccessRepository.findMany({
      include: { user: { select: { name: true, email: true } } },
      where: { caseId, revokedAt: null, tenantId: scoped.tenantId },
    }) : []
    const previous = snapshot.number > 1 ? await SubmissionRepository.findFirst({
      where: { caseId, tenantId: scoped.tenantId, number: snapshot.number - 1, submittedAt: { not: null } },
      select: { issue_submission: {
        where: { ownerRole: { not: 'COMPLIANCE' }, supplierMessage: { not: null } },
        select: { supplierMessage: true },
      } },
    }) : undefined
    const previousCorrections = [...new Set(previous?.issue_submission.flatMap(({ supplierMessage }) =>
      supplierMessage ? [supplierMessage] : []) ?? [])]
    const approvedSupplier = row.status === 'APPROVED' ? await SupplierRepository.findFirst({
      select: { id: true }, where: { approvedSubmissionId: snapshot.id, tenantId: scoped.tenantId },
    }) : null
    const scopeReview = privileged ? await ReviewEvidence.scopeSuggestion(current) : undefined
    const agentReport = privileged && row.status !== 'SUBMITTED' ? await Queries.agentReport(current) : undefined
    return {
      ...(approvedSupplier ? { approvedSupplierId: approvedSupplier.id } : {}),
      ...(scopeReview ? { certificateScopeReview: scopeReview } : {}),
      ...(previousCorrections.length ? { previousCorrectionInstructions: previousCorrections } : {}),
      ...(agentReport ? { verificationReport: agentReport } : {}),
      case: { ...Queries.summary(row, companyProfile?.legalName),
        supplierEmail: companyProfile?.contactEmail || (invite ? Secrets.decrypt(invite.recipientCiphertext, scoped.tenantId) : row.createdBy.email),
        requesterName: row.createdBy?.name, requesterEmail: row.createdBy?.email,
        issueCount: snapshot.issue_submission.filter((issue) => !issue.resolvedAt).length,
        ...(snapshot.submittedAt ? { submittedAt: snapshot.submittedAt.toISOString() } : {}),
        ...(delivery ? { invitationDelivery: delivery.deliveryState } : {}) },
      checks: buyer ? snapshot.checkRun_submission.map((check) => ({
        code: privileged || check.ruleKey !== 'OWNERSHIP_SCREENING' ? check.reasonCode : 'COMPLIANCE_REVIEW',
        evidence: privileged ? check.checkEvidence_checkRun.flatMap((item) => item.documentId && item.page
          ? [{ documentId: item.documentId, field: item.fieldPath, page: item.page }] : []) : [],
        result: check.result, rule: check.ruleKey, source: check.sourceMode,
      })) : [],
      decisions: snapshot.decision_submission.filter((item) => buyer || ['APPROVE', 'REJECT'].includes(item.outcome))
        .map((item) => ({ at: item.createdAt.toISOString(), outcome: item.outcome,
          ...(buyer ? { rationale: item.rationale, reviewerName: item.reviewer?.name } : {}) })),
      documents: snapshot.document_submission.map((doc) => ({ id: doc.id, kind: doc.kind, status: doc.status })),
      draftRevision: snapshot.draftRevision,
      issues: snapshot.issue_submission.filter((issue) => !issue.resolvedAt && (buyer || issue.supplierMessage))
        .map((issue) => ({
          ...(buyer && issue.checkRule && (issue.ownerRole !== 'COMPLIANCE' || privileged) ? { checkRule: issue.checkRule } : {}),
          ...(privileged ? (() => {
            const check = snapshot.checkRun_submission.find((item) => item.ruleKey === issue.checkRule && item.reasonCode === issue.code)
            const detail = check ? issueDetail(issue.code, check.evidenceJson, snapshot.ownershipEntity_submission) : undefined
            return detail ? { detail } : {}
          })() : {}),
          code: issue.ownerRole === 'COMPLIANCE' && !privileged ? 'COMPLIANCE_REVIEW' : issue.code,
          id: issue.id, message: issue.supplierMessage ?? '', owner: issue.ownerRole,
        })),
      required: current.policy.documents,
      run: Queries.stages(current),
      submissionId: snapshot.id,
      values: {
        request: { serviceSite: row.requestedSite, activity: row.category, country: row.country,
          requesterName: row.createdBy?.name ?? '', requesterEmail: row.createdBy?.email ?? '',
          createdAt: row.createdAt.toISOString(), submittedAt: snapshot.submittedAt?.toISOString() ?? '',
          attestedAt: snapshot.attestedAt?.toISOString() ?? '', status: row.status },
        ...(bankProfile ? { bank: { accountLast4: bankProfile.accountLast4, beneficiary: bankProfile.beneficiary, country: bankProfile.country, currency: bankProfile.currency,
          ...(canReadFinancialFields ? { account: Secrets.decrypt(bankProfile.accountCiphertext, scoped.tenantId), routing: bankProfile.routingCiphertext ? Secrets.decrypt(bankProfile.routingCiphertext, scoped.tenantId) : '' } : {}) } } : {}),
        ...(companyProfile ? { company: {
          addressLine1: companyProfile.addressLine1, city: companyProfile.city, contactEmail: companyProfile.contactEmail,
          contactName: companyProfile.contactName, country: companyProfile.country, jurisdiction: companyProfile.jurisdiction,
          legalName: companyProfile.legalName, registryId: companyProfile.registryId,
          addressLine2: companyProfile.addressLine2 ?? '', postalCode: companyProfile.postalCode ?? '',
        } } : {}),
        ...(taxProfile ? { tax: { formType: taxProfile.formType, vatRegistered: taxProfile.vatRegistered,
          ...(canReadFinancialFields ? { taxId: taxProfile.taxIdCiphertext ? Secrets.decrypt(taxProfile.taxIdCiphertext, scoped.tenantId) : '', vatTrn: taxProfile.vatTrnCiphertext ? Secrets.decrypt(taxProfile.vatTrnCiphertext, scoped.tenantId) : '' } : {}) } } : {}),
        ...(invite ? { invitation: { id: invite.id, email: Secrets.decrypt(invite.recipientCiphertext, scoped.tenantId) } } : {}),
        ...(buyer ? { access: accesses.map((item) => ({ userId: item.userId, name: item.user.name, email: item.user.email })),
          work: snapshot.workItem_submission.filter((item) => item.state === 'FAILED').map((item) => ({ id: item.id, kind: item.kind })) } : {}),
        ...(!buyer || privileged ? { ownership: {
          edges: snapshot.ownershipEdge_submission.map((item) => ({
            ...(item.evidenceDocumentId ? { evidenceDocumentId: item.evidenceDocumentId } : {}),
            ownedKey: item.ownedEntityKey, ownerKey: item.ownerEntityKey, percentage: item.percentage.toString(),
          })),
          entities: snapshot.ownershipEntity_submission.map((item) => ({
            country: item.country, isVendor: item.isVendor, key: item.entityKey, legalName: item.legalName,
            ...(item.registryId ? { registryId: item.registryId } : {}),
          })),
        } } : {}),
        qualifications: snapshot.qualification_submission.map(({ activity, site, standard }) => ({ activity, site, standard })),
      },
    }
  }

  private static async agentReport(current: Current) {
    const trace = current.snapshot.checkRun_submission.find((check) => {
      const value = check.evidenceJson
      return value && typeof value === 'object' && !Array.isArray(value) && typeof value.reportRef === 'string'
    })?.evidenceJson
    if (!trace || typeof trace !== 'object' || Array.isArray(trace) || typeof trace.reportRef !== 'string') return undefined
    try {
      const [bytes] = await ObjectStore.STORAGE.bucket(env.GCS_CLEAN_BUCKET).file(trace.reportRef).download()
      return DocumentVerification.REPORT.parse(JSON.parse(Secrets.decrypt(bytes, current.row.tenantId)))
    } catch {
      // An unavailable report must not prevent reviewers from seeing processing errors.
      return undefined
    }
  }

  static async download(actor: Actor, input: Input<'download'>) {
    const scoped = await Queries.scope(actor, input.caseId)
    const document = await DocumentRepository.findFirst({
      where: { id: input.documentId, status: 'CLEAN', submission: { caseId: input.caseId }, tenantId: scoped.tenantId },
    })
    Commands.require(document?.cleanKey && document.cleanGeneration, 'clean document is unavailable')
    if (Security.isBuyer(actor)) {
      await Security.buyer(actor, document.kind === 'OWNERSHIP' ? ['ADMIN', 'COMPLIANCE', 'REVIEWER'] : ['ADMIN', 'REVIEWER'])
    }
    await BaseRepository.runInTransaction(async (tx) => Commands.audit(scoped, 'DOWNLOAD_URL_ISSUED', input.caseId, tx, { documentId: document.id }))
    return { url: localGoogleStorageEnabled()
      ? new URL(`/api/documents/download?documentId=${encodeURIComponent(document.id)}`, env.APP_URL).toString()
      : await ObjectStore.download(document.cleanKey, document.cleanGeneration) }
  }

  static async identity(actor: Actor): Promise<Output<'identity'>> {
    const memberships = Security.isBuyer(actor) ? await MembershipRepository.findMany({
      select: { id: true, role: true, tenantId: true },
      where: { active: true, userId: actor.id, ...(actor.channel === Security.DEMO ? { tenantId: demoIdentity.tenantId } : {}) },
    }) : []
    return { channel: actor.channel, email: actor.email, memberships, tenantId: actor.tenantId }
  }

  static async list(actor: Actor, input: Input<'list'>): Promise<Output<'list'>> {
    const rows = await OnboardingCaseRepository.findMany({
      cursor: input.cursor ? { id: input.cursor } : undefined,
      include: { createdBy: { select: { name: true, email: true } },
        invitation_case: { orderBy: { createdAt: 'desc' }, take: 1 },
        submission_case: { include: { companyProfile: true, issue_submission: { where: { resolvedAt: null } },
          workItem_submission: { where: { notification_workItem: { some: { template: 'Supplier onboarding invitation' } } }, orderBy: { createdAt: 'desc' }, take: 1, include: { notification_workItem: true } } }, orderBy: { number: 'desc' }, take: 1 } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: input.cursor ? 1 : 0, take: input.limit + 1,
      where: {
        country: input.country, status: input.status, tenantId: actor.tenantId,
        ...(input.search ? { submission_case: { some: { companyProfile: { legalName: { contains: input.search, mode: 'insensitive' } } } } } : {}),
      },
    })
    const items = rows.slice(0, input.limit).map((row) => ({
      ...Queries.summary(row, row.submission_case[0]?.companyProfile?.legalName),
      supplierEmail: row.submission_case[0]?.companyProfile?.contactEmail || (row.invitation_case[0] ? Secrets.decrypt(row.invitation_case[0].recipientCiphertext, actor.tenantId) : row.createdBy.email),
      requesterName: row.createdBy.name, requesterEmail: row.createdBy.email,
      issueCount: row.submission_case[0]?.issue_submission.length ?? 0,
      issueSummary: row.submission_case[0]?.issue_submission.map((issue) => issue.supplierMessage || 'Compliance review required.') ?? [],
      ...(row.submission_case[0]?.submittedAt ? { submittedAt: row.submission_case[0].submittedAt.toISOString() } : {}),
      invitationDelivery: row.submission_case[0]?.workItem_submission[0]?.notification_workItem[0]?.deliveryState,
    }))
    return { items, ...(rows.length > input.limit ? { nextCursor: items.at(-1)?.caseId } : {}) }
  }

  static async run(actor: Actor, caseId: string) {
    return Queries.stages(await Commands.current(await Queries.scope(actor, caseId), caseId))
  }

  static summary(row: Pick<Current['row'], 'id' | 'createdAt' | 'currentNumber' | 'requestedSite' | 'revision' | 'status' | 'updatedAt'>, name = '') {
    return {
      caseId: row.id, createdAt: row.createdAt.toISOString(), name, number: row.currentNumber ?? 1,
      requestedSite: row.requestedSite, revision: row.revision, status: row.status, updatedAt: row.updatedAt.toISOString(),
    }
  }

  static async supplierCases(actor: Actor): Promise<Output<'list'>> {
    Commands.require(actor.channel === Security.SUPPLIER, 'supplier sign-in is required')
    const rows = await CaseAccessRepository.findMany({
      include: { case: true }, take: Values.MAX_PAGE, where: { revokedAt: null, userId: actor.id },
    })
    return { items: rows.map((row) => Queries.summary(row.case)) }
  }
}
