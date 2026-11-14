import type { Prisma } from '@prisma/client'

import { BaseRepository, type TransactionClient } from '../base/BaseRepository'

export class TenantRepository extends BaseRepository {
  static upsert<T extends Prisma.TenantUpsertArgs>(args: Prisma.SelectSubset<T, Prisma.TenantUpsertArgs>, tx?: TransactionClient) {
    return TenantRepository.getClient(tx).tenant.upsert(args)
  }
}
