import type { Prisma } from '@prisma/client'

import { BaseRepository, type TransactionClient } from '../base/BaseRepository'

export class DecisionRepository extends BaseRepository {
  static create<T extends Prisma.DecisionCreateArgs>(args: Prisma.SelectSubset<T, Prisma.DecisionCreateArgs>, tx?: TransactionClient) {
    return DecisionRepository.getClient(tx).decision.create(args)
  }

  static findMany<T extends Prisma.DecisionFindManyArgs>(args: Prisma.SelectSubset<T, Prisma.DecisionFindManyArgs>, tx?: TransactionClient) {
    return DecisionRepository.getClient(tx).decision.findMany(args)
  }
}
