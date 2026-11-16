import { z } from 'zod'

import { env } from '@neo/env'
import type { Country } from '@neo/schemas'

const page = z.object({ data: z.object({
  objects: z.array(z.object({ codes: z.object({ alpha_2: z.string() }), names: z.object({ common: z.string().min(1) }) })),
  meta: z.object({ more: z.boolean() }),
}) })

export class CountryProvider {
  static readonly FALLBACK: Country[] = [
    { code: 'AE', name: 'United Arab Emirates' }, { code: 'US', name: 'United States' },
  ]
  private cached?: Country[]
  private expiresAt = 0
  private pending?: Promise<Country[]>

  constructor(private readonly key = env.REST_COUNTRIES_API_KEY, private readonly request: typeof fetch = fetch) {}

  async list(): Promise<Country[]> {
    if (!this.key) return CountryProvider.FALLBACK
    if (this.cached && Date.now() < this.expiresAt) return this.cached
    if (this.pending) return this.pending
    this.pending = this.load().then((countries) => {
      this.cached = countries
      this.expiresAt = Date.now() + 6 * 60 * 60 * 1000
      return countries
    }).catch(() => {
      // Keep forms available during provider outages and avoid retrying on every page load.
      this.expiresAt = Date.now() + 60_000
      this.cached ??= CountryProvider.FALLBACK
      return this.cached
    }).finally(() => { this.pending = undefined })
    return this.pending
  }

  private async load(): Promise<Country[]> {
    const countries = new Map<string, Country>()
    let offset = 0
    for (let count = 0; count < 10; count++) {
      const url = new URL('https://api.restcountries.com/countries/v5')
      url.searchParams.set('response_fields', 'names.common,codes.alpha_2')
      url.searchParams.set('limit', '100')
      url.searchParams.set('offset', String(offset))
      const response = await this.request(url, {
        headers: { Authorization: `Bearer ${this.key}` }, signal: AbortSignal.timeout(5_000),
      })
      if (!response.ok) throw new Error('Country directory is unavailable')
      const { data } = page.parse(await response.json())
      for (const country of data.objects) {
        // The directory also includes territories without an ISO alpha-2 code.
        if (/^[A-Z]{2}$/.test(country.codes.alpha_2)) countries.set(country.codes.alpha_2, { code: country.codes.alpha_2, name: country.names.common })
      }
      if (!data.meta.more) {
        if (!countries.size) throw new Error('Country directory is empty')
        return [...countries.values()].sort((a, b) => a.name.localeCompare(b.name, 'en'))
      }
      if (!data.objects.length) throw new Error('Country directory pagination is invalid')
      offset += data.objects.length
    }
    throw new Error('Country directory exceeded the page limit')
  }
}

export const countryProvider = new CountryProvider()
