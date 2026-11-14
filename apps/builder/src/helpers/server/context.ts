import { randomUUID } from 'node:crypto'

import type { NextApiRequest } from 'next'
import { fromNodeHeaders } from 'better-auth/node'

import { demoAuthEnabled } from '@neo/env'

import { type Actor, Security } from './Security'
import { Authentication } from './auth'
import { isLoopbackConnection } from './DemoIdentity'
import { TeamService } from './TeamService'

export interface Context {
  actor?: Actor
  origin?: string
}

export class ContextFactory {
  static async create({ req }: { req: NextApiRequest }): Promise<Context> {
    const session = await Authentication.get().api.getSession({ headers: fromNodeHeaders(req.headers) })
    if (!session) return { origin: req.headers.origin }
    if (session.session.authChannel === Security.DEMO && (!demoAuthEnabled() || !isLoopbackConnection(req.socket.remoteAddress))) {
      return { origin: req.headers.origin }
    }
    const requested = req.headers['x-workspace-id']
    const actor = {
      channel: session.session.authChannel ?? 'UNKNOWN', createdAt: session.session.createdAt,
      email: session.user.email, id: session.user.id, requestId: randomUUID(),
      tenantId: typeof requested === 'string' ? requested : '',
      verified: session.user.emailVerified,
    }
    await TeamService.accept(actor)
    return { actor, origin: req.headers.origin }
  }
}
