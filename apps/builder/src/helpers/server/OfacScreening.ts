import { createHash } from 'node:crypto'

import { SaxesParser } from 'saxes'

const SOURCE = 'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML'
const NAMESPACE = 'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/XML'
const REFRESH_MS = 60 * 60 * 1000
const MAX_BYTES = 64 * 1024 * 1024

interface Names {
  firstName?: string
  lastName?: string
}

interface Entry extends Names {
  aliases: Names[]
  id?: string
}

function normalize(name: string) {
  return name.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

export function parseSdn(xml: string) {
  const parser = new SaxesParser({ xmlns: true })
  const path: string[] = []
  const records = new Map<string, Set<string>>()
  const ids = new Set<string>()
  let entry: Entry | undefined
  let alias: Names | undefined
  let expectedCount = 0
  let publishedOn = ''
  let rootSeen = false
  let value = ''

  function indexName(name: string, id: string) {
    const key = normalize(name)
    if (!key) return
    const matches = records.get(key) ?? new Set<string>()
    matches.add(id)
    records.set(key, matches)
  }

  parser.on('doctype', () => { throw new Error('Unexpected OFAC document type') })
  parser.on('opentag', (tag) => {
    path.push(tag.local)
    if (tag.uri !== NAMESPACE) throw new Error('Unexpected OFAC namespace')
    if (path.length === 1) {
      if (tag.local !== 'sdnList') throw new Error('Unexpected OFAC root')
      rootSeen = true
    }
    const key = path.join('/')
    if (key === 'sdnList/sdnEntry') entry = { aliases: [] }
    if (key === 'sdnList/sdnEntry/akaList/aka') alias = {}
    value = ''
  })
  parser.on('text', (part) => { value += part })
  parser.on('cdata', (part) => { value += part })
  parser.on('closetag', () => {
    const key = path.join('/')
    const field = path.pop()
    const text = value.trim()
    if (key === 'sdnList/publshInformation/Record_Count' || key === 'sdnList/publishInformation/Record_Count') {
      expectedCount = /^\d+$/.test(text) ? Number(text) : 0
    }
    if (key === 'sdnList/publshInformation/Publish_Date' || key === 'sdnList/publishInformation/Publish_Date') {
      const date = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text)
      if (date) publishedOn = `${date[3]}-${date[1].padStart(2, '0')}-${date[2].padStart(2, '0')}`
    }
    if (entry && key === 'sdnList/sdnEntry/uid') entry.id = text
    const names = path.join('/') === 'sdnList/sdnEntry' ? entry :
      path.join('/') === 'sdnList/sdnEntry/akaList/aka' ? alias : undefined
    if (names && (field === 'firstName' || field === 'lastName')) names[field] = text
    if (alias && key === 'sdnList/sdnEntry/akaList/aka') {
      entry?.aliases.push(alias)
      alias = undefined
    }
    if (entry && key === 'sdnList/sdnEntry') {
      if (!entry.id || !/^\d+$/.test(entry.id) || ids.has(entry.id) || !entry.lastName) {
        throw new Error('Invalid OFAC record')
      }
      ids.add(entry.id)
      for (const name of [entry, ...entry.aliases]) {
        indexName([name.firstName, name.lastName].filter(Boolean).join(' '), entry.id)
        if (name.firstName && name.lastName) indexName(`${name.lastName} ${name.firstName}`, entry.id)
      }
      entry = undefined
    }
    value = ''
  })
  parser.write(xml).close()
  const date = new Date(publishedOn)
  if (!rootSeen || !expectedCount || ids.size !== expectedCount || !records.size ||
    !Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== publishedOn || date.getTime() > Date.now()) {
    throw new Error('Incomplete OFAC SDN feed')
  }
  return { publishedOn, records }
}

async function download() {
  const response = await fetch(SOURCE, {
    cache: 'no-store', headers: { 'Cache-Control': 'no-cache' }, redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  })
  const age = response.headers.get('age')
  if (!response.ok || !response.body || (age !== null && Number(age) >= REFRESH_MS / 1000)) {
    throw new Error('OFAC SDN feed is unavailable')
  }

  const reader = response.body.getReader()
  const hash = createHash('sha256')
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let bytes = 0
  let xml = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > MAX_BYTES) throw new Error('OFAC SDN feed exceeds size limit')
      hash.update(value)
      xml += decoder.decode(value, { stream: true })
    }
    xml += decoder.decode()
  } finally {
    if (bytes > MAX_BYTES) await reader.cancel()
    reader.releaseLock()
  }

  const { publishedOn, records } = parseSdn(xml)
  return {
    dataset: `OFAC-SDN:${publishedOn}:${hash.digest('hex')}`,
    fetchedAt: new Date().toISOString(),
    publishedOn,
    records,
  }
}

let cache: Awaited<ReturnType<typeof download>> | undefined
let refresh: ReturnType<typeof download> | undefined

export async function screenOfac(entities: { key: string; name: string }[]) {
  if (!cache || Date.now() - Date.parse(cache.fetchedAt) >= REFRESH_MS) {
    refresh ??= download().finally(() => { refresh = undefined })
    cache = await refresh
  }
  const { dataset, fetchedAt, publishedOn, records } = cache
  return {
    dataset,
    fetchedAt,
    matches: entities.flatMap(({ key, name }) => {
      const ids = records.get(normalize(name))
      return ids ? [{ key, match: 'POSSIBLE' as const, recordIds: [...ids].sort() }] : []
    }),
    publishedOn,
    sourceUrl: SOURCE,
  }
}
