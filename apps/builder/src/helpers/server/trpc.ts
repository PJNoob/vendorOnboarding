import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'

import { env } from '@neo/env'
import type { BuyerRole } from '@neo/prisma'

import type { Context } from './context'
import { Security } from './Security'

export interface OpenApiMeta {
  openapi: { method: 'GET' | 'POST'; path: string; protect: true; summary: string; tags: string[] }
}

const trpc = initTRPC.context<Context>().meta<OpenApiMeta>().create({
  errorFormatter({ error, shape }) {
    if (error.code !== 'INTERNAL_SERVER_ERROR') {
      return { ...shape, data: { code: shape.data.code, httpStatus: shape.data.httpStatus } }
    }
    return { ...shape, data: { code: shape.data.code, httpStatus: shape.data.httpStatus }, message: 'request could not be completed' }
  },
  transformer: superjson,
})

export const mergeRouters = trpc.mergeRouters
export const router = trpc.router
export const authenticatedProcedure = trpc.procedure.use(({ ctx, next, type }) => {
  if (!ctx.actor) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'sign in to continue' })
  if (type === 'mutation' && ctx.origin !== new URL(env.APP_URL).origin) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'submit changes from the application origin' })
  }
  return next({ ctx: { actor: ctx.actor } })
})

export class ProcedurePolicy {
  static buyer(roles: readonly BuyerRole[]) {
    return authenticatedProcedure.use(async ({ ctx, next }) => {
      await Security.buyer(ctx.actor, roles)
      return next()
    })
  }
}

export const protectedProcedure = ProcedurePolicy.buyer
