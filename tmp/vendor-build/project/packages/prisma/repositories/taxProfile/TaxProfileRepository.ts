import type { Prisma } from '@prisma/client'

import { BaseRepository, type TransactionClient } from '../base/BaseRepository'

export class TaxProfileRepository extends BaseRepository {
  static create<T extends Prisma.TaxProfileCreateArgs>(args: Prisma.SelectSubset<T, Prisma.TaxProfileCreateArgs>, tx?: TransactionClient) {
    return TaxProfileRepository.getClient(tx).taxProfile.create(args)
  }

  static upsert<T extends Prisma.TaxProfileUpsertArgs>(args: Prisma.SelectSubset<T, Prisma.TaxProfileUpsertArgs>, tx?: TransactionClient) {
    return TaxProfileRepository.getClient(tx).taxProfile.upsert(args)
  }
}
