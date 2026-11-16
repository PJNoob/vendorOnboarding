import { createNextApiHandler } from '@trpc/server/adapters/next'

import { ContextFactory } from '@/helpers/server/context'
import { appRouter } from '@/helpers/server/routers/appRouter'

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } }
export default createNextApiHandler({
  allowBatching: false, createContext: ContextFactory.create, router: appRouter,
  onError({ error, path, type }) {
    console.error(JSON.stringify({ event: 'api.error', code: error.code, path, type }))
  },
})
