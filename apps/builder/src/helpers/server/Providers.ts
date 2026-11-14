import { Storage } from '@google-cloud/storage'
import { z } from 'zod'

import { env } from '@neo/env'
import { Values } from '@neo/schemas'

export class MailProvider {
  static readonly ENDPOINT = 'https://api.resend.com/emails'
  static readonly TIMEOUT_MS = 15_000

  static async send(email: string, key: string, subject: string, text: string) {
    const response = await fetch(MailProvider.ENDPOINT, {
      body: JSON.stringify({ from: env.EMAIL_FROM, subject, text, to: [email] }),
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
      },
      method: 'POST',
      signal: AbortSignal.timeout(MailProvider.TIMEOUT_MS),
    })
    if (!response.ok) {
      throw new Error('email provider did not accept the message')
    }
    return z.object({ id: z.string() }).parse(await response.json()).id
  }
}

export class ObjectStore {
  static readonly DOWNLOAD_MS = 60_000
  static readonly PDF = 'application/pdf'
  static readonly STORAGE = new Storage()
  static readonly UPLOAD_MS = 300_000

  static async download(key: string, generation: string) {
    const [url] = await ObjectStore.STORAGE.bucket(env.GCS_CLEAN_BUCKET).file(key).getSignedUrl({
      action: 'read',
      expires: Date.now() + ObjectStore.DOWNLOAD_MS,
      queryParams: { generation },
      responseDisposition: 'attachment',
      version: 'v4',
    })
    return url
  }

  static async inspect(key: string) {
    const [metadata] = await ObjectStore.STORAGE.bucket(env.GCS_QUARANTINE_BUCKET).file(key).getMetadata()
    const generation = String(metadata.generation ?? '')
    const size = Number(metadata.size)
    if (!generation || !Number.isSafeInteger(size) || size < 1 || size > Values.MAX_FILE || metadata.contentType !== ObjectStore.PDF) {
      throw new Error('uploaded file metadata is invalid')
    }
    return { generation, size }
  }

  static async upload(key: string, sizeBytes: number) {
    const headers = {
      'content-type': ObjectStore.PDF,
      'x-goog-content-length-range': `${sizeBytes},${sizeBytes}`,
      'x-goog-if-generation-match': '0',
    }
    const [url] = await ObjectStore.STORAGE.bucket(env.GCS_QUARANTINE_BUCKET).file(key).getSignedUrl({
      action: 'write',
      contentType: ObjectStore.PDF,
      expires: Date.now() + ObjectStore.UPLOAD_MS,
      extensionHeaders: {
        'x-goog-content-length-range': headers['x-goog-content-length-range'],
        'x-goog-if-generation-match': headers['x-goog-if-generation-match'],
      },
      version: 'v4',
    })
    return { headers, url }
  }
}
