import nodemailer from 'nodemailer'
import { z } from 'zod'

import { env } from '@neo/env'
import { Values } from '@neo/schemas'
import { createObjectStorage, localGoogleStorageEnabled } from './LocalGoogleStorage'

export class MailProvider {
  static readonly ENDPOINT = 'https://api.resend.com/emails'
  static readonly SMTP_HOST = 'smtp.gmail.com'
  static readonly SMTP_PORT = 465
  static readonly TIMEOUT_MS = 15_000

  static async send(email: string, key: string, subject: string, text: string) {
    if (env.MAIL_PROVIDER === 'gmail') {
      if (!env.GMAIL_APP_PASSWORD) throw new Error('Gmail App Password is required')
      const transport = nodemailer.createTransport({
        auth: { pass: env.GMAIL_APP_PASSWORD, user: env.EMAIL_FROM },
        connectionTimeout: MailProvider.TIMEOUT_MS,
        greetingTimeout: MailProvider.TIMEOUT_MS,
        host: MailProvider.SMTP_HOST,
        port: MailProvider.SMTP_PORT,
        secure: true,
        socketTimeout: MailProvider.TIMEOUT_MS,
      })
      const result = await transport.sendMail({
        from: env.EMAIL_FROM,
        messageId: `<${encodeURIComponent(key)}@${env.EMAIL_FROM.split('@')[1]}>`,
        subject, text, to: email,
      })
      if (!result.accepted.length) throw new Error('Gmail did not accept the message')
      return result.messageId
    }
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
  static readonly STORAGE = createObjectStorage()
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
    if (localGoogleStorageEnabled()) {
      return { url: new URL(`/api/documents/upload?key=${encodeURIComponent(key)}`, env.APP_URL).toString(), headers: { 'content-type': ObjectStore.PDF } }
    }
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
