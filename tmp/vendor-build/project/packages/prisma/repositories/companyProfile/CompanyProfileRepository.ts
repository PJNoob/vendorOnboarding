import type { Prisma } from '@prisma/client'

import { BaseRepository, type TransactionClient } from '../base/BaseRepository'

export class CompanyProfileRepository extends BaseRepository {
  static create<T extends Prisma.CompanyProfileCreateArgs>(args: Prisma.SelectSubset<T, Prisma.CompanyProfileCreateArgs>, tx?: TransactionClient) {
    return CompanyProfileRepository.getClient(tx).companyProfile.create(args)
  }

  static upsert<T extends Prisma.CompanyProfileUpsertArgs>(args: Prisma.SelectSubset<T, Prisma.CompanyProfileUpsertArgs>, tx?: TransactionClient) {
    return CompanyProfileRepository.getClient(tx).companyProfile.upsert(args)
  }
}
