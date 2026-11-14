import type { Prisma } from '@prisma/client'

import { BaseRepository, type TransactionClient } from '../base/BaseRepository'

export class OwnershipEdgeRepository extends BaseRepository {
  static count<T extends Prisma.OwnershipEdgeCountArgs>(args: Prisma.SelectSubset<T, Prisma.OwnershipEdgeCountArgs>, tx?: TransactionClient) {
    return OwnershipEdgeRepository.getClient(tx).ownershipEdge.count(args)
  }

  static createMany<T extends Prisma.OwnershipEdgeCreateManyArgs>(args: Prisma.SelectSubset<T, Prisma.OwnershipEdgeCreateManyArgs>, tx?: TransactionClient) {
    return OwnershipEdgeRepository.getClient(tx).ownershipEdge.createMany(args)
  }

  static deleteMany<T extends Prisma.OwnershipEdgeDeleteManyArgs>(args: Prisma.SelectSubset<T, Prisma.OwnershipEdgeDeleteManyArgs>, tx?: TransactionClient) {
    return OwnershipEdgeRepository.getClient(tx).ownershipEdge.deleteMany(args)
  }
}
