import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { env } from '@neo/env'
import type { Document } from '@neo/prisma'
import { Values } from '@neo/schemas'

import { ObjectStore } from './Providers'
import { Secrets } from './Security'

export class DocumentProcessor {
  static readonly BUFFER = 1_000_000
  static readonly FORMAT = '%PDF-'
  static readonly TIMEOUT = 55_000
  static readonly VERSION = 'poppler-v1'

  private static async bytes(bucket: string, key: string, generation: string) {
    const stream = ObjectStore.STORAGE.bucket(bucket).file(key, { generation }).createReadStream()
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of stream) {
      const bytes = Buffer.from(chunk)
      size += bytes.length
      if (size > Values.MAX_FILE) {
        stream.destroy()
        throw new Error('document exceeds the byte limit')
      }
      chunks.push(bytes)
    }
    return Buffer.concat(chunks)
  }

  private static run(executable: string, args: string[]) {
    return promisify(execFile)(executable, args, { maxBuffer: DocumentProcessor.BUFFER, timeout: DocumentProcessor.TIMEOUT })
  }

  static async extract(document: Document) {
    if (!document.cleanKey || !document.cleanGeneration) throw new Error('clean file is unavailable')
    const directory = await mkdtemp(join(tmpdir(), 'vendor-extract-'))
    try {
      return await DocumentProcessor.extractFile(document, directory)
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  }

  static async extractFile(document: Document, directory: string) {
    const deadline = Date.now() + DocumentProcessor.TIMEOUT
    const input = join(directory, 'source.pdf')
    const output = join(directory, 'source.txt')
    await writeFile(input, await DocumentProcessor.bytes(env.GCS_CLEAN_BUCKET, document.cleanKey ?? '', document.cleanGeneration ?? ''))
    const info = await DocumentProcessor.run('pdfinfo', [input])
    const pages = Number(/^Pages:\s+(\d+)/m.exec(info.stdout)?.[1])
    if (!pages || pages > 50 || /^Encrypted:\s+yes/m.test(info.stdout)) return []
    await DocumentProcessor.run('pdftotext', ['-layout', input, output])
    const text = await readFile(output, 'utf8')
    const extracted = text.split('\f')
    const results = []
    for (let page = 1; page <= pages; page += 1) {
      if (Date.now() >= deadline) return []
      let value = extracted[page - 1]?.trim() ?? ''
      if (!value) {
        const image = join(directory, `page-${page}`)
        await DocumentProcessor.run('pdftoppm', ['-f', String(page), '-l', String(page), '-r', '150', '-png', '-singlefile', input, image])
        const ocr = await DocumentProcessor.run('tesseract', [`${image}.png`, 'stdout'])
        value = ocr.stdout.trim()
      }
      if (value) results.push({ documentId: document.id, page, text: value.slice(0, 10_000) })
    }
    return results
  }

  static async scan(document: Document, epoch: number) {
    if (!document.generation) throw new Error('uploaded object generation is unavailable')
    const bytes = await DocumentProcessor.bytes(env.GCS_QUARANTINE_BUCKET, document.objectKey, document.generation)
    if (bytes.length !== document.sizeBytes || Secrets.hash(bytes) !== document.sha256 ||
      bytes.subarray(0, DocumentProcessor.FORMAT.length).toString() !== DocumentProcessor.FORMAT) return undefined
    const directory = await mkdtemp(join(tmpdir(), 'vendor-scan-'))
    try {
      return await DocumentProcessor.scanFile(bytes, document, directory, epoch)
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  }

  static async scanFile(bytes: Buffer, document: Document, directory: string, epoch: number) {
    const path = join(directory, 'source.pdf')
    await writeFile(path, bytes)
    const clean = await DocumentProcessor.run('clamscan', ['--database=/tmp/clamav', '--no-summary', path]).then(
      () => true,
      (error: { code?: number }) => {
        if (error.code === 1) return false
        throw error
      },
    )
    if (!clean) return undefined
    const cleanKey = `${document.objectKey}/${document.id}/${epoch}.pdf`
    const file = ObjectStore.STORAGE.bucket(env.GCS_CLEAN_BUCKET).file(cleanKey)
    await file.save(bytes, {
      contentType: ObjectStore.PDF, preconditionOpts: { ifGenerationMatch: 0 }, resumable: false,
    })
    const [metadata] = await file.getMetadata()
    return { cleanGeneration: String(metadata.generation), cleanKey }
  }
}
