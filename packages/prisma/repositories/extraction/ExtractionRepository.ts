import type { Prisma } from '@prisma/client'

import { BaseRepository, type TransactionClient } from '../base/BaseRepository'

export class ExtractionRepository extends BaseRepository {
  static create<T extends Prisma.ExtractionCreateArgs>(args: Prisma.SelectSubset<T, Prisma.ExtractionCreateArgs>, tx?: TransactionClient) {
    return ExtractionRepository.getClient(tx).extraction.create(args)
  }

  static findFirst<T extends Prisma.ExtractionFindFirstArgs>(args: Prisma.SelectSubset<T, Prisma.ExtractionFindFirstArgs>, tx?: TransactionClient) {
    return ExtractionRepository.getClient(tx).extraction.findFirst(args)
  }
}
