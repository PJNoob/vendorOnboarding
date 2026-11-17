import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import type { Output } from '@neo/schemas'

import { DecisionSummary } from './DecisionSummary'
import { outcome, pendingReason, stageTone } from './status'
import { Workspace } from './Workspace'

type Detail = Output<'detail'>
const row = (status: Detail['case']['status'], issueCount = 0) => ({
  caseId: 'case', createdAt: '2026-11-01T00:00:00.000Z', issueCount, name: 'Acme Ltd', number: 1, requestedSite: 'Site A',
  revision: 1, status, updatedAt: '2026-11-02T00:00:00.000Z',
})

test('every case state maps to approved, pending or rejected with a pending reason', () => {
  assert.deepEqual((['INVITED', 'DRAFT', 'SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((status) => outcome({ status })),
    ['Pending', 'Pending', 'Pending', 'Pending', 'Approved', 'Rejected'])
  assert.equal(pendingReason(row('PENDING', 2)), '2 open issues before a decision')
  assert.equal(pendingReason(row('PENDING')), 'Ready for a decision')
  assert.equal(pendingReason(row('DRAFT'), true), 'Complete and submit your application')
  const chip = renderToStaticMarkup(Workspace.statusChip(row('SUBMITTED'), true))
  assert.match(chip, /Pending<\/span><small>Submitted for review<\/small>/)
  assert.doesNotMatch(renderToStaticMarkup(Workspace.statusChip(row('APPROVED'))), /<small>/)
})

test('run stages get a tone so the live view shows progress at a glance', () => {
  assert.deepEqual(['Clean', 'Recorded', 'Running', 'Action required', 'Hold', 'Waiting', 'SUBMITTED'].map(stageTone),
    ['done', 'done', 'running', 'attention', 'attention', 'waiting', 'running'])
})

const detail = (status: Detail['case']['status'], extra: Partial<Detail> = {}): Detail => ({
  case: row(status), checks: [], decisions: [], documents: [], draftRevision: 1, issues: [], required: [],
  run: { stages: [] }, submissionId: 'submission', values: {}, ...extra,
})

test('the reviewer sees why a case is pending, rule by rule, using the latest check attempt', () => {
  const html = renderToStaticMarkup(createElement(DecisionSummary, { supplier: false, detail: detail('PENDING', {
    checks: [
      { code: 'BANK_MISMATCH', evidence: [], result: 'FAIL', rule: 'BANK_BENEFICIARY', source: 'MANUAL' },
      { code: 'MATCHED', evidence: [], result: 'PASS', rule: 'BANK_BENEFICIARY', source: 'MANUAL' }, // older attempt
      { code: 'MATCHED', evidence: [], result: 'PASS', rule: 'TAX_PROFILE', source: 'MANUAL' },
    ],
    issues: [{ checkRule: 'BANK_BENEFICIARY', code: 'BANK_MISMATCH', id: 'i1', message: 'Provide bank evidence matching the company name and account.', owner: 'REVIEWER' }],
  }) }))
  assert.match(html, /Why this status/)
  assert.match(html, /<h3>Pending<\/h3>/)
  assert.match(html, /Bank beneficiary matches the company<\/strong> — needs attention: Provide bank evidence/)
  assert.match(html, /Tax identifier is valid for the country and evidenced<\/strong> — passed/)
})

test('a rejection explains the recorded reason to the supplier', () => {
  const html = renderToStaticMarkup(createElement(DecisionSummary, { supplier: true, detail: detail('REJECTED', {
    decisions: [{ at: '2026-11-10T00:00:00.000Z', outcome: 'REJECT', rationale: 'Ownership chain includes a sanctioned party.' }],
  }) }))
  assert.match(html, /Rejected on Nov 10, 2026\. Reason: Ownership chain includes a sanctioned party\./)
  assert.doesNotMatch(html, /decision-reasons/)
})

test('audit history exports as CSV with quoted cells', () => {
  const csv = Workspace.auditCsv([{ action: 'APPROVED', actorId: 'u"1', at: '2026-11-10T00:00:00.000Z', id: 'a', requestId: 'r' }])
  assert.equal(csv, 'at,action,actor_id,request_id\n"2026-11-10T00:00:00.000Z","APPROVED","u""1","r"')
})
