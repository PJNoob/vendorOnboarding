import {
  AuditEventRepository, BaseRepository, DocumentRepository, InvitationRepository, MembershipRepository, OnboardingCaseRepository,
  CaseAccessRepository,
} from '@neo/prisma/repositories'
import { type Input, type Output, Values } from '@neo/schemas'

import { Commands } from './Commands'
import { demoIdentity } from './DemoIdentity'
import { ObjectStore } from './Providers'
import { type Actor, Security } from './Security'

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

  private static stages({ policy, row, snapshot }: Current): Output<'run'> {
    const failed = snapshot.workItem_submission.some((item) => item.kind === 'VERIFY' && item.state === 'FAILED')
    const followUp = snapshot.workItem_submission.filter((item) => item.kind === 'NOTIFY').at(-1)
    return { stages: [
      { name: 'Intake', state: row.status === 'INVITED' ? 'Waiting' : 'Started' },
      { name: 'Documents', state: snapshot.document_submission.some((doc) => doc.status === 'REJECTED') ? 'Action required' :
        policy.documents.every((kind) => snapshot.document_submission.some((doc) => doc.kind === kind && doc.status === 'CLEAN')) ? 'Clean' : 'Waiting' },
      { name: 'Checks', state: failed ? 'Provider unavailable' : row.status === 'SUBMITTED' ? 'Running' : snapshot.checkRun_submission.length ? 'Recorded' : 'Waiting' },
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
    return { completed: durations.length, counts, medianHours, reviewerAction, reworkRate: cohort ? reworked / cohort : 0, supplierAction }
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
    const privileged = membership?.role === 'REVIEWER' || membership?.role === 'COMPLIANCE'
    const { bankProfile, companyProfile, taxProfile } = snapshot
    const invite = buyer ? await InvitationRepository.findFirst({
      orderBy: { createdAt: 'desc' }, where: { caseId, tenantId: scoped.tenantId },
    }) : undefined
    const accesses = buyer ? await CaseAccessRepository.findMany({
      where: { caseId, revokedAt: null, tenantId: scoped.tenantId },
    }) : []
    return {
      case: Queries.summary(row, companyProfile?.legalName),
      checks: buyer ? snapshot.checkRun_submission.map((check) => ({
        code: privileged || check.ruleKey !== 'OWNERSHIP_SCREENING' ? check.reasonCode : 'COMPLIANCE_REVIEW',
        evidence: privileged ? check.checkEvidence_checkRun.flatMap((item) => item.documentId && item.page
          ? [{ documentId: item.documentId, field: item.fieldPath, page: item.page }] : []) : [],
        result: check.result, rule: check.ruleKey, source: check.sourceMode,
      })) : [],
      decisions: snapshot.decision_submission.filter((item) => buyer || ['APPROVE', 'REJECT'].includes(item.outcome))
        .map((item) => ({ at: item.createdAt.toISOString(), outcome: item.outcome })),
      documents: snapshot.document_submission.map((doc) => ({ id: doc.id, kind: doc.kind, status: doc.status })),
      draftRevision: snapshot.draftRevision,
      issues: snapshot.issue_submission.filter((issue) => !issue.resolvedAt && (buyer || issue.supplierMessage))
        .map((issue) => ({
          code: issue.ownerRole === 'COMPLIANCE' && !privileged ? 'COMPLIANCE_REVIEW' : issue.code,
          id: issue.id, message: issue.supplierMessage ?? '', owner: issue.ownerRole,
        })),
      required: current.policy.documents,
      run: Queries.stages(current),
      submissionId: snapshot.id,
      values: {
        ...(bankProfile ? { bank: { accountLast4: bankProfile.accountLast4, beneficiary: bankProfile.beneficiary, country: bankProfile.country, currency: bankProfile.currency } } : {}),
        ...(companyProfile ? { company: {
          addressLine1: companyProfile.addressLine1, city: companyProfile.city, contactEmail: companyProfile.contactEmail,
          contactName: companyProfile.contactName, country: companyProfile.country, jurisdiction: companyProfile.jurisdiction,
          legalName: companyProfile.legalName, registryId: companyProfile.registryId,
        } } : {}),
        ...(taxProfile ? { tax: { formType: taxProfile.formType, vatRegistered: taxProfile.vatRegistered } } : {}),
        ...(invite ? { invitation: { id: invite.id } } : {}),
        ...(buyer ? { access: accesses.map((item) => ({ userId: item.userId })),
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

  static async download(actor: Actor, input: Input<'download'>) {
    const scoped = await Queries.scope(actor, input.caseId)
    const document = await DocumentRepository.findFirst({
      where: { id: input.documentId, status: 'CLEAN', submission: { caseId: input.caseId }, tenantId: scoped.tenantId },
    })
    Commands.require(document?.cleanKey && document.cleanGeneration, 'clean document is unavailable')
    if (Security.isBuyer(actor)) {
      await Security.buyer(actor, document.kind === 'OWNERSHIP' ? ['COMPLIANCE', 'REVIEWER'] : ['REVIEWER'])
    }
    await BaseRepository.runInTransaction(async (tx) => Commands.audit(scoped, 'DOWNLOAD_URL_ISSUED', input.caseId, tx, { documentId: document.id }))
    return { url: await ObjectStore.download(document.cleanKey, document.cleanGeneration) }
  }

  static async identity(actor: Actor): Promise<Output<'identity'>> {
    const memberships = Security.isBuyer(actor) ? await MembershipRepository.findMany({
      select: { id: true, role: true, tenantId: true },
      where: { active: true, userId: actor.id, ...(actor.channel === Security.DEMO ? { tenantId: demoIdentity.tenantId } : {}) },
    }) : []
    return { email: actor.email, memberships, tenantId: actor.tenantId }
  }

  static async list(actor: Actor, input: Input<'list'>): Promise<Output<'list'>> {
    const rows = await OnboardingCaseRepository.findMany({
      cursor: input.cursor ? { id: input.cursor } : undefined,
      include: { submission_case: { include: { companyProfile: true }, orderBy: { number: 'desc' }, take: 1 } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: input.cursor ? 1 : 0, take: input.limit + 1,
      where: {
        country: input.country, status: input.status, tenantId: actor.tenantId,
        ...(input.search ? { submission_case: { some: { companyProfile: { legalName: { contains: input.search, mode: 'insensitive' } } } } } : {}),
      },
    })
    const items = rows.slice(0, input.limit).map((row) => Queries.summary(row, row.submission_case[0]?.companyProfile?.legalName))
    return { items, ...(rows.length > input.limit ? { nextCursor: items.at(-1)?.caseId } : {}) }
  }

  static async run(actor: Actor, caseId: string) {
    return Queries.stages(await Commands.current(await Queries.scope(actor, caseId), caseId))
  }

  static summary(row: Omit<Current['row'], 'policy'>, name = '') {
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
