import { demoAuthEnabled, env } from '@neo/env'
import {
  BaseRepository, BuyerEnrollmentRepository, MembershipRepository, PolicyVersionRepository, TenantRepository,
} from '@neo/prisma/repositories'
import { type Input, Values } from '@neo/schemas'

import { Commands } from './Commands'
import { demoIdentity } from './DemoIdentity'
import { ReviewService } from './ReviewService'
import { type Actor, Secrets, Security } from './Security'

export class TeamService {
  static readonly ADMIN = ['ADMIN'] as const
  static readonly BOOTSTRAP_TENANT = 'harbor-biolabs'

  static async accept(actor: Actor) {
    if (actor.channel !== Security.BUYER || !actor.verified) return
    const emailKey = Secrets.mac(Secrets.email(actor.email), 'email')
    const pending = await BuyerEnrollmentRepository.findMany({
      where: { acceptedAt: null, emailKey, expiresAt: { gt: new Date() }, revokedAt: null },
    })
    for (const invite of pending) {
      await BaseRepository.runInTransaction(async (tx) => {
        await Security.lock(invite.tenantId, tx)
        const result = await BuyerEnrollmentRepository.updateMany({
          data: { acceptedAt: new Date() },
          where: { acceptedAt: null, emailKey, expiresAt: { gt: new Date() }, id: invite.id, revokedAt: null },
        }, tx)
        if (!result.count) return
        const key = { tenantId: invite.tenantId, userId: actor.id }
        await MembershipRepository.upsert({
          create: { ...key, role: invite.role }, update: { active: true }, where: { tenantId_userId: key },
        }, tx)
        await Commands.audit({ ...actor, tenantId: invite.tenantId }, 'BUYER_ENROLLED', invite.id, tx)
      })
    }
  }

  static enroll(actor: Actor, input: Input<'enroll'>) {
    Security.fresh(actor)
    return Commands.execute(actor, 'team.enroll', input, Commands.role(actor, TeamService.ADMIN), async (tx) => {
      const email = Secrets.email(input.email)
      const key = { emailKey: Secrets.mac(email, 'email'), tenantId: actor.tenantId }
      const fields = { expiresAt: new Date(Date.now() + Commands.REPLAY_DAYS * Commands.DAY_MS), role: input.role }
      const invite = await BuyerEnrollmentRepository.upsert({
        create: { ...fields, ...key }, update: { ...fields, acceptedAt: null, revokedAt: null }, where: { tenantId_emailKey: key },
      }, tx)
      await Commands.notify(actor, email, 'Buyer workspace enrollment', input.idempotencyKey, Commands.url('/'), tx)
      await Commands.audit(actor, 'BUYER_ENROLLMENT_CREATED', invite.id, tx)
      return { id: invite.id, revision: 0 }
    })
  }

  static member(actor: Actor, input: Input<'role'> | Input<'member'>) {
    Security.fresh(actor)
    const operation = 'role' in input ? 'team.setRole' : 'team.revoke'
    return Commands.execute(actor, operation, input, Commands.role(actor, TeamService.ADMIN), async (tx) => {
      const where = { active: true, id: input.membershipId, tenantId: actor.tenantId }
      const existing = await MembershipRepository.findFirst({ where }, tx)
      Commands.require(existing, 'active membership is unavailable')
      const role = 'role' in input ? input.role : undefined
      if (existing.role === 'ADMIN' && role !== 'ADMIN') {
        const count = await MembershipRepository.count({ where: { active: true, role: 'ADMIN', tenantId: actor.tenantId } }, tx)
        Commands.require(count > 1, 'keep at least one active administrator')
      }
      await MembershipRepository.updateMany({ data: { active: Boolean(role), role }, where }, tx)
      await Commands.audit(actor, role ? 'BUYER_ROLE_CHANGED' : 'BUYER_REVOKED', existing.id, tx)
      return { id: existing.id, revision: 0 }
    })
  }

  static async seed() {
    await BaseRepository.runInTransaction(async (tx) => {
      const tenantId = TeamService.BOOTSTRAP_TENANT
      await TenantRepository.upsert({ create: { id: tenantId, name: 'Harbor BioLabs' }, update: {}, where: { id: tenantId } }, tx)
      await Security.lock(tenantId, tx)
      const key = { emailKey: Secrets.mac(Secrets.email(env.BOOTSTRAP_ADMIN_EMAIL), 'email'), tenantId }
      await BuyerEnrollmentRepository.upsert({
        create: { ...key, expiresAt: new Date(Date.now() + Commands.REPLAY_DAYS * Commands.DAY_MS), role: 'ADMIN' },
        update: {}, where: { tenantId_emailKey: key },
      }, tx)
      const tenantIds: string[] = [tenantId]
      if (demoAuthEnabled()) {
        await TenantRepository.upsert({
          create: { id: demoIdentity.tenantId, name: 'Harbor BioLabs Demo' }, update: {}, where: { id: demoIdentity.tenantId },
        }, tx)
        await tx.user.upsert({
          create: { id: demoIdentity.id, email: demoIdentity.email, emailVerified: true, name: demoIdentity.name },
          update: {}, where: { id: demoIdentity.id, email: demoIdentity.email },
        })
        const key = { tenantId: demoIdentity.tenantId, userId: demoIdentity.id }
        await MembershipRepository.upsert({
          create: { ...key, role: 'ADMIN' }, update: {}, where: { tenantId_userId: key },
        }, tx)
        tenantIds.push(demoIdentity.tenantId)
      }
      for (const policyTenantId of tenantIds) {
        for (const country of Values.COUNTRIES) {
          const policy = { category: 'CALIBRATION', country, tenantId: policyTenantId, version: 1 }
          await PolicyVersionRepository.upsert({
            create: { ...policy, definition: { documents: [...Values.DOCUMENTS], rules: [...ReviewService.RULES] }, publishedAt: new Date() },
            update: {}, where: { tenantId_category_country_version: policy },
          }, tx)
        }
      }
    })
  }
}

