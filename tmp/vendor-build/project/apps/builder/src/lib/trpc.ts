import { createTRPCClient, httpLink } from '@trpc/client'
import superjson from 'superjson'

import type { AppRouter } from '@/helpers/server/routers/appRouter'

export class ApiClient {
  static create(tenantId = '') {
    return createTRPCClient<AppRouter>({
      links: [httpLink({
        headers: () => tenantId ? { 'x-workspace-id': tenantId } : {},
        transformer: superjson,
        url: '/api/trpc',
      })],
    })
  }
}
