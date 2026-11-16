import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { TRPCError } from '@trpc/server'

import { inputs } from '@neo/schemas'

import { ReviewEvidence } from './ReviewEvidence'
import type { Actor } from './Security'

async function readEvidence(read: () => Promise<Record<string, unknown>>) {
  try {
    const result = await read()
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], structuredContent: result }
  } catch (error) {
    const message = error instanceof TRPCError && ['FORBIDDEN', 'NOT_FOUND'].includes(error.code)
      ? 'Case evidence is unavailable for this workspace or account.'
      : 'Case evidence could not be retrieved.'
    return { content: [{ type: 'text' as const, text: message }], isError: true }
  }
}

export function createReviewMcp(actor: Actor) {
  const server = new McpServer({ name: 'vendor-onboarding-review', version: '1.0.0' })
  const annotations = { readOnlyHint: true, openWorldHint: false }

  server.registerTool('get_certificate_scope_evidence', {
    annotations,
    description: 'Read advisory certificate and annex citations for the current submission. Citations require human review.',
    inputSchema: inputs.case.shape,
  }, ({ caseId }) => readEvidence(() => ReviewEvidence.certificate(actor, caseId)))

  server.registerTool('get_screening_evidence', {
    annotations,
    description: 'Read the current ownership screening check and recorded sanctions dataset and match references. Does not run a search or change a decision.',
    inputSchema: inputs.case.shape,
  }, ({ caseId }) => readEvidence(() => ReviewEvidence.screening(actor, caseId)))

  return server
}
