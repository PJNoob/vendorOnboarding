import type { Prisma } from '@prisma/client'

import { BaseRepository, type TransactionClient } from '../base/BaseRepository'

export class OwnershipEntityRepository extends BaseRepository {
  static createMany<T extends Prisma.OwnershipEntityCreateManyArgs>(args: Prisma.SelectSubset<T, Prisma.OwnershipEntityCreateManyArgs>, tx?: TransactionClient) {
    return OwnershipEntityRepository.getClient(tx).ownershipEntity.createMany(args)
  }

  static deleteMany<T extends Prisma.OwnershipEntityDeleteManyArgs>(args: Prisma.SelectSubset<T, Prisma.OwnershipEntityDeleteManyArgs>, tx?: TransactionClient) {
    return OwnershipEntityRepository.getClient(tx).ownershipEntity.deleteMany(args)
  }
}
