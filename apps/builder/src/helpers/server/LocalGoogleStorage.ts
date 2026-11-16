import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Storage } from '@google-cloud/storage'
import { OAuth2Client } from 'google-auth-library'
import { env } from '@neo/env'

export function localGoogleStorageEnabled() {
  return process.env.LOCAL_GCLOUD_AUTH === 'true' && process.env.NODE_ENV !== 'production' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(new URL(env.APP_URL).hostname)
}

export function createObjectStorage() {
  if (!localGoogleStorageEnabled()) return new Storage()
  const auth = new OAuth2Client()
  auth.refreshHandler = async () => {
    const result = await promisify(execFile)(process.env.GCLOUD_EXECUTABLE || 'gcloud', ['auth', 'print-access-token'], { timeout: 15_000 })
    return { access_token: result.stdout.trim(), expiry_date: Date.now() + 45 * 60_000 }
  }
  return new Storage({ projectId: process.env.GOOGLE_CLOUD_PROJECT, authClient: auth })
}
