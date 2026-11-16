import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

import { inputs } from '@neo/schemas'
import { Workspace } from './Workspace'

function fixture() {
  const workspace = new Workspace({ countries: [] })
  mock.method(workspace, 'setState', (update: Partial<Workspace['state']>) => Object.assign(workspace.state, update))
  let message = ''
  let reports = 0
  const input = {
    type: 'email', value: '1325ye6t',
    setCustomValidity(value: string) { message = value },
    reportValidity() { reports++; return false },
  }
  return { workspace, input, message: () => message, reports: () => reports }
}

test('invalid email shows an error on blur and clears it while correcting the field', () => {
  const { workspace, input, message } = fixture()
  const form = workspace['form']('Invite', async () => {}, null)
  form.props.onBlurCapture({ target: input })
  assert.equal(workspace.state.error, 'Enter a valid mail')
  assert.equal(message(), 'Enter a valid mail')
  input.value = 'supplier@example.com'
  form.props.onInputCapture({ target: input })
  assert.equal(workspace.state.error, '')
  assert.equal(message(), '')
})

test('invalid email blocks the action even if native browser validation is bypassed', async () => {
  const { workspace, input, reports } = fixture()
  let calls = 0
  const form = workspace['form']('Invite', async () => { calls++ }, null)
  for (const value of ['', '1325ye6t', 'supplier@example']) {
    input.value = value
    await form.props.onSubmit({ preventDefault() {}, currentTarget: { querySelectorAll: () => [input] } })
    assert.equal(workspace.state.error, 'Enter a valid mail')
    assert.equal(workspace.state.busy, false)
  }
  assert.equal(calls, 0)
  assert.equal(reports(), 3)
})

test('direct API inputs reject malformed supplier emails with the requested message', () => {
  for (const value of ['', '1325ye6t', 'supplier@example']) {
    const result = inputs.create.shape.supplierEmail.safeParse(value)
    assert.equal(result.success, false)
    if (!result.success) assert.equal(result.error.issues[0].message, 'Enter a valid mail')
  }
  assert.equal(inputs.create.shape.supplierEmail.safeParse('supplier@example.com').success, true)
})


test('queued and invalid suppliers are never labeled as already invited', () => {
  const row = {
    caseId: 'case', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    name: '', number: 1, requestedSite: 'Site', revision: 0, status: 'INVITED' as const,
  }
  assert.equal(Workspace.supplierStatus({ ...row, invitationDelivery: 'QUEUED' }), 'Queued for email check')
  assert.equal(Workspace.supplierStatus({ ...row, invitationDelivery: 'CHECKING' }), 'Checking email')
  assert.equal(Workspace.supplierStatus({ ...row, invitationDelivery: 'INVALID' }), 'Failed — invalid supplier credentials')
  assert.equal(Workspace.supplierStatus({ ...row, invitationDelivery: 'SENT' }), 'Invited')
  assert.equal(Workspace.supplierStatusClass({ ...row, invitationDelivery: 'INVALID' }), 'rejected')
  assert.equal(Workspace.supplierStatusClass({ ...row, invitationDelivery: 'VERIFICATION_FAILED' }), 'rejected')
})
