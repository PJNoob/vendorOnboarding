import { TRPCError } from '@trpc/server'

import {
  CaseAccessRepository, InvitationRepository, OnboardingCaseRepository, PolicyVersionRepository,
  SubmissionRepository, type TransactionClient,
} from '@neo/prisma/repositories'
import type { Invitation } from '@neo/prisma'
import type { Input, Output } from '@neo/schemas'

import { Commands } from './Commands'
import { type Actor, Secrets, Security } from './Security'

export class InvitationService {
  static readonly MANAGERS = ['ADMIN', 'BUYER'] as const

  private static async issue(actor: Actor, caseId: string, email: string, tx: TransactionClient) {
    const normalized = Secrets.email(email)
    const token = Secrets.token()
    const invite = await InvitationRepository.create({ data: {
      caseId, emailKey: Secrets.mac(normalized, 'email'),
      expiresAt: new Date(Date.now() + Commands.REPLAY_DAYS * Commands.DAY_MS),
      recipientCiphertext: Secrets.encrypt(normalized, actor.tenantId),
      tenantId: actor.tenantId, tokenHash: Secrets.hash(token),
    } }, tx)
    await Commands.notify(actor, normalized, 'Supplier onboarding invitation', invite.id,
      Commands.url(`/invite#${token}`), tx, (await Commands.current(actor, caseId, tx)).snapshot.id)
    return invite
  }

  static async create(actor: Actor, input: Input<'create'>) {
    return Commands.execute(actor, 'cases.create', input, Commands.role(actor, InvitationService.MANAGERS), async (tx) => {
      const policy = await PolicyVersionRepository.findFirst({
        orderBy: { version: 'desc' },
        where: { category: input.category, country: input.country, tenantId: actor.tenantId },
      }, tx)
      Commands.require(policy, 'publish a matching policy before creating a case')
      const row = await OnboardingCaseRepository.create({ data: {
        category: input.category, country: input.country, createdById: actor.id,
        currentNumber: 1, policyId: policy.id, requestedSite: input.requestedSite, tenantId: actor.tenantId,
      } }, tx)
      await SubmissionRepository.create({ data: { caseId: row.id, number: 1, tenantId: actor.tenantId } }, tx)
      await InvitationService.issue(actor, row.id, input.supplierEmail, tx)
      await Commands.audit(actor, 'CASE_CREATED', row.id, tx)
      return { id: row.id, revision: row.revision }
    })
  }

  static async pending(actor: Actor): Promise<Output<'pendingInvitations'>> {
    if (actor.channel !== Security.SUPPLIER || !actor.verified) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Use supplier email sign-in to view your invitations.' })
    }
    const invitations = await InvitationRepository.findMany({
      where: { emailKey: Secrets.mac(Secrets.email(actor.email), 'email'), redeemedAt: null, revokedAt: null, expiresAt: { gt: new Date() }, case: { status: { in: ['INVITED', 'DRAFT'] } } },
      include: { case: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100,
    })
    return { items: invitations.map((invite) => ({ id: invite.id, caseId: invite.caseId,
      requestedSite: invite.case.requestedSite, country: invite.case.country, expiresAt: invite.expiresAt.toISOString(),
    })) }
  }

  static async redeem(actor: Actor, input: Input<'redeem'>) {
    const invite = await InvitationRepository.findUnique({ where: { tokenHash: Secrets.hash(input.token) } })
    return InvitationService.acceptInvite(actor, input, invite, 'invitations.redeem')
  }

  static async accept(actor: Actor, input: Input<'acceptInvitation'>) {
    const invite = await InvitationRepository.findUnique({ where: { id: input.invitationId } })
    return InvitationService.acceptInvite(actor, input, invite, 'invitations.accept')
  }

