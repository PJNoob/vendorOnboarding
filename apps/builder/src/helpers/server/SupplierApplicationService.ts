import { TRPCError } from '@trpc/server'

import { CaseAccessRepository, OnboardingCaseRepository, PolicyVersionRepository, SubmissionRepository } from '@neo/prisma/repositories'
import type { Input } from '@neo/schemas'

import { Commands } from './Commands'
import { type Actor, Security } from './Security'
import { TeamService } from './TeamService'

export class SupplierApplicationService {
  static async create(actor: Actor, input: Input<'createSupplierApplication'>) {
    const authorize = async () => {
      if (actor.channel !== Security.SUPPLIER || !actor.verified) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Use verified supplier email sign-in to start an application.' })
      }
    }
    await authorize()
    const scoped = { ...actor, tenantId: TeamService.BOOTSTRAP_TENANT }
    return Commands.execute(scoped, 'supplier.create', input, authorize, async (tx) => {
      const policy = await PolicyVersionRepository.findFirst({
        orderBy: { version: 'desc' },
        where: { category: input.category, country: input.country, tenantId: scoped.tenantId, publishedAt: { lte: new Date() } },
      }, tx)
      Commands.require(policy, 'Applications are not available for this country and service yet. Contact Harbor BioLabs for assistance.')
      const row = await OnboardingCaseRepository.create({ data: {
        category: input.category, country: input.country, createdById: actor.id,
        currentNumber: 1, policyId: policy.id, requestedSite: input.requestedSite, status: 'DRAFT', tenantId: scoped.tenantId,
      } }, tx)
      await SubmissionRepository.create({ data: { caseId: row.id, number: 1, tenantId: scoped.tenantId } }, tx)
      const key = { caseId: row.id, tenantId: scoped.tenantId, userId: actor.id }
      await CaseAccessRepository.upsert({ create: key, update: {}, where: { tenantId_caseId_userId: key } }, tx)
      await Commands.audit(scoped, 'SUPPLIER_APPLICATION_CREATED', row.id, tx)
      return { id: row.id, revision: row.revision }
    })
  }
}
