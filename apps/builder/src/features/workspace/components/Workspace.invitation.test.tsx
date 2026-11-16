import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Workspace } from './Workspace'
import { ApiClient } from '@/lib/trpc'
import InvitePage, { getServerSideProps } from '../../../pages/invite'
import { countryProvider } from '@/helpers/server/CountryProvider'

const countries = [{ code: 'US', name: 'United States' }]
const token = 'a'.repeat(43)
afterEach(() => mock.restoreAll())
function instance() {
  const workspace = new Workspace({ countries })
  mock.method(workspace, 'setState', (update: any, done?: () => void) => {
    Object.assign(workspace.state, typeof update === 'function' ? update(workspace.state) : update)
    done?.()
  })
  return workspace
}
function browser(t: any, hash = '') {
  const values = new Map<string, string>()
  for (const [key, value] of Object.entries({
    window: { location: { hash, pathname: '/invite', search: '' }, history: { replaceState() {} } },
    sessionStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) },
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key)
    Object.defineProperty(globalThis, key, { configurable: true, value })
    t.after(() => { if (previous) Object.defineProperty(globalThis, key, previous); else Reflect.deleteProperty(globalThis, key) })
  }
  return values
}

test('the invite route loads country data required by the supplier profile editor', async () => {
  assert.equal(InvitePage, Workspace)
  mock.method(countryProvider, 'list', async () => countries)
  const result = await getServerSideProps!({ req: { socket: { remoteAddress: '127.0.0.1' } } } as never)
  assert.ok('props' in result)
  assert.deepEqual((await result.props).countries, countries)
})

test('the invitation fragment survives initial load and refresh', async (t) => {
  const values = browser(t, `#${token}`)
  const first = instance()
  mock.method(first as any, 'refresh', async () => {})
  mock.method(first as any, 'poll', async () => {})
  first.componentDidMount()
  await new Promise(setImmediate)
  assert.equal(first.state.token, token)
  assert.equal(values.get(Workspace.INVITATION_STORAGE), token)
  window.location.hash = ''
  const second = instance()
  mock.method(second as any, 'refresh', async () => {})
  mock.method(second as any, 'poll', async () => {})
  second.componentDidMount()
  await new Promise(setImmediate)
  assert.equal(second.state.token, token)
  first.componentWillUnmount(); second.componentWillUnmount()
})

test('a verified supplier opening a link accepts it, refreshes access, and opens the profile', async (t) => {
  const values = browser(t, `#${token}`)
  values.set(Workspace.INVITATION_STORAGE, token)
  const workspace = instance()
  workspace.state.token = token
  let accepts = 0
  let opened = ''
  const api = {
    identity: { me: { query: async () => ({ channel: 'EMAIL_OTP', email: 'supplier@example.com', memberships: [], tenantId: '' }) } },
    supplier: { cases: { query: async () => ({ items: [] }) } },
    invitations: { pending: { query: async () => ({ items: [] }) }, redeem: { mutate: async (input: any) => { accepts++; assert.equal(input.token, token); return { id: 'case', revision: 1 } } } },
  }
  mock.method(ApiClient, 'create', () => api as never)
  mock.method(workspace as any, 'open', async (caseId: string) => { opened = caseId })
  await workspace['refresh']()
  assert.equal(accepts, 1)
  assert.equal(opened, 'case')
  assert.equal(workspace.state.view, 'suppliers')
  assert.equal(workspace.state.token, '')
  assert.equal(values.has(Workspace.INVITATION_STORAGE), false)
  assert.match(workspace.state.notice, /Complete your supplier profile/)
})

test('a Google session without buyer memberships displays supplier sign-in guidance instead of redeeming', async (t) => {
  browser(t)
  const workspace = instance()
  workspace.state.token = token
  let supplierCalls = 0
  const api = {
    identity: { me: { query: async () => ({ channel: 'SSO_GOOGLE', email: 'supplier@example.com', memberships: [], tenantId: '' }) } },
    supplier: { cases: { query: async () => { supplierCalls++; throw new Error('must not request') } } },
  }
  mock.method(ApiClient, 'create', () => api as never)
  await workspace['refresh']()
  assert.equal(supplierCalls, 0)
  const html = renderToStaticMarkup(workspace.render())
  assert.match(html, /Sign in as the invited supplier/)
  assert.match(html, /Use supplier email sign-in/)
})

test('pending invitations appear on the supplier dashboard before acceptance', () => {
  const workspace = instance()
  workspace.state = { ...workspace.state, email: 'supplier@example.com', authChannel: 'EMAIL_OTP', loading: false,
    pendingInvitations: [{ id: 'invite', caseId: 'case', requestedSite: 'Calibration site', country: 'US', expiresAt: new Date().toISOString() }] }
  const html = renderToStaticMarkup(workspace.render())
  assert.match(html, /Your supplier invitations/)
  assert.match(html, /Calibration site/)
  assert.match(html, /Start onboarding/)
})

test('draft applications prompt the vendor to complete their profile', () => {
  const workspace = instance()
  workspace.state = { ...workspace.state, email: 'supplier@example.com', authChannel: 'EMAIL_OTP', loading: false,
    cases: [{ caseId: 'case', requestedSite: 'Calibration site', name: '', number: 1, revision: 1, status: 'DRAFT', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] }
  const html = renderToStaticMarkup(workspace.render())
  assert.match(html, /Complete your supplier profile/)
  assert.match(html, /Continue profile/)
})
