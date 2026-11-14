import type { Prisma } from '@prisma/client'

import { BaseRepository, type TransactionClient } from '../base/BaseRepository'

export class CaseAccessRepository extends BaseRepository {
  static findFirst<T extends Prisma.CaseAccessFindFirstArgs>(args: Prisma.SelectSubset<T, Prisma.CaseAccessFindFirstArgs>, tx?: TransactionClient) {
    return CaseAccessRepository.getClient(tx).caseAccess.findFirst(args)
  }

  static findMany<T extends Prisma.CaseAccessFindManyArgs>(args: Prisma.SelectSubset<T, Prisma.CaseAccessFindManyArgs>, tx?: TransactionClient) {
    return CaseAccessRepository.getClient(tx).caseAccess.findMany(args)
  }

  static updateMany<T extends Prisma.CaseAccessUpdateManyArgs>(args: Prisma.SelectSubset<T, Prisma.CaseAccessUpdateManyArgs>, tx?: TransactionClient) {
    return CaseAccessRepository.getClient(tx).caseAccess.updateMany(args)
  }

  static upsert<T extends Prisma.CaseAccessUpsertArgs>(args: Prisma.SelectSubset<T, Prisma.CaseAccessUpsertArgs>, tx?: TransactionClient) {
    return CaseAccessRepository.getClient(tx).caseAccess.upsert(args)
  }
}
