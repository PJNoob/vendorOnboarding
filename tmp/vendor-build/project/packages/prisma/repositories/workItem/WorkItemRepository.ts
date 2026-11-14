import type { Prisma } from '@prisma/client'

import { BaseRepository, type TransactionClient } from '../base/BaseRepository'

export class WorkItemRepository extends BaseRepository {
  static create<T extends Prisma.WorkItemCreateArgs>(args: Prisma.SelectSubset<T, Prisma.WorkItemCreateArgs>, tx?: TransactionClient) {
    return WorkItemRepository.getClient(tx).workItem.create(args)
  }

  static findFirst<T extends Prisma.WorkItemFindFirstArgs>(args: Prisma.SelectSubset<T, Prisma.WorkItemFindFirstArgs>, tx?: TransactionClient) {
    return WorkItemRepository.getClient(tx).workItem.findFirst(args)
  }

  static findMany<T extends Prisma.WorkItemFindManyArgs>(args: Prisma.SelectSubset<T, Prisma.WorkItemFindManyArgs>, tx?: TransactionClient) {
    return WorkItemRepository.getClient(tx).workItem.findMany(args)
  }

  static updateMany<T extends Prisma.WorkItemUpdateManyArgs>(args: Prisma.SelectSubset<T, Prisma.WorkItemUpdateManyArgs>, tx?: TransactionClient) {
    return WorkItemRepository.getClient(tx).workItem.updateMany(args)
  }
}
