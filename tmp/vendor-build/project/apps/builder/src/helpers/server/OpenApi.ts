import { TRPCError } from '@trpc/server'
import { getHTTPStatusCodeFromError } from '@trpc/server/http'
import type { NextApiRequest, NextApiResponse } from 'next'
import { createDocument } from 'zod-openapi'

import { inputs, outputs } from '@neo/schemas'

import { ContextFactory } from './context'
import { publicRouter } from './routers/publicRouter'

type Caller = ReturnType<typeof publicRouter.createCaller>

export class OpenApi {
  static readonly ROUTES = {
    '/v1/access/revoke': { call: (caller: Caller, body: unknown) => caller.access.revoke(inputs.revokeAccess.parse(body)), input: inputs.revokeAccess, method: 'post', output: outputs.ack },
    '/v1/analytics/summary': { call: (caller: Caller, body: unknown) => caller.analytics.summary(inputs.analytics.parse(body)), input: inputs.analytics, method: 'get', output: outputs.analytics },
    '/v1/audit/list': { call: (caller: Caller, body: unknown) => caller.audit.list(inputs.audit.parse(body)), input: inputs.audit, method: 'get', output: outputs.audit },
    '/v1/cases/create': { call: (caller: Caller, body: unknown) => caller.cases.create(inputs.create.parse(body)), input: inputs.create, method: 'post', output: outputs.ack },
    '/v1/cases/get': { call: (caller: Caller, body: unknown) => caller.cases.get(inputs.case.parse(body)), input: inputs.case, method: 'get', output: outputs.detail },
    '/v1/cases/list': { call: (caller: Caller, body: unknown) => caller.cases.list(inputs.list.parse(body)), input: inputs.list, method: 'get', output: outputs.list },
    '/v1/cases/requestChanges': { call: (caller: Caller, body: unknown) => caller.cases.requestChanges(inputs.request.parse(body)), input: inputs.request, method: 'post', output: outputs.ack },
    '/v1/compliance/resolve': { call: (caller: Caller, body: unknown) => caller.compliance.resolve(inputs.resolveHold.parse(body)), input: inputs.resolveHold, method: 'post', output: outputs.ack },
    '/v1/reviews/decide': { call: (caller: Caller, body: unknown) => caller.reviews.decide(inputs.decide.parse(body)), input: inputs.decide, method: 'post', output: outputs.ack },
    '/v1/reviews/resolveIssue': { call: (caller: Caller, body: unknown) => caller.reviews.resolveIssue(inputs.resolve.parse(body)), input: inputs.resolve, method: 'post', output: outputs.ack },
    '/v1/runs/get': { call: (caller: Caller, body: unknown) => caller.runs.get(inputs.case.parse(body)), input: inputs.case, method: 'get', output: outputs.run },
    '/v1/team/enroll': { call: (caller: Caller, body: unknown) => caller.team.enroll(inputs.enroll.parse(body)), input: inputs.enroll, method: 'post', output: outputs.ack },
    '/v1/team/revoke': { call: (caller: Caller, body: unknown) => caller.team.revoke(inputs.member.parse(body)), input: inputs.member, method: 'post', output: outputs.ack },
    '/v1/team/setRole': { call: (caller: Caller, body: unknown) => caller.team.setRole(inputs.role.parse(body)), input: inputs.role, method: 'post', output: outputs.ack },
    '/v1/work/retry': { call: (caller: Caller, body: unknown) => caller.work.retry(inputs.retry.parse(body)), input: inputs.retry, method: 'post', output: outputs.ack },
  } as const

  static document() {
    return createDocument({
      components: { securitySchemes: { session: { in: 'cookie', name: 'better-auth.session_token', type: 'apiKey' } } },
      info: { title: 'Vendor Onboarding', version: '1.0.0' },
      openapi: '3.1.0',
      paths: Object.fromEntries(Object.entries(OpenApi.ROUTES).map(([path, entry]) => [path, {
        [entry.method]: {
          ...(entry.method === 'get'
            ? { requestParams: { query: entry.input } }
            : { requestBody: { content: { 'application/json': { schema: entry.input } } } }),
          responses: { '200': { content: { 'application/json': { schema: entry.output } }, description: 'Success' } },
          security: [{ session: [] }],
          summary: path.split('/').slice(-2).join(' '),
        },
      }])),
      servers: [{ url: '/api' }],
    })
  }

  static async handle(req: NextApiRequest, res: NextApiResponse) {
    const segments = req.query.trpc
    const path = Array.isArray(segments) ? `/${segments.join('/')}` : ''
    if (path === '/openapi.json' && req.method === 'GET') return res.json(OpenApi.document())
    const route = OpenApi.ROUTES[path as keyof typeof OpenApi.ROUTES]
    if (!route) return res.status(404).json({ code: 'NOT_FOUND' })
    if (req.method?.toLowerCase() !== route.method) return res.status(405).json({ code: 'METHOD_NOT_ALLOWED' })
    const query = Object.fromEntries(Object.entries(req.query).filter(([key]) => key !== 'trpc').map(([key, value]) => [key, key === 'limit' ? Number(value) : value]))
    const context = await ContextFactory.create({ req, res })
    const parsed = route.input.safeParse(route.method === 'get' ? query : req.body)
    if (!parsed.success) return res.status(400).json({ code: 'BAD_REQUEST' })
    const caller = publicRouter.createCaller(context)
    return route.call(caller, parsed.data).then(
      (data) => res.json(data),
      (error: unknown) => {
        if (error instanceof TRPCError && error.code !== 'INTERNAL_SERVER_ERROR') {
          return res.status(getHTTPStatusCodeFromError(error)).json({ code: error.code, message: error.message })
        }
        return res.status(500).json({ code: 'INTERNAL_SERVER_ERROR' })
      },
    )
  }
}
