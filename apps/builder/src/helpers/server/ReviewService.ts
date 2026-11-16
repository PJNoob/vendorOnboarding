import {
  ExtractionRepository, CheckEvidenceRepository, CheckRunRepository, DecisionRepository, InvitationRepository,
  IssueRepository, OnboardingCaseRepository, OutboxEventRepository, SupplierRepository,
  WorkItemRepository, type TransactionClient,
} from '@neo/prisma/repositories'
import type { Input } from '@neo/schemas'

import { Commands } from './Commands'
import { DocumentProcessor } from './DocumentProcessor'
import { type Actor, Secrets, Security } from './Security'

type Snapshot = Awaited<ReturnType<typeof Commands.current>>['snapshot']

export class ReviewService {
  static readonly ADMIN = ['ADMIN'] as const
  static readonly COMPLIANCE = ['COMPLIANCE'] as const
  static readonly REQUESTERS = ['BUYER', 'REVIEWER'] as const
  static readonly REVIEWERS = ['REVIEWER'] as const
  static readonly RULES = ['BANK_BENEFICIARY', 'CERTIFICATE_SCOPE', 'ENTITY_CONSISTENCY', 'OWNERSHIP_SCREENING', 'TAX_PROFILE'] as const

  private static async current(actor: Actor, input: Input<'decide'> | Input<'request'> | Input<'resolve'> | Input<'resolveHold'>, tx: TransactionClient) {
    const current = await Commands.current(actor, input.caseId, tx)
    Commands.revision(current.row.revision, input.expectedCaseRevision)
    Commands.require(current.row.status === 'PENDING' && current.snapshot.submittedAt && current.snapshot.id === input.submissionId,
      'select the current pending submission')
    return current
  }

  private static async resolveInternal(actor: Actor, input: Input<'resolve'> | Input<'resolveHold'>, tx: TransactionClient) {
    const { row, snapshot } = await ReviewService.current(actor, input, tx)
    const issue = snapshot.issue_submission.find((item) => item.id === input.issueId && !item.resolvedAt)
    Commands.require(issue, 'open issue is unavailable')
    const hold = 'disposition' in input
    Commands.require(hold === (issue.ownerRole === 'COMPLIANCE'), 'use the appropriate review action')
    Commands.require(input.evidenceDocumentIds.every((id) => snapshot.document_submission.some((doc) => doc.id === id && doc.status === 'CLEAN')),
      'select clean documents from the current submission')
    if (hold && input.disposition === 'CLEARED') {
      const latest = snapshot.checkRun_submission.find((check) => check.ruleKey === 'OWNERSHIP_SCREENING')
      Commands.require(latest && latest.result === 'REVIEW' && latest.reasonCode === 'OWNERSHIP_POSSIBLE_MATCH' &&
        latest.validUntil && latest.validUntil > new Date(), 'only a current possible match can be cleared with evidence')
      const result = await CheckRunRepository.create({ data: {
        attempt: latest.attempt + 1, checkedAt: new Date(), reasonCode: 'COMPLIANCE_CLEARED',
        result: 'PASS', ruleKey: latest.ruleKey, ruleVersion: latest.ruleVersion, sourceMode: 'MANUAL',
        sourceRef: latest.id, submissionId: snapshot.id, tenantId: actor.tenantId, validUntil: latest.validUntil,
      } }, tx)
      await CheckEvidenceRepository.createMany({ data: input.evidenceDocumentIds.map((documentId) => ({
        checkRunId: result.id, documentId, fieldPath: 'ownership', tenantId: actor.tenantId,
      })) }, tx)
      await DecisionRepository.create({ data: {
        outcome: 'CLEAR_HOLD', rationale: input.rationale, reviewerId: actor.id,
        submissionId: snapshot.id, tenantId: actor.tenantId,
      } }, tx)
    }
    const confirmed = hold && input.disposition === 'CONFIRMED'
    await IssueRepository.updateMany({
      data: { resolution: confirmed ? 'CONFIRMED' : input.rationale, resolvedAt: confirmed ? null : new Date() },
      where: { id: issue.id, tenantId: actor.tenantId },
    }, tx)
    await ReviewService.touch(actor, row.id, tx)
    await Commands.audit(actor, confirmed ? 'HOLD_CONFIRMED' : 'ISSUE_RESOLVED', row.id, tx, { documentIds: input.evidenceDocumentIds, issueId: issue.id })
    return { id: issue.id, revision: row.revision + 1 }
  }

