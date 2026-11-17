import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'

import { DecisionRepository, OnboardingCaseRepository, type TransactionClient } from '@neo/prisma/repositories'
import type { Input } from '@neo/schemas'

import { Commands } from './Commands'
import { ReviewService } from './ReviewService'
import { Security, type Actor } from './Security'

afterEach(() => mock.restoreAll())

const actor: Actor = { channel: 'GOOGLE', createdAt: new Date(), email: 'review@example.test', id: 'creator',
  requestId: 'request', tenantId: 'tenant', verified: true }
const input: Input<'decide'> = { caseId: 'case', expectedCaseRevision: 2, idempotencyKey: 'decision',
  outcome: 'REJECT', rationale: 'Required evidence could not be verified.', submissionId: 'submission' }

function setup(role: 'ADMIN' | 'REVIEWER') {
  const row = { id: 'case', createdById: actor.id, revision: 2, status: 'PENDING' }
  const snapshot = { id: 'submission', submittedAt: new Date(), issue_submission: [], checkRun_submission: [] }
  const tx = {} as TransactionClient
  mock.method(Security, 'buyer', async (_actor: Actor, roles: readonly string[]) => {
    assert.ok(roles.includes(role))
    return { role } as never
  })
  mock.method(Commands, 'execute', async (_actor: Actor, _operation: string, _input: Input<'decide'>,
    authorize: (tx: TransactionClient) => Promise<unknown>,
    apply: (tx: TransactionClient) => Promise<{ id: string; revision: number }>) => {
    await authorize(tx)
    return apply(tx)
  })
  mock.method(Commands, 'current', async () => ({ row, snapshot, policy: { rules: ['ENTITY_CONSISTENCY'] } }) as never)
  mock.method(DecisionRepository, 'create', async () => ({ id: 'recorded' }) as never)
  const update = mock.method(OnboardingCaseRepository, 'updateMany', async (_args: Parameters<typeof OnboardingCaseRepository.updateMany>[0]) => ({ count: 1 }))
  mock.method(ReviewService, 'notify', async () => {})
  mock.method(Commands, 'audit', async () => {})
  return { row, update }
}

test('an Admin can record a decision on a case they created', async () => {
  const { update } = setup('ADMIN')
  assert.deepEqual(await ReviewService.decide(actor, input), { id: 'recorded', revision: 3 })
  assert.equal(update.mock.calls[0].arguments[0].data.status, 'REJECTED')
})

test('a Reviewer still cannot decide a case they created', async () => {
  const { update } = setup('REVIEWER')
  await assert.rejects(ReviewService.decide(actor, input), /independent reviewer/)
  assert.equal(update.mock.callCount(), 0)
})

test('Admins must wait for verification and cannot approve without passing checks', async () => {
  const { row, update } = setup('ADMIN')
  row.status = 'SUBMITTED'
  await assert.rejects(ReviewService.decide(actor, input), /current pending submission/)
  row.status = 'PENDING'
  await assert.rejects(ReviewService.decide(actor, { ...input, outcome: 'APPROVE' }), /all mandatory checks must pass/)
  assert.equal(update.mock.callCount(), 0)
})
