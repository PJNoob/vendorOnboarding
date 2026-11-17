import { z } from 'zod'

import { env } from '@neo/env'

const response = z.object({
  organic_results: z.array(z.object({
    link: z.string().optional(), snippet: z.string().optional(), title: z.string().optional(),
  })).default([]),
})

export type SerpHit = {
  link: string
  official: boolean
  snippet: string
  title: string
}

export type SerpSubject = {
  country: string
  key: string
  name: string
}

export class SerpScreening {
  static readonly CACHE_MS = 24 * 60 * 60 * 1000
  static readonly ENDPOINT = 'https://www.searchapi.io/api/v1/search'
  static readonly MAX_HITS = 5
  static readonly TIMEOUT_MS = 10_000
  // Words that indicate a sanction, ban, debarment or similar exclusion in a result.
  static readonly BAN_TERMS = /\b(sanction\w*|banned|debar\w*|blacklist\w*|blocklist\w*|barred|prohibit\w*|embargo\w*|entity\s+list|sdn|ineligible|exclu(?:ded|sion)|disqualif\w*)\b/i
  static readonly OFFICIAL = /(^|\.)(gov|mil|int)$|\.gov\.[a-z]{2}$|(^|\.)(worldbank\.org|un\.org|europa\.eu|sam\.gov|treasury\.gov|interpol\.int|afdb\.org|adb\.org)$/i

  private readonly cache = new Map<string, { expiresAt: number; hits: SerpHit[] }>()

  constructor(private readonly key = env.SERP_API_KEY, private readonly request: typeof fetch = fetch) {}

  get configured() {
    return Boolean(this.key)
  }

  static compact(value: string) {
    return value.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  }

  static query({ country, name }: SerpSubject) {
    return `"${name.replace(/"/g, '')}" ${country} (sanctioned OR banned OR debarred OR blacklisted OR "barred from" OR ineligible OR "entity list")`
  }

  /** Keeps only results that name the subject and describe a ban, so unrelated pages never raise a flag. */
  static relevant(name: string, results: z.infer<typeof response>['organic_results']): SerpHit[] {
    const target = SerpScreening.compact(name)
    if (!target) return []
    return results.flatMap(({ link = '', snippet = '', title = '' }) => {
      const text = `${title} ${snippet}`
      if (!SerpScreening.compact(text).includes(target) || !SerpScreening.BAN_TERMS.test(text)) return []
      let official = false
      try { official = SerpScreening.OFFICIAL.test(new URL(link).hostname) } catch { /* A malformed link is still shown to the reviewer. */ }
      return [{ link, official, snippet, title }]
    }).sort((a, b) => Number(b.official) - Number(a.official)).slice(0, SerpScreening.MAX_HITS)
  }

  /** Searches the web for bans against one subject. Throws when the provider cannot answer. */
  async search(subject: SerpSubject): Promise<SerpHit[]> {
    if (!this.key) throw new Error('Web screening is not configured')
    const cacheKey = `${SerpScreening.compact(subject.name)}:${subject.country}`
    const cached = this.cache.get(cacheKey)
    if (cached && Date.now() < cached.expiresAt) return cached.hits
    const url = new URL(SerpScreening.ENDPOINT)
    url.searchParams.set('engine', 'google')
    url.searchParams.set('num', '10')
    url.searchParams.set('q', SerpScreening.query(subject))
    // The key is sent in a header so it never appears in URLs, logs or traces.
    const result = await this.request(url, {
      headers: { Authorization: `Bearer ${this.key}` }, signal: AbortSignal.timeout(SerpScreening.TIMEOUT_MS),
    })
    if (!result.ok) throw new Error(`Web screening provider returned ${result.status}`)
    const hits = SerpScreening.relevant(subject.name, response.parse(await result.json()).organic_results)
    this.cache.set(cacheKey, { expiresAt: Date.now() + SerpScreening.CACHE_MS, hits })
    return hits
  }
}

export const serpScreening = new SerpScreening()
