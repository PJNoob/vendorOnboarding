import type { Prisma } from '@prisma/client'

import { BaseRepository, type TransactionClient } from '../base/BaseRepository'

export class SubmissionRepository extends BaseRepository {
  static create<T extends Prisma.SubmissionCreateArgs>(args: Prisma.SelectSubset<T, Prisma.SubmissionCreateArgs>, tx?: TransactionClient) {
    return SubmissionRepository.getClient(tx).submission.create(args)
  }

  static findFirst<T extends Prisma.SubmissionFindFirstArgs>(args: Prisma.SelectSubset<T, Prisma.SubmissionFindFirstArgs>, tx?: TransactionClient) {
    return SubmissionRepository.getClient(tx).submission.findFirst(args)
  }

  static findMany<T extends Prisma.SubmissionFindManyArgs>(args: Prisma.SelectSubset<T, Prisma.SubmissionFindManyArgs>, tx?: TransactionClient) {
    return SubmissionRepository.getClient(tx).submission.findMany(args)
  }

  static updateMany<T extends Prisma.SubmissionUpdateManyArgs>(args: Prisma.SelectSubset<T, Prisma.SubmissionUpdateManyArgs>, tx?: TransactionClient) {
    return SubmissionRepository.getClient(tx).submission.updateMany(args)
  }
}
