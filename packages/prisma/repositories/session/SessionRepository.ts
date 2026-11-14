import type { Prisma } from '@prisma/client'

import { BaseRepository, type TransactionClient } from '../base/BaseRepository'

export class SessionRepository extends BaseRepository {
  static findUnique<T extends Prisma.SessionFindUniqueArgs>(args: Prisma.SelectSubset<T, Prisma.SessionFindUniqueArgs>, tx?: TransactionClient) {
    return SessionRepository.getClient(tx).session.findUnique(args)
  }
}
