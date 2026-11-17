import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Queries } from './Queries'
import { ReviewService } from './ReviewService'

test('correction emails list each item the supplier must fix', () => {
  const text = ReviewService.correctionText([
    'Provide bank evidence matching the company name and account.',
    'Upload the certificate scope annex covering the requested site and calibration activity.',
    'Provide bank evidence matching the company name and account.',
  ])
  assert.match(text, /What we need from you:\n- Provide bank evidence matching the company name and account\.\n- Upload the certificate scope annex/)
  assert.equal(text.match(/Provide bank evidence/g)?.length, 1)
  assert.match(text, /Sign in to update your application and resubmit/)
  assert.equal(ReviewService.correctionText(['  ']), 'A correction is requested. Sign in to see the requested action.')
})

test('rejection emails carry the recorded reason; approvals stay short', () => {
  assert.equal(ReviewService.decisionText('APPROVE', 'All checks passed.'), 'Your onboarding was approved.')
  const rejected = ReviewService.decisionText('REJECT', 'The ultimate parent is a sanctioned entity. ')
  assert.match(rejected, /^Your onboarding was declined\.\n\nReason: The ultimate parent is a sanctioned entity\.\n/)
})

test('the screening stage shows clear, hold, running and provider failures', () => {
  assert.equal(Queries.screeningStage('PASS', 'PENDING', false), 'Clear')
  assert.equal(Queries.screeningStage('REVIEW', 'PENDING', false), 'Hold')
  assert.equal(Queries.screeningStage(undefined, 'SUBMITTED', false), 'Running')
  assert.equal(Queries.screeningStage(undefined, 'SUBMITTED', true), 'Provider unavailable')
  assert.equal(Queries.screeningStage(undefined, 'DRAFT', false), 'Waiting')
})
