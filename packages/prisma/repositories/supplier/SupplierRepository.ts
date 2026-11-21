import type { Prisma } from '@prisma/client'

import { BaseRepository, type TransactionClient } from '../base/BaseRepository'

export class SupplierRepository extends BaseRepository {
  static create<T extends Prisma.SupplierCreateArgs>(args: Prisma.SelectSubset<T, Prisma.SupplierCreateArgs>, tx?: TransactionClient) {
    return SupplierRepository.getClient(tx).supplier.create(args)
  }

  static deleteMany<T extends Prisma.SupplierDeleteManyArgs>(args: Prisma.SelectSubset<T, Prisma.SupplierDeleteManyArgs>, tx?: TransactionClient) {
    return SupplierRepository.getClient(tx).supplier.deleteMany(args)
  }

  static findFirst<T extends Prisma.SupplierFindFirstArgs>(args: Prisma.SelectSubset<T, Prisma.SupplierFindFirstArgs>, tx?: TransactionClient) {
    return SupplierRepository.getClient(tx).supplier.findFirst(args)
  }
}