  private static touch(actor: Actor, caseId: string, tx: TransactionClient) {
    return OnboardingCaseRepository.updateMany({
      data: { revision: { increment: 1 } }, where: { id: caseId, tenantId: actor.tenantId },
    }, tx)
  }

  static assertApproval(rules: string[], snapshot: Snapshot) {
    const now = new Date()
    Commands.require(!snapshot.issue_submission.some((issue) => !issue.resolvedAt), 'resolve all open issues before approval')
    Commands.require(rules.every((rule) => {
      const check = snapshot.checkRun_submission.find((item) => item.ruleKey === rule)
      return check?.result === 'PASS' && (!check.validUntil || check.validUntil > now)
    }), 'all mandatory checks must pass and be current')
  }

  static decide(actor: Actor, input: Input<'decide'>) {
    Security.fresh(actor)
    return Commands.execute(actor, 'reviews.decide', input, Commands.role(actor, ReviewService.REVIEWERS), async (tx) => {
      const { policy, row, snapshot } = await ReviewService.current(actor, input, tx)
      Commands.require(row.createdById !== actor.id, 'an independent reviewer must decide this case')
      if (input.outcome === 'APPROVE') {
        ReviewService.assertApproval(policy.rules, snapshot)
        const profile = snapshot.companyProfile
        Commands.require(profile, 'company profile is unavailable')
        const registryKey = [profile.country, profile.jurisdiction, profile.registryId].map((value) => value.trim().toUpperCase()).join('/')
        const duplicate = await SupplierRepository.findFirst({ where: { registryKey, tenantId: actor.tenantId } }, tx)
        Commands.require(!duplicate, 'a supplier with this registration already exists')
        await SupplierRepository.create({ data: { approvedSubmissionId: snapshot.id, registryKey, tenantId: actor.tenantId } }, tx)
      } else {
        Commands.require(snapshot.issue_submission.filter((issue) => issue.ownerRole === 'COMPLIANCE' && !issue.resolvedAt)
          .every((issue) => issue.resolution === 'CONFIRMED'), 'compliance must confirm open holds before rejection')
      }
      const decision = await DecisionRepository.create({ data: {
        outcome: input.outcome, rationale: input.rationale, reviewerId: actor.id, submissionId: snapshot.id, tenantId: actor.tenantId,
      } }, tx)
      const status = input.outcome === 'APPROVE' ? 'APPROVED' : 'REJECTED'
      await OnboardingCaseRepository.updateMany({
        data: { revision: { increment: 1 }, status }, where: { id: row.id, tenantId: actor.tenantId },
      }, tx)
      await ReviewService.notify(actor, row.id, snapshot.id, decision.id,
        input.outcome === 'APPROVE' ? 'Your onboarding was approved.' : 'Your onboarding was declined. Contact procurement for next steps.', tx)
      await Commands.audit(actor, status, row.id, tx, { decisionId: decision.id, submissionId: snapshot.id })
      return { id: decision.id, revision: row.revision + 1 }
    })
  }

  static async notify(actor: Actor, caseId: string, submissionId: string, key: string, text: string, tx: TransactionClient) {
    const invite = await InvitationRepository.findFirst({
      orderBy: { createdAt: 'desc' }, where: { caseId, tenantId: actor.tenantId },
    }, tx)
    Commands.require(invite, 'supplier recipient is unavailable')
    await Commands.notify(actor, Secrets.decrypt(invite.recipientCiphertext, actor.tenantId),
      'Supplier onboarding update', key, `${text}\n\n${Commands.url('/')}`, tx, submissionId)
  }

  static request(actor: Actor, input: Input<'request'>) {
    return Commands.execute(actor, 'cases.requestChanges', input, Commands.role(actor, ReviewService.REQUESTERS), async (tx) => {
      const { row, snapshot } = await ReviewService.current(actor, input, tx)
      const issue = await IssueRepository.create({ data: {
        code: 'MANUAL_CORRECTION', ownerRole: 'BUYER', submissionId: snapshot.id, supplierMessage: input.message, tenantId: actor.tenantId,
      } }, tx)
      await DecisionRepository.create({ data: {
        outcome: 'REQUEST_CHANGES', rationale: input.message, reviewerId: actor.id, submissionId: snapshot.id, tenantId: actor.tenantId,
      } }, tx)
      await ReviewService.touch(actor, row.id, tx)
      await ReviewService.notify(actor, row.id, snapshot.id, issue.id, 'A correction is requested. Sign in to see the requested action.', tx)
      await Commands.audit(actor, 'CORRECTION_REQUESTED', row.id, tx, { issueId: issue.id })
      return { id: issue.id, revision: row.revision + 1 }
    })
  }

