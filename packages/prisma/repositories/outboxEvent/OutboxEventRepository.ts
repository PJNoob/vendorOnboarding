import type { Prisma } from '@prisma/client'

import { BaseRepository, type TransactionClient } from '../base/BaseRepository'

export class OutboxEventRepository extends BaseRepository {
  static create<T extends Prisma.OutboxEventCreateArgs>(args: Prisma.SelectSubset<T, Prisma.OutboxEventCreateArgs>, tx?: TransactionClient) {
    return OutboxEventRepository.getClient(tx).outboxEvent.create(args)
  }

  static findMany<T extends Prisma.OutboxEventFindManyArgs>(args: Prisma.SelectSubset<T, Prisma.OutboxEventFindManyArgs>, tx?: TransactionClient) {
    return OutboxEventRepository.getClient(tx).outboxEvent.findMany(args)
  }

  static updateMany<T extends Prisma.OutboxEventUpdateManyArgs>(args: Prisma.SelectSubset<T, Prisma.OutboxEventUpdateManyArgs>, tx?: TransactionClient) {
    return OutboxEventRepository.getClient(tx).outboxEvent.updateMany(args)
  }
}
