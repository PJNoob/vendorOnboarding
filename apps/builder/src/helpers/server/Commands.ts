import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { env } from '@neo/env'
import { Prisma, type BuyerRole, type WorkKind } from '@neo/prisma'
import {
  AuditEventRepository, BaseRepository, IdempotencyRecordRepository, NotificationRepository,
  OnboardingCaseRepository, OutboxEventRepository, SubmissionRepository, WorkItemRepository,
  type TransactionClient,
} from '@neo/prisma/repositories'

import { Values } from '@neo/schemas'

import { type Actor, Secrets, Security } from './Security'

export class Commands {
  static readonly DAY_MS = 86_400_000
  static readonly POLICY = z.strictObject({
    documents: z.array(z.enum(Values.DOCUMENTS)).min(1),
    bannedCountries: z.array(z.string().regex(/^[A-Z]{2}$/)).optional(),
    rules: z.array(z.string().min(1)).min(1),
  })
  // These checks run for every case, including cases created under policies published before they existed.
  static readonly MANDATORY_RULES = ['ADVERSE_SCREENING', 'COUNTRY_RESTRICTION', 'DOCUMENT_TYPE'] as const
  static readonly REPLAY_DAYS = 7

  static rules(policy: { rules: string[] }) {
    return [...new Set([...policy.rules, ...Commands.MANDATORY_RULES])]
  }

  static async audit(actor: Actor, action: string, entityId: string, tx: TransactionClient, metadata: Prisma.InputJsonObject = {}) {
    await AuditEventRepository.create({ data: {
      action, actorId: actor.id, actorType: actor.channel, entityId, entityType: 'ONBOARDING',
      requestId: actor.requestId, safeMetadata: metadata, tenantId: actor.tenantId,
    } }, tx)
  }

  static async caseRow(actor: Actor, caseId: string, tx?: TransactionClient) {
    const row = await OnboardingCaseRepository.findFirst({
      include: { policy: true, createdBy: { select: { name: true, email: true } } }, where: { id: caseId, tenantId: actor.tenantId },
    }, tx)
    if (!row || row.currentNumber === null) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'case is unavailable' })
    }
    return row
  }

  static async current(actor: Actor, caseId: string, tx?: TransactionClient) {
    const row = await Commands.caseRow(actor, caseId, tx)
    const snapshot = await SubmissionRepository.findFirst({
      include: {
        bankProfile: true, checkRun_submission: {
          include: { checkEvidence_checkRun: true },
          orderBy: { attempt: 'desc' },
        },
        companyProfile: true, decision_submission: { include: { reviewer: { select: { name: true } } }, orderBy: { createdAt: 'desc' } },
        document_submission: { where: { status: { not: 'DELETED' } } },
        issue_submission: true, ownershipEdge_submission: true, ownershipEntity_submission: true,
        qualification_submission: true, taxProfile: true, workItem_submission: true,
      },
      where: { caseId, number: row.currentNumber ?? 0, tenantId: actor.tenantId },
    }, tx)
    if (!snapshot) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'submission is unavailable' })
    }
    return { policy: Commands.POLICY.parse(row.policy.definition), row, snapshot }
  }

  static async enqueue(tenantId: string, kind: WorkKind, dedupeKey: string, payload: Prisma.InputJsonObject, tx: TransactionClient, submissionId?: string) {
    const work = await WorkItemRepository.create({
      data: { dedupeKey, kind, payload, submissionId, tenantId },
    }, tx)
    await OutboxEventRepository.create({ data: { tenantId, workItemId: work.id } }, tx)
    return work
  }

  static async execute<T extends { id: string; revision: number }>(
    actor: Actor, operation: string, input: { idempotencyKey: string }, authorize: (tx: TransactionClient) => Promise<unknown>,
    apply: (tx: TransactionClient) => Promise<T>,
  ): Promise<T> {
    return BaseRepository.runInTransaction(async (tx) => {
      await Security.lock(actor.tenantId, tx)
      await authorize(tx)
      const key = { actorId: actor.id, key: input.idempotencyKey, operation, tenantId: actor.tenantId }
      const requestHash = Secrets.mac(JSON.stringify(input), 'idempotency')
      const saved = await IdempotencyRecordRepository.findUnique({
        where: { tenantId_actorId_operation_key: key },
      }, tx)
      if (saved && saved.expiresAt.getTime() > Date.now()) {
        if (saved.requestHash !== requestHash) {
          throw new TRPCError({ code: 'CONFLICT', message: 'use a new idempotency key for changed input' })
        }
        return saved.response as T
      }
      if (saved) await IdempotencyRecordRepository.deleteMany({ where: { id: saved.id } }, tx)
      const result = await apply(tx)
      await IdempotencyRecordRepository.create({ data: {
        ...key, expiresAt: new Date(Date.now() + Commands.REPLAY_DAYS * Commands.DAY_MS),
        requestHash, response: result,
      } }, tx)
      return result
    })
  }

  static async notify(actor: Actor, email: string, template: string, key: string, body: string, tx: TransactionClient, submissionId?: string) {
    const work = await Commands.enqueue(actor.tenantId, 'NOTIFY', key, {}, tx, submissionId)
    const captured = process.env.LOCAL_CAPTURE_TEST_EMAILS === 'true' && process.env.NODE_ENV !== 'production' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(new URL(env.APP_URL).hostname) && email.toLowerCase().endsWith('.test')
    if (captured) await WorkItemRepository.updateMany({ data: { state: 'SUCCEEDED', completedAt: new Date() }, where: { id: work.id, tenantId: actor.tenantId } }, tx)
    const scope = `${actor.tenantId}/${work.id}`
    await NotificationRepository.create({ data: {
      deliveryState: captured ? 'CAPTURED_TEST' : 'QUEUED', keyVersion: Secrets.KEY_VERSION,
      payloadCiphertext: Secrets.encrypt(body, scope), recipientCiphertext: Secrets.encrypt(email, scope),
      template, tenantId: actor.tenantId, workItemId: work.id,
    } }, tx)
  }

  static require(condition: unknown, message: string): asserts condition {
    if (!condition) throw new TRPCError({ code: 'PRECONDITION_FAILED', message })
  }

  static revision(actual: number, expected: number) {
    if (actual !== expected) {
      throw new TRPCError({ code: 'CONFLICT', message: 'refresh the case before making this change' })
    }
  }

  static role(actor: Actor, roles: readonly BuyerRole[]) {
    return Security.buyer.bind(Security, actor, roles)
  }

  static url(path: string) {
    return new URL(path, env.APP_URL).toString()
  }
}
