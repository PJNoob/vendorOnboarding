import type { Prisma } from '@prisma/client'

import { BaseRepository, type TransactionClient } from '../base/BaseRepository'

export class BankProfileRepository extends BaseRepository {
  static create<T extends Prisma.BankProfileCreateArgs>(args: Prisma.SelectSubset<T, Prisma.BankProfileCreateArgs>, tx?: TransactionClient) {
    return BankProfileRepository.getClient(tx).bankProfile.create(args)
  }

  static upsert<T extends Prisma.BankProfileUpsertArgs>(args: Prisma.SelectSubset<T, Prisma.BankProfileUpsertArgs>, tx?: TransactionClient) {
    return BankProfileRepository.getClient(tx).bankProfile.upsert(args)
  }
}
