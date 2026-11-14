import type { Prisma } from '@prisma/client'

import { BaseRepository, type TransactionClient } from '../base/BaseRepository'

export class PolicyVersionRepository extends BaseRepository {
  static findFirst<T extends Prisma.PolicyVersionFindFirstArgs>(args: Prisma.SelectSubset<T, Prisma.PolicyVersionFindFirstArgs>, tx?: TransactionClient) {
    return PolicyVersionRepository.getClient(tx).policyVersion.findFirst(args)
  }

  static upsert<T extends Prisma.PolicyVersionUpsertArgs>(args: Prisma.SelectSubset<T, Prisma.PolicyVersionUpsertArgs>, tx?: TransactionClient) {
    return PolicyVersionRepository.getClient(tx).policyVersion.upsert(args)
  }
}
