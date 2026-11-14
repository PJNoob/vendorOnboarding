import type { Prisma } from '@prisma/client'

import { BaseRepository, type TransactionClient } from '../base/BaseRepository'

export class OnboardingCaseRepository extends BaseRepository {
  static create<T extends Prisma.OnboardingCaseCreateArgs>(args: Prisma.SelectSubset<T, Prisma.OnboardingCaseCreateArgs>, tx?: TransactionClient) {
    return OnboardingCaseRepository.getClient(tx).onboardingCase.create(args)
  }

  static findFirst<T extends Prisma.OnboardingCaseFindFirstArgs>(args: Prisma.SelectSubset<T, Prisma.OnboardingCaseFindFirstArgs>, tx?: TransactionClient) {
    return OnboardingCaseRepository.getClient(tx).onboardingCase.findFirst(args)
  }

  static findMany<T extends Prisma.OnboardingCaseFindManyArgs>(args: Prisma.SelectSubset<T, Prisma.OnboardingCaseFindManyArgs>, tx?: TransactionClient) {
    return OnboardingCaseRepository.getClient(tx).onboardingCase.findMany(args)
  }

  static updateMany<T extends Prisma.OnboardingCaseUpdateManyArgs>(args: Prisma.SelectSubset<T, Prisma.OnboardingCaseUpdateManyArgs>, tx?: TransactionClient) {
    return OnboardingCaseRepository.getClient(tx).onboardingCase.updateMany(args)
  }
}
