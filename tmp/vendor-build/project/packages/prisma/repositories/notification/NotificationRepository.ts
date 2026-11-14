import type { Prisma } from '@prisma/client'

import { BaseRepository, type TransactionClient } from '../base/BaseRepository'

export class NotificationRepository extends BaseRepository {
  static create<T extends Prisma.NotificationCreateArgs>(args: Prisma.SelectSubset<T, Prisma.NotificationCreateArgs>, tx?: TransactionClient) {
    return NotificationRepository.getClient(tx).notification.create(args)
  }

  static findFirst<T extends Prisma.NotificationFindFirstArgs>(args: Prisma.SelectSubset<T, Prisma.NotificationFindFirstArgs>, tx?: TransactionClient) {
    return NotificationRepository.getClient(tx).notification.findFirst(args)
  }

  static updateMany<T extends Prisma.NotificationUpdateManyArgs>(args: Prisma.SelectSubset<T, Prisma.NotificationUpdateManyArgs>, tx?: TransactionClient) {
    return NotificationRepository.getClient(tx).notification.updateMany(args)
  }
}
