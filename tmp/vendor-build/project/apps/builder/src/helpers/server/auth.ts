import { randomUUID } from 'node:crypto'

import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { emailOTP } from 'better-auth/plugins'

import { env } from '@neo/env'
import { prisma } from '@neo/prisma/client'

import { MailProvider } from './Providers'
import { Security } from './Security'

export class Authentication {
  private static instance: ReturnType<typeof Authentication.create> | undefined

  static readonly BUYER_CALLBACK = '/callback/google'
  static readonly OTP_PATH = '/sign-in/email-otp'
  static readonly OTP_SECONDS = 300
  static readonly SESSION_SECONDS = 28_800

  static create() {
    return betterAuth({
      account: { accountLinking: { enabled: false }, encryptOAuthTokens: true },
      baseURL: env.APP_URL,
      database: prismaAdapter(prisma, { provider: 'postgresql' }),
      databaseHooks: {
        session: {
          create: {
            before: async (session, context) => ({
              data: {
                ...session,
                authChannel: context?.path === Authentication.BUYER_CALLBACK ? Security.BUYER :
                  context?.path === Authentication.OTP_PATH ? Security.SUPPLIER : Security.UNKNOWN,
              },
            }),
          },
        },
      },
      plugins: [emailOTP({
        allowedAttempts: 5,
        expiresIn: Authentication.OTP_SECONDS,
        sendVerificationOTP: Authentication.sendOTP,
        storeOTP: 'hashed',
      })],
      rateLimit: { enabled: true },
      secret: env.BETTER_AUTH_SECRET,
      session: {
        additionalFields: { authChannel: { defaultValue: Security.UNKNOWN, input: false, required: false, type: 'string' } },
        cookieCache: { enabled: false }, disableSessionRefresh: true, expiresIn: Authentication.SESSION_SECONDS,
      },
      socialProviders: { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } },
      trustedOrigins: [new URL(env.APP_URL).origin],
    })
  }

  static get() {
    Authentication.instance ??= Authentication.create()
    return Authentication.instance
  }

  static async sendOTP({ email, otp, type }: { email: string; otp: string; type: string }) {
    if (type !== 'sign-in') throw new Error('select supplier sign-in')
    await MailProvider.send(email, randomUUID(), 'Supplier sign-in code', `Your verification code is ${otp}.`)
  }
}

