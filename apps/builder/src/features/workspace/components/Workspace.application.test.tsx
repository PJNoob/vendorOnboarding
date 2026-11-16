import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'

import { ApiClient } from '@/lib/trpc'
import { Workspace } from './Workspace'

const countries = [{ code: 'US', name: 'United States' }, { code: 'IN', name: 'India' }]
afterEach(() => mock.restoreAll())

function instance(channel = 'EMAIL_OTP') {
  const workspace = new Workspace({ countries })
  workspace.state = { ...workspace.state, email: 'supplier@example.test', authChannel: channel, loading: false }
  mock.method(workspace, 'setState', (update: any, done?: () => void) => {
    Object.assign(workspace.state, typeof update === 'function' ? update(workspace.state) : update)
    done?.()
  })
  return workspace
}

function form(site = 'Boston laboratory') {
  const data = new FormData()
  data.set('requestedSite', site)
  data.set('country', 'US')
  return data
}

test('first-time suppliers see a creation action and form without an invitation', () => {
  const workspace = instance()
  const empty = renderToStaticMarkup(workspace.render())
  assert.match(empty, /New application/)
  assert.match(empty, /Start your first application/)
  workspace.state.showNewApplication = true
  const html = renderToStaticMarkup(workspace.render())
  assert.match(html, /Apply to Harbor BioLabs/)
  assert.match(html, /<input(?=[^>]*name="requestedSite")(?=[^>]*required="")[^>]*>/)
  assert.match(html, /value="IN"[^>]*>India/)
  assert.match(html, /Create application/)
  assert.doesNotMatch(html, /name="supplierEmail"/)
})

test('returning suppliers retain the new application action alongside existing applications', () => {
  const workspace = instance()
  workspace.state.cases = [{ caseId: 'existing', name: 'Existing supplier', number: 1, requestedSite: 'Existing site', revision: 0,
    status: 'DRAFT', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]
  const html = renderToStaticMarkup(workspace.render())
  assert.match(html, /New application/)
  assert.match(html, /Continue profile/)
  assert.match(html, /Existing supplier/)
})

test('buyer sessions retain invitation actions and cannot see supplier creation', () => {
  const workspace = instance('SSO_GOOGLE')
  workspace.state.tenantId = 'tenant'
  workspace.state.memberships = [{ id: 'member', tenantId: 'tenant', role: 'ADMIN' }]
  const html = renderToStaticMarkup(workspace.render())
  assert.match(html, /Invite supplier/)
  assert.doesNotMatch(html, /New application|Start your first application/)
  const outsider = renderToStaticMarkup(instance('SSO_GOOGLE').render())
  assert.doesNotMatch(outsider, /New application|Start your first application/)
})

test('creation refreshes the supplier list and opens the existing editor at the first step', async () => {
  const workspace = instance()
  workspace.state.showNewApplication = true
  workspace.state.supplierStep = 5
  workspace.state.search = 'old search'
  const create = mock.fn(async () => ({ id: 'new-case', revision: 0 }))
  mock.method(ApiClient, 'create', () => ({ supplier: { create: { mutate: create } } }) as never)
  const refresh = mock.method(workspace as any, 'refresh', async () => {})
  const open = mock.method(workspace as any, 'open', async () => {})
  assert.match((await workspace['createApplication'](form()))!, /submit it for review/)
  assert.equal(create.mock.calls[0].arguments.length, 1)
  assert.equal(refresh.mock.calls[0].arguments[0], false)
  assert.equal(open.mock.calls[0].arguments[0], 'new-case')
  assert.equal(workspace.state.supplierStep, 0)
  assert.equal(workspace.state.view, 'suppliers')
  assert.equal(workspace.state.search, '')
  assert.equal(workspace.state.showNewApplication, false)
})

test('an ambiguous network failure keeps the same idempotency key when retried', async () => {
  const workspace = instance()
  const requests: any[] = []
  mock.method(ApiClient, 'create', () => ({ supplier: { create: { mutate: async (input: any) => {
    requests.push(input)
    if (requests.length === 1) throw new Error('Network interrupted')
    return { id: 'new-case', revision: 0 }
  } } } }) as never)
  mock.method(workspace as any, 'refresh', async () => {})
  mock.method(workspace as any, 'open', async () => {})
  await assert.rejects(workspace['createApplication'](form()), /Network interrupted/)
  await workspace['createApplication'](form())
  assert.equal(requests[0].idempotencyKey, requests[1].idempotencyKey)
})

test('changed application details receive a new idempotency key after a failed request', async () => {
  const workspace = instance()
  const requests: any[] = []
  mock.method(ApiClient, 'create', () => ({ supplier: { create: { mutate: async (input: any) => {
    requests.push(input)
    throw new Error('Network interrupted')
  } } } }) as never)
  await assert.rejects(workspace['createApplication'](form()), /Network interrupted/)
  await assert.rejects(workspace['createApplication'](form('Another site')), /Network interrupted/)
  assert.notEqual(requests[0].idempotencyKey, requests[1].idempotencyKey)
})

test('retrying after a refresh failure reopens the created case without another creation request', async () => {
  const workspace = instance()
  const create = mock.fn(async () => ({ id: 'new-case', revision: 0 }))
  mock.method(ApiClient, 'create', () => ({ supplier: { create: { mutate: create } } }) as never)
  let refreshes = 0
  mock.method(workspace as any, 'refresh', async () => { if (++refreshes === 1) throw new Error('Refresh interrupted') })
  const open = mock.method(workspace as any, 'open', async () => {})
  await assert.rejects(workspace['createApplication'](form()), /Refresh interrupted/)
  await workspace['createApplication'](form())
  assert.equal(create.mock.callCount(), 1)
  assert.equal(open.mock.calls[0].arguments[0], 'new-case')
})

test('concurrent clicks create only one application and disable creation controls while busy', async () => {
  const workspace = instance()
  let finish!: (value: { id: string; revision: number }) => void
  const create = mock.fn(() => new Promise<{ id: string; revision: number }>((resolve) => { finish = resolve }))
  mock.method(ApiClient, 'create', () => ({ supplier: { create: { mutate: create } } }) as never)
  mock.method(workspace as any, 'refresh', async () => {})
  mock.method(workspace as any, 'open', async () => {})
  const pending = workspace['createApplication'](form())
  await workspace['createApplication'](form())
  assert.equal(create.mock.callCount(), 1)
  finish({ id: 'new-case', revision: 0 })
  await pending
  workspace.state.busy = true
  workspace.state.showNewApplication = true
  const html = renderToStaticMarkup(workspace.render())
  assert.match(html, /disabled=""[^>]*>Create application/)
  assert.match(html, /disabled=""[^>]*>[\s\S]*?New application/)
})
