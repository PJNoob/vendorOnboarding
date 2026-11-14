import type { Prisma } from '@prisma/client'

import { BaseRepository, type TransactionClient } from '../base/BaseRepository'

export class BuyerEnrollmentRepository extends BaseRepository {
  static findMany<T extends Prisma.BuyerEnrollmentFindManyArgs>(args: Prisma.SelectSubset<T, Prisma.BuyerEnrollmentFindManyArgs>, tx?: TransactionClient) {
    return BuyerEnrollmentRepository.getClient(tx).buyerEnrollment.findMany(args)
  }

  static updateMany<T extends Prisma.BuyerEnrollmentUpdateManyArgs>(args: Prisma.SelectSubset<T, Prisma.BuyerEnrollmentUpdateManyArgs>, tx?: TransactionClient) {
    return BuyerEnrollmentRepository.getClient(tx).buyerEnrollment.updateMany(args)
  }

  static upsert<T extends Prisma.BuyerEnrollmentUpsertArgs>(args: Prisma.SelectSubset<T, Prisma.BuyerEnrollmentUpsertArgs>, tx?: TransactionClient) {
    return BuyerEnrollmentRepository.getClient(tx).buyerEnrollment.upsert(args)
  }
}
