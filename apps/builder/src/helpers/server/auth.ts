import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'

import { betterAuth } from 'better-auth'
import { APIError, createAuthEndpoint, createAuthMiddleware } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { emailOTP } from 'better-auth/plugins'
import { z } from 'zod'

import { demoAuthEnabled, env, googleAuthConfigured } from '@neo/env'
import { prisma } from '@neo/prisma/client'

import { demoIdentity } from './DemoIdentity'
import { MailProvider } from './Providers'
import { Secrets, Security } from './Security'

export class Authentication {
  private static demoInstance: ReturnType<typeof Authentication.create> | undefined
  private static instance: ReturnType<typeof Authentication.create> | undefined

  static readonly BUYER_CALLBACK = '/callback/:id'
  static readonly DEMO_PATH = '/sign-in/demo'
  static readonly OTP_PATH = '/sign-in/email-otp'
  static readonly OTP_SECONDS = 300
  static readonly SESSION_SECONDS = 28_800

  private static demoPlugin() {
    return {
      id: 'demo-auth',
      endpoints: {
        signInDemo: createAuthEndpoint(Authentication.DEMO_PATH, {
          method: 'POST',
          body: z.union([
            z.object({ email: z.email(), password: z.string().min(1).max(256) }),
            z.object({ token: z.string().min(1).max(256) }),
          ]),
        }, async (ctx) => {
          const origin = new URL(env.APP_URL).origin
          if (!ctx.request || new URL(ctx.request.url).origin !== origin || ctx.request.headers.get('origin') !== origin) {
            throw APIError.fromStatus('FORBIDDEN', { message: 'Sign in from the local application.' })
          }
          if (!env.DEMO_LOGIN_TOKEN) {
            throw APIError.fromStatus('SERVICE_UNAVAILABLE', { message: 'Configure DEMO_LOGIN_TOKEN in .env.local to use demo login.' })
          }
          const credential = 'token' in ctx.body ? ctx.body.token : ctx.body.password
          const digest = (value: string) => createHash('sha256').update(value).digest()
          const validToken = timingSafeEqual(digest(credential), digest(env.DEMO_LOGIN_TOKEN))
          const validEmail = 'token' in ctx.body || Secrets.email(ctx.body.email) === demoIdentity.email
          if (!validToken || !validEmail) {
            throw APIError.fromStatus('UNAUTHORIZED', { message: 'The demo email or password is incorrect.' })
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
                authChannel: context?.path === Authentication.BUYER_CALLBACK && context.params?.id === 'google' ? Security.BUYER :
                  context?.path === Authentication.OTP_PATH ? Security.SUPPLIER :
                  context?.path === Authentication.DEMO_PATH ? Security.DEMO : Security.UNKNOWN,
              },
            }),
          },
        },
      },
      hooks: {
        before: createAuthMiddleware(async (ctx) => {
          if (ctx.path === '/sign-in/social' && ctx.body?.provider === 'google' && !googleAuthConfigured(env)) {
            throw APIError.fromStatus('SERVICE_UNAVAILABLE', { message: 'Google sign-in is not configured. Contact your workspace administrator.' })
          }
        }),
      },
      onAPIError: { errorURL: '/' },
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
      socialProviders: googleAuthConfigured(env)
        ? { google: { clientId: env.GOOGLE_CLIENT_ID!.trim(), clientSecret: env.GOOGLE_CLIENT_SECRET!.trim() } }
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

