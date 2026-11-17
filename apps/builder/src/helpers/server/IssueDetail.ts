import { z } from 'zod'

const names = (items: string[]) => [...new Set(items)].join(', ')

const screening = z.object({
  blocked: z.array(z.string()).default([]),
  matches: z.array(z.object({ key: z.string(), match: z.enum(['BLOCKED', 'POSSIBLE']) })).default([]),
})
const owners = z.object({ owners: z.array(z.object({ country: z.string(), name: z.string() })) })
const adverse = z.object({ hits: z.array(z.object({ entity: z.string() })) })

/**
 * Reviewer-only root cause for a hold issue, built from the stored check trace.
 * Holds carry no supplier message (so the supplier never sees them); this names the entity instead.
 */
export function issueDetail(code: string, trace: unknown, entities: { entityKey: string; legalName: string }[]) {
  const label = (key: string) => entities.find((item) => item.entityKey === key)?.legalName ?? key
  if (code === 'OWNERSHIP_BLOCKED_CHAIN' || code === 'OWNERSHIP_POSSIBLE_MATCH') {
    const parsed = screening.safeParse(trace)
    if (!parsed.success) return undefined
    const direct = parsed.data.matches.filter((item) => item.match === (code === 'OWNERSHIP_BLOCKED_CHAIN' ? 'BLOCKED' : 'POSSIBLE'))
      .map((item) => label(item.key))
    if (code === 'OWNERSHIP_POSSIBLE_MATCH') {
      return direct.length ? `Possible sanctions match: ${names(direct)}.` : undefined
    }
    const listed = new Set(parsed.data.matches.filter((item) => item.match === 'BLOCKED').map((item) => item.key))
    const inherited = parsed.data.blocked.filter((key) => !listed.has(key)).map(label)
    return direct.length
      ? `Sanctioned entity: ${names(direct)}.${inherited.length ? ` Blocked through ownership: ${names(inherited)}.` : ''}`
      : undefined
  }
  if (code === 'OWNER_COUNTRY_BANNED') {
    const parsed = owners.safeParse(trace)
    return parsed.success && parsed.data.owners.length
      ? `Owner in a banned country: ${parsed.data.owners.map((item) => `${item.name} (${item.country})`).join(', ')}.`
      : undefined
  }
  if (code === 'ADVERSE_MEDIA_MATCH') {
    const parsed = adverse.safeParse(trace)
    return parsed.success && parsed.data.hits.length
      ? `Web search found ban or sanction references for: ${names(parsed.data.hits.map((item) => item.entity))}.`
      : undefined
  }
  return undefined
}
