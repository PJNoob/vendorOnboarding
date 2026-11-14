import type { Prisma } from '@prisma/client'

import { BaseRepository, type TransactionClient } from '../base/BaseRepository'

export class CheckEvidenceRepository extends BaseRepository {
  static createMany<T extends Prisma.CheckEvidenceCreateManyArgs>(args: Prisma.SelectSubset<T, Prisma.CheckEvidenceCreateManyArgs>, tx?: TransactionClient) {
    return CheckEvidenceRepository.getClient(tx).checkEvidence.createMany(args)
  }
}
