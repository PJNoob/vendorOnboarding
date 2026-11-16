import type { NextApiRequest, NextApiResponse } from 'next'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { TRPCError } from '@trpc/server'

import { env } from '@neo/env'

import { ContextFactory } from '@/helpers/server/context'
import { ReviewEvidence } from '@/helpers/server/ReviewEvidence'
import { createReviewMcp } from '@/helpers/server/ReviewMcp'
import { Security } from '@/helpers/server/Security'

export const config = { api: { bodyParser: { sizeLimit: '64kb' } } }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.headers.origin && req.headers.origin !== new URL(env.APP_URL).origin) {
    res.status(403).json({ error: 'Origin is not allowed' })
    return
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'Use POST for the stateless MCP endpoint' })
    return
  }

  try {
    const { actor } = await ContextFactory.create({ req, acceptEnrollment: false })
    if (!actor) {
      res.status(401).json({ error: 'An authenticated reviewer session is required' })
      return
    }
    await Security.buyer(actor, ReviewEvidence.ROLES)

    const server = createReviewMcp(actor)
    const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true, sessionIdGenerator: undefined })
    res.once('close', () => { void server.close().catch(() => undefined) })
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  } catch (error) {
    if (res.headersSent) {
      res.end()
      return
    }
    if (error instanceof TRPCError && error.code === 'FORBIDDEN') {
      res.status(403).json({ error: 'Reviewer or compliance workspace membership is required' })
      return
    }
    res.status(500).json({ error: 'Reviewer endpoint is unavailable' })
  }
}
