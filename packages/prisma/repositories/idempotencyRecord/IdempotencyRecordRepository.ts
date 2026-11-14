import type { Prisma } from '@prisma/client'

import { BaseRepository, type TransactionClient } from '../base/BaseRepository'

export class IdempotencyRecordRepository extends BaseRepository {
  static create<T extends Prisma.IdempotencyRecordCreateArgs>(args: Prisma.SelectSubset<T, Prisma.IdempotencyRecordCreateArgs>, tx?: TransactionClient) {
    return IdempotencyRecordRepository.getClient(tx).idempotencyRecord.create(args)
  }

  static deleteMany<T extends Prisma.IdempotencyRecordDeleteManyArgs>(args: Prisma.SelectSubset<T, Prisma.IdempotencyRecordDeleteManyArgs>, tx?: TransactionClient) {
    return IdempotencyRecordRepository.getClient(tx).idempotencyRecord.deleteMany(args)
  }

  static findUnique<T extends Prisma.IdempotencyRecordFindUniqueArgs>(args: Prisma.SelectSubset<T, Prisma.IdempotencyRecordFindUniqueArgs>, tx?: TransactionClient) {
    return IdempotencyRecordRepository.getClient(tx).idempotencyRecord.findUnique(args)
  }
}
