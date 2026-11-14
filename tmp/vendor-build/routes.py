from bootstrap import write
base='apps/builder/src/'
routes={
'access':[('revoke','revokeAccess','ack','InvitationService.revokeAccess','manager')],
'analytics':[('summary','analytics','analytics','Queries.analytics','reader')],
'audit':[('list','audit','audit','Queries.audit','reader')],
'cases':[('create','create','ack','InvitationService.create','manager'),('get','case','detail','Queries.detail','reader'),('list','list','list','Queries.list','reader'),('requestChanges','request','ack','ReviewService.request','requester')],
'compliance':[('resolve','resolveHold','ack','ReviewService.resolveHold','compliance')],
'documents':[('complete','document','ack','DraftService.complete','session'),('download','download','download','Queries.download','session'),('remove','document','ack','DraftService.remove','session'),('reserve','reserve','upload','DraftService.reserve','session')],
'identity':[('me','none','identity','Queries.identity','session'),('selectTenant','select','identity','Identity.select','session')],
'invitations':[('redeem','redeem','ack','InvitationService.redeem','session'),('reissue','reissue','ack','InvitationService.reissue','manager'),('revoke','invite','ack','InvitationService.revoke','manager')],
'reviews':[('decide','decide','ack','ReviewService.decide','reviewer'),('resolveIssue','resolve','ack','ReviewService.resolve','reviewer')],
'runs':[('get','case','run','Queries.run','session')],
'supplier':[('beginRevision','reissue','ack','DraftService.beginRevision','session'),('cases','none','list','Queries.supplierCases','session'),('get','case','detail','Queries.detail','session'),('saveDraft','save','ack','DraftService.save','session'),('submit','submit','ack','DraftService.submit','session')],
'team':[('enroll','enroll','ack','TeamService.enroll','admin'),('revoke','member','ack','TeamService.member','admin'),('setRole','role','ack','TeamService.member','admin')],
'work':[('retry','retry','ack','ReviewService.retry','admin')]}
reads={'analytics.summary','audit.list','cases.get','cases.list','identity.me','runs.get','supplier.cases','supplier.get'}
roles={'reader':'Values.BUYER_ROLES','manager':"['ADMIN', 'BUYER']", 'admin':"['ADMIN']", 'compliance':"['COMPLIANCE']", 'requester':"['BUYER', 'REVIEWER']", 'reviewer':"['REVIEWER']"}
manifest=[]
for feature,procs in sorted(routes.items()):
 folder=f'{base}features/{feature}/api/'
 for name,ins,out,method,role in procs:
  query=f'{feature}.{name}' in reads
  owner=method.split('.')[0]
  route=f'/v1/{feature}/{name}'
  builder='authenticatedProcedure' if role=='session' else f'protectedProcedure({roles[role]})'
  trpc='authenticatedProcedure' if role=='session' else 'protectedProcedure'
  args='ctx.actor' if ins=='none' else 'ctx.actor, input.caseId' if ins=='case' else 'ctx.actor, input'
  write(folder+name+'.ts',f"""import {{ inputs, outputs{', Values' if role=='reader' else ''} }} from '@neo/schemas'

import {{ {owner} }} from '@/helpers/server/{owner}'
import {{ {trpc} }} from '@/helpers/server/trpc'

export const {name} = {builder}
  .meta({{ openapi: {{ method: '{'GET' if query else 'POST'}', path: '{route}', protect: true, summary: '{feature} {name}', tags: ['{feature}'] }} }})
  .input(inputs.{ins})
  .output(outputs.{out})
  .{'query' if query else 'mutation'}(({{ ctx{', input' if ins!='none' else ''} }}) => {method}({args}))
""")
  manifest.append((feature,name,ins,out,route,query))
 write(folder+'router.ts',"import { router } from '@/helpers/server/trpc'\n\n"+''.join(f"import {{ {name} }} from './{name}'\n" for name,*_ in procs)+f"\nexport const {feature}Router = router({{ "+', '.join(x[0] for x in procs)+' })')
public=[x for x in sorted(routes) if x not in ('documents','identity','invitations','supplier')]
private=[x for x in sorted(routes) if x not in public]
for scope,names in [('internal',private),('public',public)]:
 write(base+f'helpers/server/routers/{scope}Router.ts',''.join(f"import {{ {f}Router }} from '@/features/{f}/api/router'\n" for f in names)+f"import {{ router }} from '../trpc'\n\nexport const {scope}Router = router({{ "+', '.join(f'{f}: {f}Router' for f in names)+' })')
write(base+'helpers/server/routers/appRouter.ts',"""import { router } from '../trpc'
import { internalRouter } from './internalRouter'
import { publicRouter } from './publicRouter'

export const appRouter = router({ ...internalRouter._def.record, ...publicRouter._def.record })
export type AppRouter = typeof appRouter
""")
write(base+'helpers/server/Identity.ts',"""import type { Input } from '@neo/schemas'

import { Queries } from './Queries'
import { type Actor, Security } from './Security'

export class Identity {
  static async select(actor: Actor, input: Input<'select'>) {
    const next = { ...actor, tenantId: input.tenantId }
    await Security.buyer(next, Queries.READERS)
    return Queries.identity(next)
  }
}
""")
write(base+'helpers/server/OpenApi.ts',"""import { TRPCError } from '@trpc/server'
import { getHTTPStatusCodeFromError } from '@trpc/server/http'
import type { NextApiRequest, NextApiResponse } from 'next'
import { createDocument } from 'zod-openapi'

import { inputs, outputs } from '@neo/schemas'

import { ContextFactory } from './context'
import { publicRouter } from './routers/publicRouter'

type Caller = ReturnType<typeof publicRouter.createCaller>

export class OpenApi {
  static readonly ROUTES = {
"""+''.join(f"    '{path}': {{ call: (caller: Caller, body: unknown) => caller.{feature}.{name}(inputs.{ins}.parse(body)), input: inputs.{ins}, method: '{'get' if query else 'post'}', output: outputs.{out} }},\n" for feature,name,ins,out,path,query in sorted(manifest) if feature in public)+"""  } as const

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
""")
write(base+'pages/api/[...trpc].ts',"""import { OpenApi } from '@/helpers/server/OpenApi'

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } }
export default OpenApi.handle
""")
