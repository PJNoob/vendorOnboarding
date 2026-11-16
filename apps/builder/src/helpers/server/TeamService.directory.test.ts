import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'
import { CaseAccessRepository, MembershipRepository } from '@neo/prisma/repositories'

import { type Actor, Security } from './Security'
import { TeamService } from './TeamService'

const actor: Actor = { id: 'admin', email: 'admin@example.test', tenantId: 'workspace', requestId: 'request', channel: Security.BUYER, verified: true, createdAt: new Date() }
afterEach(() => mock.restoreAll())

test('directory reads existing active members and supplier access within the current tenant', async () => {
  const authorized = mock.method(Security, 'buyer', async () => ({ role: 'ADMIN' }) as never)
  const members = mock.method(MembershipRepository, 'findMany', async () => [
    { id: 'existing-membership', role: 'REVIEWER', user: { name: 'Existing Reviewer', email: 'reviewer@example.test' } },
  ] as never)
  const suppliers = mock.method(CaseAccessRepository, 'findMany', async () => [
    { id: 'existing-access', caseId: 'application', case: { requestedSite: 'Lab services' }, user: { name: 'Existing Supplier', email: 'supplier@example.test' } },
  ] as never)
  assert.deepEqual(await TeamService.directory(actor), {
    members: [{ id: 'existing-membership', role: 'REVIEWER', name: 'Existing Reviewer', email: 'reviewer@example.test' }],
    suppliers: [{ id: 'existing-access', caseId: 'application', requestedSite: 'Lab services', name: 'Existing Supplier', email: 'supplier@example.test' }],
  })
  assert.deepEqual(authorized.mock.calls[0].arguments, [actor, ['ADMIN']])
  assert.deepEqual(members.mock.calls[0].arguments[0]?.where, { active: true, tenantId: actor.tenantId })
  assert.deepEqual(suppliers.mock.calls[0].arguments[0]?.where, { revokedAt: null, tenantId: actor.tenantId })
  assert.equal(members.mock.calls[0].arguments[0]?.take, undefined, 'include older memberships beyond the first page')
  assert.equal(suppliers.mock.calls[0].arguments[0]?.take, undefined, 'include older supplier access beyond the first page')
})

test('directory denies unauthorized users before reading any access records', async () => {
  mock.method(Security, 'buyer', async () => { throw new Error('buyer permission is required') })
  const members = mock.method(MembershipRepository, 'findMany')
  const suppliers = mock.method(CaseAccessRepository, 'findMany')
  await assert.rejects(TeamService.directory(actor), /buyer permission is required/)
  assert.equal(members.mock.callCount(), 0)
  assert.equal(suppliers.mock.callCount(), 0)
})
