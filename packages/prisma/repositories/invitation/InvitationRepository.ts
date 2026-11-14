import type { Prisma } from '@prisma/client'

import { BaseRepository, type TransactionClient } from '../base/BaseRepository'

export class InvitationRepository extends BaseRepository {
  static create<T extends Prisma.InvitationCreateArgs>(args: Prisma.SelectSubset<T, Prisma.InvitationCreateArgs>, tx?: TransactionClient) {
    return InvitationRepository.getClient(tx).invitation.create(args)
  }

  static findFirst<T extends Prisma.InvitationFindFirstArgs>(args: Prisma.SelectSubset<T, Prisma.InvitationFindFirstArgs>, tx?: TransactionClient) {
    return InvitationRepository.getClient(tx).invitation.findFirst(args)
  }

  static findUnique<T extends Prisma.InvitationFindUniqueArgs>(args: Prisma.SelectSubset<T, Prisma.InvitationFindUniqueArgs>, tx?: TransactionClient) {
    return InvitationRepository.getClient(tx).invitation.findUnique(args)
  }

  static updateMany<T extends Prisma.InvitationUpdateManyArgs>(args: Prisma.SelectSubset<T, Prisma.InvitationUpdateManyArgs>, tx?: TransactionClient) {
    return InvitationRepository.getClient(tx).invitation.updateMany(args)
  }
}
