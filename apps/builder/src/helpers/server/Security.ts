import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto'

import { TRPCError } from '@trpc/server'

import { env } from '@neo/env'
import type { BuyerRole } from '@neo/prisma'
import { BaseRepository, CaseAccessRepository, MembershipRepository, type TransactionClient } from '@neo/prisma/repositories'

import { demoIdentity } from './DemoIdentity'

export interface Actor {
  channel: string
  createdAt: Date
  email: string
  id: string
  requestId: string
  tenantId: string
  verified: boolean
}

export class Security {
  static readonly BUYER = 'SSO_GOOGLE'
  static readonly DEMO = 'DEMO'
  static readonly FRESH_MS = 900_000
  static readonly SUPPLIER = 'EMAIL_OTP'
  static readonly UNKNOWN = 'UNKNOWN'

  static async access(actor: Actor, caseId: string, tx?: TransactionClient) {
    const access = await CaseAccessRepository.findFirst({
      where: { caseId, revokedAt: null, userId: actor.id },
    }, tx)
    if (!access || !actor.verified || actor.channel !== Security.SUPPLIER) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'case access is unavailable' })
    }
    return access
  }

  static isBuyer(actor: Actor) {
    return actor.channel === Security.BUYER || actor.channel === Security.DEMO
  }

  static async buyer(actor: Actor, roles: readonly BuyerRole[], tx?: TransactionClient) {
    if (actor.channel === Security.DEMO && (actor.id !== demoIdentity.id || actor.tenantId !== demoIdentity.tenantId)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'demo workspace permission is required' })
    }
    const member = await MembershipRepository.findFirst({
      where: { active: true, tenantId: actor.tenantId, userId: actor.id },
    }, tx)
    if (!Security.isBuyer(actor) || !actor.verified || !member || !roles.includes(member.role)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'buyer permission is required' })
    }
    return member
  }

  static fresh(actor: Actor) {
    if (Date.now() - actor.createdAt.getTime() > Security.FRESH_MS) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'sign in again to perform this action' })
    }
  }

  static lock(tenantId: string, tx: TransactionClient) {
    return BaseRepository.lockTenant(tenantId, tx)
  }
}

export class Secrets {
  static readonly ALGORITHM = 'aes-256-gcm'
  static readonly DIGEST = 'sha256'
  static readonly IV_BYTES = 12
  static readonly KEY_VERSION = 'v1'
  static readonly TAG_BYTES = 16
  static readonly TOKEN_BYTES = 32

  private static key(purpose: string) {
    return createHmac(Secrets.DIGEST, Buffer.from(env.PII_KEY, 'hex')).update(purpose).digest()
  }

  static decrypt(bytes: Uint8Array, scope: string) {
    const data = Buffer.from(bytes)
    const start = Secrets.IV_BYTES + Secrets.TAG_BYTES
    const decipher = createDecipheriv(Secrets.ALGORITHM, Secrets.key('cipher'), data.subarray(0, Secrets.IV_BYTES))
    decipher.setAAD(Buffer.from(scope))
    decipher.setAuthTag(data.subarray(Secrets.IV_BYTES, start))
    return Buffer.concat([decipher.update(data.subarray(start)), decipher.final()]).toString('utf8')
  }

  static email(email: string) {
    return email.trim().toLowerCase()
  }

  static encrypt(value: string, scope: string) {
    const iv = randomBytes(Secrets.IV_BYTES)
    const cipher = createCipheriv(Secrets.ALGORITHM, Secrets.key('cipher'), iv)
    cipher.setAAD(Buffer.from(scope))
    const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
    return Buffer.concat([iv, cipher.getAuthTag(), body])
  }

  static hash(data: string | Buffer) {
    return createHash(Secrets.DIGEST).update(data).digest('hex')
  }

  static mac(data: string, purpose: string) {
    return createHmac(Secrets.DIGEST, Secrets.key(purpose)).update(data).digest('hex')
  }

  static token() {
    return randomBytes(Secrets.TOKEN_BYTES).toString('base64url')
  }
}
