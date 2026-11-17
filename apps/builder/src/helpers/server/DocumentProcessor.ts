import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import { env } from '@neo/env'
import type { Document } from '@neo/prisma'
import { Values } from '@neo/schemas'

import { ObjectStore } from './Providers'
import { Secrets } from './Security'
import { DocumentVerification } from './DocumentVerification'

export class DocumentProcessor {
  static readonly BUFFER = 1_000_000
  static readonly FORMAT = '%PDF-'
  static readonly TIMEOUT = 55_000
  static readonly LEGACY_VERSION = 'document-ai-v1'
  static readonly VERSION = 'gemini-ocr-v1'

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

  static extractionKey(documentId: string) {
    // WorkItem.dedupeKey is unique across all job kinds, including SCAN.
    return `extract-${DocumentProcessor.VERSION}-${documentId}`
  }

  static async extract(document: Document) {
    if (document.status !== 'CLEAN' || !document.cleanKey || !document.cleanGeneration) throw new Error('clean file is unavailable')
    const bytes = await DocumentProcessor.bytes(env.GCS_CLEAN_BUCKET, document.cleanKey, document.cleanGeneration)
    return DocumentVerification.extract(document.id, bytes)
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
