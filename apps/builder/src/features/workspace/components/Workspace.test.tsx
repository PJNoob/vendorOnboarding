import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { Workspace } from './Workspace'

test('supplier invitation renders every country from the directory', () => {
  class InvitationWorkspace extends Workspace {
    constructor(props: Workspace['props']) {
      super(props)
      this.state = {
        ...this.state, email: 'buyer@example.test', loading: false, tenantId: 'workspace', showInvite: true,
        memberships: [{ id: 'membership', role: 'ADMIN', tenantId: 'workspace' }],
      }
    }
  }
  const countries = [
    { code: 'AE', name: 'United Arab Emirates' }, { code: 'GB', name: 'United Kingdom' },
    { code: 'IN', name: 'India' }, { code: 'US', name: 'United States' },
  ]
  const html = renderToStaticMarkup(createElement(InvitationWorkspace, { countries }))
  const select = html.match(/<select[^>]*name="country"[^>]*>([\s\S]*?)<\/select>/)?.[1]
  assert.ok(select, 'render the actual supplier invitation country select')
  assert.equal((select.match(/<option/g) ?? []).length, countries.length)
  assert.match(select, /value="IN"[^>]*>India<\/option>/)
  assert.match(select, /value="GB"[^>]*>United Kingdom<\/option>/)
})
