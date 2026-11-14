import type { Prisma } from '@prisma/client'

import { BaseRepository, type TransactionClient } from '../base/BaseRepository'

export class IssueRepository extends BaseRepository {
  static create<T extends Prisma.IssueCreateArgs>(args: Prisma.SelectSubset<T, Prisma.IssueCreateArgs>, tx?: TransactionClient) {
    return IssueRepository.getClient(tx).issue.create(args)
  }

  static createMany<T extends Prisma.IssueCreateManyArgs>(args: Prisma.SelectSubset<T, Prisma.IssueCreateManyArgs>, tx?: TransactionClient) {
    return IssueRepository.getClient(tx).issue.createMany(args)
  }

  static findFirst<T extends Prisma.IssueFindFirstArgs>(args: Prisma.SelectSubset<T, Prisma.IssueFindFirstArgs>, tx?: TransactionClient) {
    return IssueRepository.getClient(tx).issue.findFirst(args)
  }

  static updateMany<T extends Prisma.IssueUpdateManyArgs>(args: Prisma.SelectSubset<T, Prisma.IssueUpdateManyArgs>, tx?: TransactionClient) {
    return IssueRepository.getClient(tx).issue.updateMany(args)
  }
}
