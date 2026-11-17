import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'

import { Queue, Worker as BullWorker } from 'bullmq'
import IORedis from 'ioredis'
import { z } from 'zod'

import { env } from '@neo/env'
import type { DocumentKind, WorkItem } from '@neo/prisma'
import {
  BaseRepository, CheckEvidenceRepository, CheckRunRepository, DocumentRepository, ExtractionRepository,
  IssueRepository, NotificationRepository, OnboardingCaseRepository, OutboxEventRepository,
  InvitationRepository, SubmissionRepository, WorkItemRepository, type TransactionClient,
} from '@neo/prisma/repositories'

import { TRPCError } from '@trpc/server'

import { Commands } from './Commands'
import { supplierEmailVerifier, SupplierEmailVerifier } from './SupplierEmailVerifier'
import { DocumentProcessor } from './DocumentProcessor'
import { DocumentVerification } from './DocumentVerification'
import { MailProvider, ObjectStore } from './Providers'
import { ReviewEvidence } from './ReviewEvidence'
import { ReviewService } from './ReviewService'
import { type Actor, Secrets, Security } from './Security'
import { type Evidence, Verification } from './Verification'

type Effect = (tx: TransactionClient) => Promise<void>
type Current = Awaited<ReturnType<typeof Commands.current>>

