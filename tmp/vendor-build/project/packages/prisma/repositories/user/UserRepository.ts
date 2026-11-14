import type { Prisma } from '@prisma/client'

import { BaseRepository, type TransactionClient } from '../base/BaseRepository'

export class UserRepository extends BaseRepository {
  static findUnique<T extends Prisma.UserFindUniqueArgs>(args: Prisma.SelectSubset<T, Prisma.UserFindUniqueArgs>, tx?: TransactionClient) {
    return UserRepository.getClient(tx).user.findUnique(args)
  }
}