  static resolve(actor: Actor, input: Input<'resolve'>) {
    return Commands.execute(actor, 'reviews.resolveIssue', input, Commands.role(actor, ReviewService.REVIEWERS),
      ReviewService.resolveInternal.bind(ReviewService, actor, input))
  }

  static resolveHold(actor: Actor, input: Input<'resolveHold'>) {
    Security.fresh(actor)
    return Commands.execute(actor, 'compliance.resolve', input, Commands.role(actor, ReviewService.COMPLIANCE),
      ReviewService.resolveInternal.bind(ReviewService, actor, input))
  }

  static reprocess(actor: Actor, input: Input<'reprocess'>) {
    return Commands.execute(actor, 'work.reprocess', input, Commands.role(actor, ReviewService.ADMIN), async (tx) => {
      const current = await Commands.current(actor, input.caseId, tx)
      const { row, snapshot } = current
      Commands.revision(row.revision, input.expectedCaseRevision)
      Commands.require(snapshot.id === input.submissionId && snapshot.submittedAt && ['SUBMITTED', 'PENDING'].includes(row.status),
        'select the current submitted application')
      Commands.require(!snapshot.workItem_submission.some((item) => ['SCAN', 'EXTRACT', 'VERIFY'].includes(item.kind) && item.state === 'RUNNING'),
        'wait for the active document processing job before reprocessing')
      for (const document of snapshot.document_submission.filter((item) => item.status === 'CLEAN')) {
        const extraction = await ExtractionRepository.findFirst({ where: {
          tenantId: actor.tenantId, documentId: document.id, extractorVersion: DocumentProcessor.VERSION,
        } }, tx)
        if (extraction) continue
        const key = DocumentProcessor.extractionKey(document.id)
        const existing = snapshot.workItem_submission.find((item) => item.kind === 'EXTRACT' && item.dedupeKey === key)
        if (existing) {
          await WorkItemRepository.updateMany({ data: {
            attempt: 0, availableAt: new Date(), completedAt: null, lastErrorCode: null,
            leaseOwner: null, leaseUntil: null, state: 'READY',
          }, where: { id: existing.id, tenantId: actor.tenantId } }, tx)
          await OutboxEventRepository.create({ data: { tenantId: actor.tenantId, workItemId: existing.id } }, tx)
        } else {
          await Commands.enqueue(actor.tenantId, 'EXTRACT', key, { documentId: document.id }, tx, snapshot.id)
        }
      }
      const work = snapshot.workItem_submission.find((item) => item.kind === 'VERIFY' && item.dedupeKey === snapshot.id)
      if (work) {
        await WorkItemRepository.updateMany({ data: {
          attempt: 0, availableAt: new Date(), completedAt: null, lastErrorCode: null,
          leaseOwner: null, leaseUntil: null, state: 'READY',
        }, where: { id: work.id, tenantId: actor.tenantId } }, tx)
        await OutboxEventRepository.create({ data: { tenantId: actor.tenantId, workItemId: work.id } }, tx)
      } else {
        await Commands.enqueue(actor.tenantId, 'VERIFY', snapshot.id, {}, tx, snapshot.id)
      }
      await OnboardingCaseRepository.updateMany({ data: { revision: { increment: 1 }, status: 'SUBMITTED' },
        where: { id: row.id, tenantId: actor.tenantId } }, tx)
      await Commands.audit(actor, 'DOCUMENT_PROCESSING_RESTARTED', row.id, tx)
      return { id: snapshot.id, revision: row.revision + 1 }
    })
  }

  static retry(actor: Actor, input: Input<'retry'>) {
    return Commands.execute(actor, 'work.retry', input, Commands.role(actor, ReviewService.ADMIN), async (tx) => {
      const work = await WorkItemRepository.findFirst({ where: { id: input.workItemId, state: 'FAILED', tenantId: actor.tenantId } }, tx)
      Commands.require(work?.lastErrorCode === 'TRANSIENT', 'select a failed transient work item')
      await WorkItemRepository.updateMany({
        data: { attempt: 0, availableAt: new Date(), completedAt: null, state: 'READY' },
        where: { id: work.id, tenantId: actor.tenantId },
      }, tx)
      await OutboxEventRepository.create({ data: { tenantId: actor.tenantId, workItemId: work.id } }, tx)
      await Commands.audit(actor, 'WORK_RETRIED', work.id, tx)
      return { id: work.id, revision: work.leaseEpoch }
    })
  }
}
