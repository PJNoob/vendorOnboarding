import { PrismaClient } from '@prisma/client'

import { env } from '@neo/env'

export class DatabaseClient {
  static create() {
    if (env.DATABASE_URL === undefined) return new PrismaClient()
    const url = new URL(env.DATABASE_URL)
    url.searchParams.set('connection_limit', String(env.DATABASE_POOL_SIZE))
    return new PrismaClient({ datasourceUrl: url.toString(), log: [] })
  }
}

export const prisma = DatabaseClient.create()