export class Worker {
  static readonly ATTEMPTS = { EXTRACT: 3, NOTIFY: 5, SCAN: 3, VERIFY: 5 }
  static readonly BACKOFF = { EXTRACT: 30_000, NOTIFY: 30_000, SCAN: 5_000, VERIFY: 10_000 }
  static readonly ENVELOPE = z.strictObject({ schemaVersion: z.literal(1), workItemId: z.string() })
  static readonly LEASE_MS = 180_000
  static readonly VERIFICATION_COMMIT_RESERVE_MS = 10_000
  static readonly POLL_MS = 2_000
  static readonly INVITATION_POLL_MS = 35_000
  static readonly INVITATION_TEMPLATE = 'Supplier onboarding invitation'
  static readonly QUEUE = 'vendor-onboarding'
  private readonly owner = randomUUID()
  private readonly redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null })
  private readonly queue = new Queue<z.infer<typeof Worker.ENVELOPE>>(Worker.QUEUE, { connection: this.redis })

  private actor(work: WorkItem): Actor {
    return { channel: 'SYSTEM', createdAt: work.createdAt, email: '', id: 'worker', requestId: work.id, tenantId: work.tenantId, verified: true }
  }

  private async claim(id: string) {
    return BaseRepository.runInTransaction(async (tx) => {
      const work = await WorkItemRepository.findFirst({ where: { id } }, tx)
      if (!work) return undefined
      await Security.lock(work.tenantId, tx)
      const now = new Date()
      const changed = await WorkItemRepository.updateMany({
        data: {
          attempt: { increment: 1 }, leaseEpoch: { increment: 1 }, leaseOwner: this.owner,
          leaseUntil: new Date(Date.now() + Worker.LEASE_MS), startedAt: now, state: 'RUNNING',
        },
        where: { id, OR: [{ availableAt: { lte: now }, state: 'READY' }, { leaseUntil: { lte: now }, state: 'RUNNING' }] },
      }, tx)
      return changed.count ? await WorkItemRepository.findFirst({ where: { id } }, tx) : undefined
    })
  }

  private async commit(work: WorkItem, effect?: Effect, failureCode?: string) {
    await BaseRepository.runInTransaction(async (tx) => {
      await Security.lock(work.tenantId, tx)
      const updated = await WorkItemRepository.updateMany({
        data: { completedAt: new Date(), lastErrorCode: failureCode ?? null, leaseOwner: null, leaseUntil: null, state: failureCode ? 'FAILED' : 'SUCCEEDED' },
        where: this.fence(work),
      }, tx)
      if (updated.count && effect) await effect(tx)
      if (updated.count && work.kind !== 'NOTIFY') console.info(JSON.stringify({ event: 'document.processing.completed', workId: work.id, submissionId: work.submissionId, kind: work.kind, outcome: failureCode ?? 'COMPLETED' }))
      if (updated.count && work.kind === 'NOTIFY') console.info(JSON.stringify({ event: 'invitation.queue.completed', workId: work.id, outcome: failureCode ?? 'COMPLETED' }))
    })
  }

  private async dispatch() {
    const now = new Date()
    const pending = await WorkItemRepository.findMany({
      orderBy: [{ availableAt: 'asc' }, { id: 'asc' }], take: 100,
      where: { NOT: { notification_workItem: { some: { template: Worker.INVITATION_TEMPLATE } } }, OR: [{ availableAt: { lte: now }, state: 'READY' }, { leaseUntil: { lte: now }, state: 'RUNNING' }] },
    })
    for (const item of pending) await this.publish(item)
  }

  private async publish(item: WorkItem) {
    await this.queue.add(item.kind, { schemaVersion: 1, workItemId: item.id }, {
      jobId: `${item.id}-${item.leaseEpoch}`, removeOnComplete: true, removeOnFail: true,
    })
    await OutboxEventRepository.updateMany({
      data: { publishedAt: new Date() }, where: { publishedAt: null, tenantId: item.tenantId, workItemId: item.id },
    })
  }

  private async dispatchInvitation() {
    const now = new Date()
    const item = await WorkItemRepository.findFirst({
      orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      where: {
        notification_workItem: { some: { template: Worker.INVITATION_TEMPLATE } },
        OR: [{ availableAt: { lte: now }, state: 'READY' }, { leaseUntil: { lte: now }, state: 'RUNNING' }],
      },
    })
    if (!item) return
    // One durable FIFO entry per interval, even with multiple worker instances.
    if (await this.redis.set(`${Worker.QUEUE}:invitation-slot`, this.owner, 'PX', Worker.INVITATION_POLL_MS, 'NX') !== 'OK') return
    await this.publish(item)
  }

  private async invitationLoop(stopping: () => boolean, pause: (ms: number) => Promise<unknown> = delay) {
    while (!stopping()) {
      await this.dispatchInvitation().then(undefined, () => process.stderr.write('invitation queue dispatch unavailable\n'))
      await pause(Worker.INVITATION_POLL_MS)
    }
  }

  private async evidence(current: Current) {
    const documents = new Map<DocumentKind, Evidence[]>()
    for (const document of current.snapshot.document_submission.filter((item) => item.status === 'CLEAN')) {
      const where = { documentId: document.id, tenantId: document.tenantId }
      const extracted = await ExtractionRepository.findFirst({
        where: { ...where, extractorVersion: DocumentProcessor.VERSION },
      }) ?? await ExtractionRepository.findFirst({
        where: { ...where, extractorVersion: DocumentProcessor.LEGACY_VERSION },
      })
      if (!extracted) throw new Error('current document extraction is unavailable; reprocess this submission')
      const [bytes] = await ObjectStore.STORAGE.bucket(env.GCS_CLEAN_BUCKET).file(extracted.outputRef).download()
      const parsed = z.array(z.strictObject({ documentId: z.string(), page: z.int().positive(), text: z.string() }))
        .parse(JSON.parse(Secrets.decrypt(bytes, document.tenantId)))
      documents.set(document.kind, [...(documents.get(document.kind) ?? []), ...parsed])
    }
    return documents
  }

  private async fail(work: WorkItem, error: unknown) {
    if (error instanceof TRPCError && error.message === SupplierEmailVerifier.RATE_LIMITED) {
      await BaseRepository.runInTransaction(async (tx) => {
        await Security.lock(work.tenantId, tx)
        const changed = await WorkItemRepository.updateMany({
          data: { attempt: { decrement: 1 }, availableAt: new Date(Date.now() + Worker.INVITATION_POLL_MS), lastErrorCode: 'EMAIL_VERIFICATION_DEFERRED', leaseOwner: null, leaseUntil: null, state: 'READY' },
          where: this.fence(work),
        }, tx)
        if (changed.count) await NotificationRepository.updateMany({ data: { deliveryState: 'QUEUED' }, where: { tenantId: work.tenantId, workItemId: work.id } }, tx)
      })
      return
    }
    const exhausted = work.attempt >= Worker.ATTEMPTS[work.kind]
    if (work.kind !== 'NOTIFY') console.warn(JSON.stringify({ event: 'document.processing.retry', workId: work.id, submissionId: work.submissionId, kind: work.kind, attempt: work.attempt, exhausted }))
    const retryMs = Worker.BACKOFF[work.kind] * 2 ** (work.attempt - 1) + Math.random() * Worker.POLL_MS
    await BaseRepository.runInTransaction(async (tx) => {
      await Security.lock(work.tenantId, tx)
      const change = await WorkItemRepository.updateMany({
        data: {
          availableAt: new Date(Date.now() + retryMs), completedAt: exhausted ? new Date() : null,
          lastErrorCode: 'TRANSIENT', leaseOwner: null, leaseUntil: null, state: exhausted ? 'FAILED' : 'READY',
        },
        where: this.fence(work),
      }, tx)
      if (!change.count || !exhausted) return
      if (work.kind === 'NOTIFY') {
        await NotificationRepository.updateMany({ data: { deliveryState: 'UNKNOWN' }, where: { tenantId: work.tenantId, workItemId: work.id } }, tx)
      }
      await Commands.audit(this.actor(work), 'WORK_FAILED', work.id, tx)
    })
    throw error
  }

  private fence(work: WorkItem) {
    return { id: work.id, leaseEpoch: work.leaseEpoch, leaseOwner: this.owner, leaseUntil: { gt: new Date() }, state: 'RUNNING' as const, tenantId: work.tenantId }
  }

  private async notify(work: WorkItem) {
    const message = await NotificationRepository.findFirst({ where: { tenantId: work.tenantId, workItemId: work.id } })
    if (!message?.payloadCiphertext) return this.commit(work)
    const scope = `${work.tenantId}/${work.id}`
    if (message.template === 'Supplier onboarding invitation') {
      const invite = await InvitationRepository.findFirst({ where: { id: work.dedupeKey, tenantId: work.tenantId } })
      if (!invite || invite.revokedAt || invite.expiresAt <= new Date()) {
        return this.commit(work, async (tx) => {
          await NotificationRepository.updateMany({
            data: { deliveryState: 'CANCELED', payloadCiphertext: null },
            where: { id: message.id, tenantId: work.tenantId },
          }, tx)
        })
      }
      await NotificationRepository.updateMany({ data: { deliveryState: 'CHECKING' }, where: { id: message.id, tenantId: work.tenantId } })
      // This also protects invitations queued before mailbox verification was enabled.
      try {
        await supplierEmailVerifier.requireDeliverable(Secrets.decrypt(message.recipientCiphertext, scope))
      } catch (error) {
        if (error instanceof TRPCError && error.code === 'TOO_MANY_REQUESTS') throw error
        const invalid = error instanceof TRPCError && error.code === 'BAD_REQUEST'
        return this.commit(work, async (tx) => {
          await InvitationRepository.updateMany({
            data: { revokedAt: new Date() }, where: { id: invite.id, tenantId: work.tenantId },
          }, tx)
          await NotificationRepository.updateMany({
            data: { deliveryState: invalid ? 'INVALID' : 'VERIFICATION_FAILED', payloadCiphertext: null },
            where: { id: message.id, tenantId: work.tenantId },
          }, tx)
          await Commands.audit(this.actor(work), invalid ? 'INVITATION_RECIPIENT_INVALID' : 'INVITATION_VERIFICATION_FAILED', invite.id, tx)
        }, invalid ? 'INVALID_SUPPLIER_EMAIL' : 'EMAIL_VERIFICATION_FAILED')
      }
    }
    const id = await MailProvider.send(Secrets.decrypt(message.recipientCiphertext, scope), work.id, message.template, Secrets.decrypt(message.payloadCiphertext, scope))
    console.info(JSON.stringify({ event: 'invitation.email.accepted', workId: work.id, providerMessageId: id }))
    await this.commit(work, async (tx) => {
      await NotificationRepository.updateMany({
        data: { deliveryState: 'SENT', payloadCiphertext: null, providerMessageId: id },
        where: { id: message.id, tenantId: work.tenantId },
      }, tx)
    })
  }

  private async perform(work: WorkItem) {
    if (work.kind === 'NOTIFY') return this.notify(work)
    if (work.kind === 'VERIFY') return this.verify(work)
    const payload = z.object({ documentId: z.string() }).parse(work.payload)
    const document = await DocumentRepository.findFirst({ where: { id: payload.documentId, tenantId: work.tenantId } })
    if (!document || document.status === 'DELETED') return this.commit(work)
    if (work.kind === 'SCAN') {
      const clean = await DocumentProcessor.scan(document, work.leaseEpoch)
      return this.commit(work, async (tx) => {
        const change = await DocumentRepository.updateMany({
          data: clean ? { ...clean, status: 'CLEAN' } : { status: 'REJECTED' },
          where: { id: document.id, status: 'UPLOADED', tenantId: work.tenantId },
        }, tx)
        if (clean && change.count) await Commands.enqueue(work.tenantId, 'EXTRACT', DocumentProcessor.extractionKey(document.id), { documentId: document.id }, tx, document.submissionId)
      })
    }
    if (document.status !== 'CLEAN') return this.commit(work)
    const saved = await ExtractionRepository.findFirst({ where: { documentId: document.id, extractorVersion: DocumentProcessor.VERSION, tenantId: work.tenantId } })
    if (saved) return this.commit(work)
    const pages = await DocumentProcessor.extract(document)
    const outputRef = `extraction/${work.id}/${work.leaseEpoch}`
    await ObjectStore.STORAGE.bucket(env.GCS_CLEAN_BUCKET).file(outputRef).save(
      Secrets.encrypt(JSON.stringify(pages), work.tenantId), { preconditionOpts: { ifGenerationMatch: 0 }, resumable: false },
    )
    return this.commit(work, async (tx) => {
      await ExtractionRepository.create({ data: {
        documentId: document.id, extractorVersion: DocumentProcessor.VERSION, outputRef, tenantId: work.tenantId,
      } }, tx)
    })
  }

  private async process(payload: unknown) {
    const { workItemId } = Worker.ENVELOPE.parse(payload)
    const work = await this.claim(workItemId)
    if (!work) return
    if (work.kind !== 'NOTIFY') console.info(JSON.stringify({ event: 'document.processing.started', workId: work.id, submissionId: work.submissionId, kind: work.kind, attempt: work.attempt }))
    await this.perform(work).then(undefined, this.fail.bind(this, work))
  }

  private async verify(work: WorkItem) {
    const actor = this.actor(work)
    const submission = await SubmissionRepository.findFirst({ where: { id: work.submissionId ?? '', tenantId: work.tenantId } })
    Commands.require(submission, 'submitted snapshot is unavailable')
    const current = await Commands.current(actor, submission.caseId)
    if (current.snapshot.id !== submission.id) return this.commit(work)
    if (current.snapshot.workItem_submission.some((item) => ['SCAN', 'EXTRACT'].includes(item.kind) && (item.state === 'READY' || item.state === 'RUNNING'))) {
      await WorkItemRepository.updateMany({
        data: { attempt: { decrement: 1 }, availableAt: new Date(Date.now() + Worker.POLL_MS), leaseOwner: null, leaseUntil: null, state: 'READY' },
        where: this.fence(work),
      })
      return
    }
    const failed = current.snapshot.workItem_submission.some((item) => item.kind === 'EXTRACT' && item.state === 'FAILED' &&
      current.snapshot.document_submission.some((document) => item.dedupeKey === DocumentProcessor.extractionKey(document.id)))
    if (failed) throw new Error('document processing failed; retry the failed document job')
    const documents = await this.evidence(current)
    const [agent, deterministic] = await Promise.all([
      DocumentVerification.evaluate(current, documents),
      Verification.evaluate(current, documents),
    ])
    // Keep established policy checks and ownership screening. Agent findings can require
    // review, but cannot override a failed deterministic check or a compliance hold.
    const findings = deterministic.map((finding) => {
      const checked = agent.find((item) => item.rule === finding.rule)
      if (!checked) return finding
      return {
        ...finding, trace: checked.trace, source: checked.source,
        ...(checked.result !== 'PASS' ? { code: checked.code, message: checked.message, result: checked.result } : {}),
        evidence: [...finding.evidence, ...checked.evidence].filter((item, index, items) =>
          items.findIndex((other) => other.documentId === item.documentId && other.page === item.page) === index),
      }
    }).filter((finding) => Commands.rules(current.policy).includes(finding.rule))
    const certificate = findings.find((finding) => finding.rule === 'CERTIFICATE_SCOPE' && finding.result !== 'PASS')
    if (certificate) {
      const availableMs = work.leaseUntil
        ? work.leaseUntil.getTime() - Date.now() - Worker.VERIFICATION_COMMIT_RESERVE_MS
        : undefined
      const suggestion = await ReviewEvidence.generateScopeSuggestion(current, documents.get('CERTIFICATE') ?? [], availableMs)
      if (suggestion) certificate.trace = { ...certificate.trace, ...suggestion }
    }
    await this.commit(work, async (tx) => {
      const latest = await Commands.caseRow(actor, submission.caseId, tx)
      if (latest.currentNumber !== submission.number || !['SUBMITTED', 'PENDING'].includes(latest.status)) return
      for (const finding of findings) {
        const previous = await CheckRunRepository.findFirst({
          orderBy: { attempt: 'desc' },
          where: { ruleKey: finding.rule, submissionId: submission.id, tenantId: work.tenantId },
        }, tx)
        const result = await CheckRunRepository.create({ data: {
          attempt: (previous?.attempt ?? 0) + 1, checkedAt: new Date(), evidenceJson: finding.trace,
          reasonCode: finding.code, result: finding.result, ruleKey: finding.rule, ruleVersion: '1',
          sourceMode: finding.source, submissionId: submission.id, tenantId: work.tenantId,
          validUntil: finding.rule === 'OWNERSHIP_SCREENING' ? new Date(Date.now() + Commands.DAY_MS) : null,
        } }, tx)
        await CheckEvidenceRepository.createMany({ data: finding.evidence.map(({ documentId, page }) => ({
          checkRunId: result.id, documentId, fieldPath: finding.rule, page, tenantId: work.tenantId,
        })) }, tx)
        if (finding.result === 'PASS') {
          await IssueRepository.updateMany({
            data: { resolution: 'RECHECK_PASSED', resolvedAt: new Date() },
            where: { checkRule: finding.rule, ownerRole: { not: 'COMPLIANCE' }, resolvedAt: null, submissionId: submission.id, tenantId: work.tenantId },
          }, tx)
        } else {
          const ownerRole = finding.message ? 'REVIEWER' : 'COMPLIANCE'
          const existing = await IssueRepository.findFirst({
            where: { checkRule: finding.rule, code: finding.code, ownerRole, resolvedAt: null, submissionId: submission.id, tenantId: work.tenantId },
          }, tx)
          if (!existing) await IssueRepository.create({ data: {
            checkRule: finding.rule, code: finding.code, ownerRole, submissionId: submission.id,
            supplierMessage: finding.message || undefined, tenantId: work.tenantId,
          } }, tx)
        }
      }
      await OnboardingCaseRepository.updateMany({
        data: { revision: { increment: 1 }, status: 'PENDING' }, where: { id: latest.id, tenantId: work.tenantId },
      }, tx)
      const corrections = findings.filter((finding) => finding.result !== 'PASS' && finding.message).map((finding) => finding.message)
      await ReviewService.notify(actor, latest.id, submission.id, `checks-${work.id}-${work.leaseEpoch}`,
        corrections.length ? ReviewService.correctionText(corrections) : 'Your submission is awaiting review.', tx)
      await Commands.audit(actor, 'VERIFICATION_COMPLETED', latest.id, tx)
    })
  }

  async run() {
    const consumer = new BullWorker(Worker.QUEUE, (job) => this.process(job.data), { connection: this.redis })
    consumer.on('error', () => process.stderr.write('queue connection error\n'))
    let stopping = false
    process.once('SIGTERM', () => { stopping = true })
    process.once('SIGINT', () => { stopping = true })
    try {
      console.info(JSON.stringify({ event: 'invitation.queue.started', intervalMs: Worker.INVITATION_POLL_MS, automaticDelivery: true }))
      await Promise.all([this.loop(() => stopping), this.invitationLoop(() => stopping)])
    } finally {
      await consumer.close()
      await this.queue.close()
      await this.redis.quit()
    }
  }

  private async loop(stopping: () => boolean) {
    while (!stopping()) {
      await this.dispatch().then(undefined, () => process.stderr.write('queue dispatch unavailable\n'))
      await delay(Worker.POLL_MS)
    }
  }
}
