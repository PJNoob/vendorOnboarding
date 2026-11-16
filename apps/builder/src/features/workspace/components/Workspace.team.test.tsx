import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { Workspace } from './Workspace'

function renderTeam(empty = false) {
  class TeamWorkspace extends Workspace {
    constructor(props: Workspace['props']) {
      super(props)
      this.state = {
        ...this.state, view: 'team', loading: false, email: 'admin@example.test', tenantId: 'workspace',
        memberships: [{ id: 'admin-membership', role: 'ADMIN', tenantId: 'workspace' }],
        teamDirectory: {
          members: empty ? [] : [{ id: 'previous-membership', name: 'Previous Member', email: 'reviewer@example.test', role: 'REVIEWER' }],
          suppliers: empty ? [] : [{ id: 'previous-access', name: 'Previous Supplier', email: 'supplier@example.test', caseId: 'case', requestedSite: 'Lab services' }],
        },
      }
    }
  }
  return renderToStaticMarkup(createElement(TeamWorkspace, { countries: [] }))
}

test('Team & access displays previously enrolled members and existing supplier contacts alongside management forms', () => {
  const html = renderTeam()
  for (const value of ['Team members (1)', 'Previous Member', 'reviewer@example.test', 'Reviewer', 'previous-membership', 'Supplier contacts (1)', 'Previous Supplier', 'supplier@example.test', 'Lab services', 'Enroll team member', 'Refresh access']) assert.ok(html.includes(value), value)
})

test('empty access lists explain that no users currently have access', () => {
  const html = renderTeam(true)
  assert.ok(html.includes('No team members currently have access.'))
  assert.ok(html.includes('No supplier contacts currently have access.'))
})
