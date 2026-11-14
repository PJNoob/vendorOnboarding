import type { Prisma } from '@prisma/client'

import { prisma } from '../../client'

export type TransactionClient = Prisma.TransactionClient

export abstract class BaseRepository {
  protected static getClient(transaction?: TransactionClient) {
    return transaction ?? prisma
  }

  static async lockTenant(tenantId: string, transaction: TransactionClient) {
    await transaction.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${tenantId} FOR UPDATE`
  }

  static ping() {
    return prisma.$queryRaw`SELECT 1`
  }

  static runInTransaction<T>(operation: (transaction: TransactionClient) => Promise<T>) {
    return prisma.$transaction(operation)
  }
}
