import type { Prisma } from '@prisma/client'

import { BaseRepository, type TransactionClient } from '../base/BaseRepository'

export class QualificationRepository extends BaseRepository {
  static createMany<T extends Prisma.QualificationCreateManyArgs>(args: Prisma.SelectSubset<T, Prisma.QualificationCreateManyArgs>, tx?: TransactionClient) {
    return QualificationRepository.getClient(tx).qualification.createMany(args)
  }

  static deleteMany<T extends Prisma.QualificationDeleteManyArgs>(args: Prisma.SelectSubset<T, Prisma.QualificationDeleteManyArgs>, tx?: TransactionClient) {
    return QualificationRepository.getClient(tx).qualification.deleteMany(args)
  }
}
