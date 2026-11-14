import { randomUUID } from 'node:crypto'

import { betterAuth } from 'better-auth'
import { APIError, createAuthEndpoint } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { emailOTP } from 'better-auth/plugins'

import { demoAuthEnabled, env } from '@neo/env'
import { prisma } from '@neo/prisma/client'

import { demoIdentity } from './DemoIdentity'
import { MailProvider } from './Providers'
import { Secrets, Security } from './Security'

export class Authentication {
  private static demoInstance: ReturnType<typeof Authentication.create> | undefined
  private static instance: ReturnType<typeof Authentication.create> | undefined

  static readonly BUYER_CALLBACK = '/callback/google'
  static readonly DEMO_PATH = '/sign-in/demo'
  static readonly OTP_PATH = '/sign-in/email-otp'
  static readonly OTP_SECONDS = 300
  static readonly SESSION_SECONDS = 28_800

  private static demoPlugin() {
    return {
      id: 'demo-auth',
      endpoints: {
        signInDemo: createAuthEndpoint(Authentication.DEMO_PATH, { method: 'POST' }, async (ctx) => {
          const origin = new URL(env.APP_URL).origin
          if (!ctx.request || new URL(ctx.request.url).origin !== origin || ctx.request.headers.get('origin') !== origin) {
            throw APIError.fromStatus('FORBIDDEN', { message: 'Sign in from the local application.' })
          }
          const user = await prisma.user.findFirst({
            where: {
              id: demoIdentity.id, email: demoIdentity.email, emailVerified: true,
              membership_user: { some: { active: true, role: 'ADMIN', tenantId: demoIdentity.tenantId } },
            },
          })
          if (!user) {
            throw APIError.fromStatus('NOT_FOUND', { message: 'Demo admin is unavailable. Run make seed.' })
          }
          const session = await ctx.context.internalAdapter.createSession(user.id)
          if (!session) throw APIError.fromStatus('INTERNAL_SERVER_ERROR', { message: 'Could not create a demo session.' })
          await setSessionCookie(ctx, { session, user })
          return ctx.json({ ok: true })
        }),
      },
    }
  }

  static create(allowDemo: boolean) {
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
                  context?.path === Authentication.OTP_PATH ? Security.SUPPLIER :
                  context?.path === Authentication.DEMO_PATH ? Security.DEMO : Security.UNKNOWN,
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
      }), ...(allowDemo ? [Authentication.demoPlugin()] : [])],
      rateLimit: { enabled: true },
      secret: env.BETTER_AUTH_SECRET,
      session: {
        additionalFields: { authChannel: { defaultValue: Security.UNKNOWN, input: false, required: false, type: 'string' } },
        cookieCache: { enabled: false }, disableSessionRefresh: true, expiresIn: Authentication.SESSION_SECONDS,
      },
      socialProviders: env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
        : {},
      trustedOrigins: [new URL(env.APP_URL).origin],
    })
  }

  static get(allowDemo = false) {
    if (allowDemo && demoAuthEnabled()) {
      Authentication.demoInstance ??= Authentication.create(true)
      return Authentication.demoInstance
    }
    Authentication.instance ??= Authentication.create(false)
    return Authentication.instance
  }

  static async sendOTP({ email, otp, type }: { email: string; otp: string; type: string }) {
    if (type !== 'sign-in') throw new Error('select supplier sign-in')
    if (Secrets.email(email) === demoIdentity.email) throw new Error('use demo sign-in for the demo admin')
    await MailProvider.send(email, randomUUID(), 'Supplier sign-in code', `Your verification code is ${otp}.`)
  }
}

