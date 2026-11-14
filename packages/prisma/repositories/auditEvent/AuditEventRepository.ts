import type { Prisma } from '@prisma/client'

import { BaseRepository, type TransactionClient } from '../base/BaseRepository'

export class AuditEventRepository extends BaseRepository {
  static create<T extends Prisma.AuditEventCreateArgs>(args: Prisma.SelectSubset<T, Prisma.AuditEventCreateArgs>, tx?: TransactionClient) {
    return AuditEventRepository.getClient(tx).auditEvent.create(args)
  }

  static findMany<T extends Prisma.AuditEventFindManyArgs>(args: Prisma.SelectSubset<T, Prisma.AuditEventFindManyArgs>, tx?: TransactionClient) {
    return AuditEventRepository.getClient(tx).auditEvent.findMany(args)
  }
}
