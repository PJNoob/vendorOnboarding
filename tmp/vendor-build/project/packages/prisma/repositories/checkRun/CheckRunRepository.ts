import type { Prisma } from '@prisma/client'

import { BaseRepository, type TransactionClient } from '../base/BaseRepository'

export class CheckRunRepository extends BaseRepository {
  static create<T extends Prisma.CheckRunCreateArgs>(args: Prisma.SelectSubset<T, Prisma.CheckRunCreateArgs>, tx?: TransactionClient) {
    return CheckRunRepository.getClient(tx).checkRun.create(args)
  }

  static findFirst<T extends Prisma.CheckRunFindFirstArgs>(args: Prisma.SelectSubset<T, Prisma.CheckRunFindFirstArgs>, tx?: TransactionClient) {
    return CheckRunRepository.getClient(tx).checkRun.findFirst(args)
  }
}
