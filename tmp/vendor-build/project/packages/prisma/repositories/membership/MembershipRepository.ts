import type { Prisma } from '@prisma/client'

import { BaseRepository, type TransactionClient } from '../base/BaseRepository'

export class MembershipRepository extends BaseRepository {
  static count<T extends Prisma.MembershipCountArgs>(args: Prisma.SelectSubset<T, Prisma.MembershipCountArgs>, tx?: TransactionClient) {
    return MembershipRepository.getClient(tx).membership.count(args)
  }

  static findFirst<T extends Prisma.MembershipFindFirstArgs>(args: Prisma.SelectSubset<T, Prisma.MembershipFindFirstArgs>, tx?: TransactionClient) {
    return MembershipRepository.getClient(tx).membership.findFirst(args)
  }

  static findMany<T extends Prisma.MembershipFindManyArgs>(args: Prisma.SelectSubset<T, Prisma.MembershipFindManyArgs>, tx?: TransactionClient) {
    return MembershipRepository.getClient(tx).membership.findMany(args)
  }

  static updateMany<T extends Prisma.MembershipUpdateManyArgs>(args: Prisma.SelectSubset<T, Prisma.MembershipUpdateManyArgs>, tx?: TransactionClient) {
    return MembershipRepository.getClient(tx).membership.updateMany(args)
  }

  static upsert<T extends Prisma.MembershipUpsertArgs>(args: Prisma.SelectSubset<T, Prisma.MembershipUpsertArgs>, tx?: TransactionClient) {
    return MembershipRepository.getClient(tx).membership.upsert(args)
  }
}