  private static async acceptInvite(actor: Actor, input: { idempotencyKey: string }, invite: Invitation | null, operation: string) {
    if (actor.channel !== Security.SUPPLIER || !actor.verified) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Use supplier email sign-in with the email address that received this invitation.' })
    }
    if (!invite || invite.emailKey !== Secrets.mac(Secrets.email(actor.email), 'email')) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'This invitation is unavailable for this email address. Sign in with the address that received it.' })
    }
    const scoped = { ...actor, tenantId: invite.tenantId }
    return Commands.execute(scoped, operation, input, async (tx) => {
      const existing = await CaseAccessRepository.findFirst({ where: { caseId: invite.caseId, tenantId: invite.tenantId, userId: actor.id } }, tx)
      Commands.require(!existing?.revokedAt, 'case access has been revoked')
    }, async (tx) => {
      const current = await InvitationRepository.findUnique({ where: { id: invite.id } }, tx)
      Commands.require(current && !current.revokedAt && current.expiresAt > new Date(), 'This invitation has expired or been revoked. Ask the buyer for a new invitation.')
      const row = await Commands.caseRow(scoped, invite.caseId, tx)
      const key = { caseId: row.id, tenantId: invite.tenantId, userId: actor.id }
      if (current.redeemedAt) {
        const access = await CaseAccessRepository.findFirst({ where: { ...key, revokedAt: null } }, tx)
        Commands.require(access, 'This invitation has already been used.')
        return { id: row.id, revision: row.revision }
      }
      Commands.require(['INVITED', 'DRAFT'].includes(row.status), 'This application is no longer accepting invitations.')
      const consumed = await InvitationRepository.updateMany({ data: { redeemedAt: new Date() },
        where: { expiresAt: { gt: new Date() }, id: invite.id, redeemedAt: null, revokedAt: null },
      }, tx)
      Commands.require(consumed.count === 1, 'This invitation has already been used.')
      await CaseAccessRepository.upsert({ create: key, update: {}, where: { tenantId_caseId_userId: key } }, tx)
      await OnboardingCaseRepository.updateMany({ data: { revision: { increment: 1 }, status: 'DRAFT' }, where: { id: row.id, tenantId: invite.tenantId } }, tx)
      await Commands.audit(scoped, 'INVITATION_REDEEMED', row.id, tx)
      return { id: row.id, revision: row.revision + 1 }
    })
  }

  static async reissue(actor: Actor, input: Input<'reissue'>) {
    return Commands.execute(actor, 'invitations.reissue', input, Commands.role(actor, InvitationService.MANAGERS), async (tx) => {
      const row = await Commands.caseRow(actor, input.caseId, tx)
      Commands.revision(row.revision, input.expectedCaseRevision)
      Commands.require(row.status === 'INVITED' || row.status === 'DRAFT', 'case is no longer accepting invitations')
      const previous = await InvitationRepository.findFirst({
        orderBy: { createdAt: 'desc' }, where: { caseId: row.id, tenantId: actor.tenantId },
      }, tx)
      Commands.require(previous, 'original invitation is unavailable')
      await InvitationRepository.updateMany({
        data: { revokedAt: new Date() }, where: { caseId: row.id, redeemedAt: null, revokedAt: null, tenantId: actor.tenantId },
      }, tx)
      const next = await InvitationService.issue(actor, row.id, Secrets.decrypt(previous.recipientCiphertext, actor.tenantId), tx)
      await Commands.audit(actor, 'INVITATION_REISSUED', row.id, tx)
      return { id: next.id, revision: row.revision }
    })
  }

  static revoke(actor: Actor, input: Input<'invite'>) {
    return Commands.execute(actor, 'invitations.revoke', input, Commands.role(actor, InvitationService.MANAGERS), async (tx) => {
      const row = await Commands.caseRow(actor, input.caseId, tx)
      Commands.revision(row.revision, input.expectedCaseRevision)
      const result = await InvitationRepository.updateMany({
        data: { revokedAt: new Date() },
        where: { caseId: row.id, id: input.invitationId, redeemedAt: null, revokedAt: null, tenantId: actor.tenantId },
      }, tx)
      Commands.require(result.count, 'unused invitation is unavailable')
      await Commands.audit(actor, 'INVITATION_REVOKED', row.id, tx)
      return { id: input.invitationId, revision: row.revision }
    })
  }

  static revokeAccess(actor: Actor, input: Input<'revokeAccess'>) {
    return Commands.execute(actor, 'access.revoke', input, Commands.role(actor, InvitationService.MANAGERS), async (tx) => {
      const row = await Commands.caseRow(actor, input.caseId, tx)
      Commands.revision(row.revision, input.expectedCaseRevision)
      const result = await CaseAccessRepository.updateMany({
        data: { revokedAt: new Date() }, where: { caseId: row.id, revokedAt: null, tenantId: actor.tenantId, userId: input.userId },
      }, tx)
      Commands.require(result.count, 'active supplier access is unavailable')
      await Commands.audit(actor, 'SUPPLIER_ACCESS_REVOKED', row.id, tx)
      return { id: row.id, revision: row.revision }
    })
  }
}
