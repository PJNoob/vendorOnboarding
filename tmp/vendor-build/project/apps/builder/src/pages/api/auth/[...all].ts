import { toNodeHandler } from 'better-auth/node'

import type { NextApiRequest, NextApiResponse } from 'next'

import { Authentication } from '@/helpers/server/auth'

export const config = { api: { bodyParser: false } }
class AuthRoute {
  static handle(request: NextApiRequest, response: NextApiResponse) {
    return toNodeHandler(Authentication.get())(request, response)
  }
}

export default AuthRoute.handle
