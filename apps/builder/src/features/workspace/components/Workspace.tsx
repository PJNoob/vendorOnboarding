import { createAuthClient } from 'better-auth/react'
import { emailOTPClient } from 'better-auth/client/plugins'
import { Component, type FormEvent, type ReactNode } from 'react'
import type { z } from 'zod'

import { inputs, type Output, Values } from '@neo/schemas'

import { ApiClient } from '@/lib/trpc'

type Detail = Output<'detail'>
type Role = Output<'identity'>['memberships'][number]['role']
type Action = (form: FormData) => Promise<void>
type DraftChange = z.infer<typeof inputs.save>['change']
type Field = { name: string; label: string; type?: string; options?: readonly string[] }
type State = {
  analytics?: Output<'analytics'>
  busy: boolean
  cases: Output<'list'>['items']
  detail?: Detail
  email: string
  error: string
  history: Output<'audit'>['items']
  memberships: Output<'identity'>['memberships']
  otpSent: boolean
  tenantId: string
  token: string
}

export class Workspace extends Component<{ demoAuth?: boolean }, State> {
  static readonly AUTH = createAuthClient({ plugins: [emailOTPClient()] })
  static readonly COMPANY: Field[] = [
    { label: 'Legal name', name: 'legalName' }, { label: 'Registration ID', name: 'registryId' },
    { label: 'Jurisdiction', name: 'jurisdiction' }, { label: 'Country', name: 'country', options: Values.COUNTRIES },
    { label: 'Street address', name: 'addressLine1' }, { label: 'City', name: 'city' },
    { label: 'Contact name', name: 'contactName' }, { label: 'Contact email', name: 'contactEmail', type: 'email' },
  ]
  static readonly BANK: Field[] = [
    { label: 'Beneficiary', name: 'beneficiary' }, { label: 'Country', name: 'country', options: Values.COUNTRIES },
    { label: 'Currency', name: 'currency' }, { label: 'Account number', name: 'account', type: 'password' },
    { label: 'Routing number', name: 'routing', type: 'password' },
  ]
  static readonly TAX: Field[] = [
    { label: 'Form', name: 'formType', options: Values.TAX_FORMS },
    { label: 'Tax ID', name: 'taxId', type: 'password' },
    { label: 'VAT registered', name: 'vatRegistered', options: ['false', 'true'] },
    { label: 'VAT TRN', name: 'vatTrn', type: 'password' },
  ]
  static readonly POLL_MS = 4_000
  private timer?: ReturnType<typeof setTimeout>
  private active = false
  state: State = { busy: false, cases: [], email: '', error: '', history: [], memberships: [], otpSent: false, tenantId: '', token: '' }

  private api() {
    return ApiClient.create(this.state.tenantId)
  }

  private async command(action: Action, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    this.setState({ busy: true, error: '' })
    await action(data).then(undefined, this.report.bind(this))
    this.setState({ busy: false })
  }

  private draft(detail: Detail) {
    return { ...this.version(detail), expectedDraftRevision: detail.draftRevision, submissionId: detail.submissionId }
  }

  private fields(fields: Field[], values: Record<string, unknown> = {}) {
    return fields.map(({ label, name, options, type }) => (
      <label key={name}>{label}
        {options
          ? <select defaultValue={String(values[name] ?? options[0])} name={name}>{options.map((option) => <option key={option}>{option}</option>)}</select>
          : <input defaultValue={type === 'password' ? '' : String(values[name] ?? '')} name={name} type={type ?? 'text'} />}
      </label>
    ))
  }

  private form(title: string, action: Action, body: ReactNode, key = title) {
    return <form key={key} onSubmit={this.command.bind(this, action)}><h3>{title}</h3>{body}<button disabled={this.state.busy}>{title}</button></form>
  }

  private object(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
  }

  private async open(caseId: string) {
    const detail = await (this.state.tenantId ? this.api().cases.get.query({ caseId }) : this.api().supplier.get.query({ caseId }))
    this.setState({ detail, history: [] })
  }

  private async poll() {
    const detail = this.state.detail
    if (this.active && detail && !this.state.busy && ['PENDING', 'SUBMITTED'].includes(detail.case.status)) {
      const run = await this.api().runs.get.query({ caseId: detail.case.caseId }).then((value) => value, () => undefined)
      if (run && this.state.detail?.case.caseId === detail.case.caseId) {
        const status = run.stages.find((stage) => stage.name === 'Decision')?.state
        if (status !== detail.case.status) await this.open(detail.case.caseId).then(undefined, this.report.bind(this))
        else this.setState({ detail: { ...detail, run } })
      }
    }
    if (this.active) this.timer = setTimeout(this.poll.bind(this), Workspace.POLL_MS)
  }

  private report(error: unknown) {
    this.setState({ error: error instanceof Error ? error.message : 'Request could not be completed.' })
  }

  private async refresh() {
    const identity = await this.api().identity.me.query({}).then((result) => result, () => undefined)
    if (!identity) return
    const tenantId = identity.memberships.find((member) => member.tenantId === this.state.tenantId)?.tenantId
      ?? identity.memberships[0]?.tenantId ?? ''
    this.setState({ email: identity.email, memberships: identity.memberships, tenantId })
    const api = ApiClient.create(tenantId)
    if (tenantId) {
      const now = new Date()
      const from = new Date(now.getTime() - 30 * 86_400_000)
      const [analytics, cases] = await Promise.all([
        api.analytics.summary.query({ from: from.toISOString(), to: now.toISOString() }), api.cases.list.query({ limit: 25 }),
      ])
      this.setState({ analytics, cases: cases.items })
    } else {
      const cases = await api.supplier.cases.query({})
      this.setState({ cases: cases.items })
    }
  }

  private async save(detail: Detail, change: DraftChange) {
    await this.api().supplier.saveDraft.mutate({ ...this.draft(detail), change })
    await this.open(detail.case.caseId)
  }

  private version(detail: Detail) {
    return { caseId: detail.case.caseId, expectedCaseRevision: detail.case.revision, idempotencyKey: crypto.randomUUID() }
  }

  private viewBuyer(detail: Detail, role: Role) {
    const version = this.version(detail)
    const input = { ...version, submissionId: detail.submissionId }
    const invitation = this.object(detail.values.invitation)
    const managing = role === 'ADMIN' || role === 'BUYER'
    return <>
      {managing && ['DRAFT', 'INVITED'].includes(detail.case.status) && this.form('Reissue invitation', async () => {
        await this.api().invitations.reissue.mutate(version)
        await this.open(version.caseId)
      }, null)}
      {managing && detail.case.status === 'INVITED' && typeof invitation.id === 'string' && this.form('Revoke invitation', async () => {
        await this.api().invitations.revoke.mutate({ ...version, invitationId: String(invitation.id) })
        await this.open(version.caseId)
      }, null)}
      {managing && Array.isArray(detail.values.access) && detail.values.access.map((entry) => {
        const userId = String(this.object(entry).userId)
        return this.form('Revoke supplier access', async () => {
          await this.api().access.revoke.mutate({ ...version, userId })
          await this.open(version.caseId)
        }, <p>{userId}</p>, userId)
      })}
      {detail.case.status === 'PENDING' && <>
        {(role === 'BUYER' || role === 'REVIEWER') && this.form('Request changes', async (form) => {
          await this.api().cases.requestChanges.mutate({ ...input, message: String(form.get('message')) })
          await this.open(version.caseId)
        }, <label>Supplier instructions<textarea name="message" required /></label>)}
        {role === 'REVIEWER' && this.form('Record decision', async (form) => {
          const outcome = form.get('outcome') === 'APPROVE' ? 'APPROVE' : 'REJECT'
          await this.api().reviews.decide.mutate({ ...input, outcome, rationale: String(form.get('rationale')) })
          await this.open(version.caseId)
          await this.refresh()
        }, <><label>Outcome<select name="outcome"><option>APPROVE</option><option>REJECT</option></select></label>
          <label>Rationale<textarea name="rationale" required /></label></>)}
        {detail.issues.filter((issue) => role === 'COMPLIANCE' ? issue.owner === 'COMPLIANCE' : role === 'REVIEWER' && issue.owner !== 'COMPLIANCE').map((issue) =>
          this.form('Resolve issue', async (form) => {
            const resolution = { ...input, evidenceDocumentIds: form.getAll('document').map(String), issueId: issue.id, rationale: String(form.get('rationale')) }
            if (role === 'COMPLIANCE') await this.api().compliance.resolve.mutate({ ...resolution, disposition: form.get('disposition') === 'CONFIRMED' ? 'CONFIRMED' : 'CLEARED' })
            else await this.api().reviews.resolveIssue.mutate(resolution)
            await this.open(version.caseId)
          }, <><p>{issue.code}</p>
            {role === 'COMPLIANCE' && <label>Disposition<select name="disposition"><option>CONFIRMED</option><option>CLEARED</option></select></label>}
            <label>Supporting documents<select multiple name="document" required>{detail.documents.filter((doc) => doc.status === 'CLEAN')
              .map((doc) => <option key={doc.id} value={doc.id}>{doc.kind} {doc.id}</option>)}</select></label>
            <label>Rationale<textarea name="rationale" required /></label></>, issue.id))}
      </>}
      {role === 'ADMIN' && Array.isArray(detail.values.work) && detail.values.work.map((entry) => {
        const work = this.object(entry)
        return this.form('Retry work', async (form) => {
          await this.api().work.retry.mutate({ idempotencyKey: crypto.randomUUID(), reason: String(form.get('reason')), workItemId: String(work.id) })
          await this.open(version.caseId)
        }, <><p>{String(work.kind)}</p><label>Reason<textarea name="reason" required /></label></>, String(work.id))
      })}
      {this.form('Load audit history', async () => {
        const result = await this.api().audit.list.query({ caseId: version.caseId, limit: 25 })
        this.setState({ history: result.items })
      }, <ul>{this.state.history.map((event) => <li key={event.id}>{event.at} · {event.action}</li>)}</ul>)}
    </>
  }

  private viewSupplier(detail: Detail) {
    if (detail.case.status === 'PENDING' && detail.issues.some((issue) => issue.message)) {
      return this.form('Start correction', async () => {
        await this.api().supplier.beginRevision.mutate(this.version(detail))
        await this.open(detail.case.caseId)
      }, null)
    }
    if (detail.case.status !== 'DRAFT') return null
    return <>
      {(['company', 'bank', 'tax'] as const).map((section) => this.form(`Save ${section}`, async (form) => {
        const fields = Object.fromEntries([...form.entries()].filter(([, value]) => value !== ''))
        if (section === 'company') await this.save(detail, { section, value: inputs.save.shape.change.options[1].shape.value.parse(fields) })
        if (section === 'bank') await this.save(detail, { section, value: inputs.save.shape.change.options[0].shape.value.parse(fields) })
        if (section === 'tax') await this.save(detail, { section, value: inputs.save.shape.change.options[4].shape.value.parse({ ...fields, vatRegistered: fields.vatRegistered === 'true' }) })
      }, this.fields({ bank: Workspace.BANK, company: Workspace.COMPANY, tax: Workspace.TAX }[section], this.object(detail.values[section])), `${detail.submissionId}-${section}`))}
      {this.form('Save qualifications', async (form) => {
        const value: unknown = JSON.parse(String(form.get('json')))
        await this.save(detail, inputs.save.shape.change.parse({ section: 'qualifications', value }))
      }, <label>Qualifications JSON<textarea defaultValue={JSON.stringify(detail.values.qualifications, null, 2)} name="json" /></label>, `${detail.submissionId}-qualifications`)}
      {this.form('Save ownership', async (form) => {
        const value: unknown = JSON.parse(String(form.get('json')))
        await this.save(detail, inputs.save.shape.change.parse({ section: 'ownership', value }))
      }, <label>Ownership JSON<textarea defaultValue={JSON.stringify(detail.values.ownership ?? { edges: [], entities: [] }, null, 2)} name="json" /></label>, `${detail.submissionId}-ownership`)}
      {this.form('Upload PDF', async (form) => {
        const file = form.get('file')
        if (!(file instanceof File)) throw new Error('select a PDF file')
        const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
        const sha256 = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
        const reservation = await this.api().documents.reserve.mutate(inputs.reserve.parse({
          ...this.draft(detail), kind: form.get('kind'), sha256, sizeBytes: file.size,
        }))
        const response = await fetch(reservation.url, { body: file, headers: reservation.headers, method: 'PUT' })
        if (!response.ok) throw new Error('upload was not accepted')
        await this.api().documents.complete.mutate({
          ...this.draft(detail), documentId: reservation.id, expectedDraftRevision: reservation.revision,
        })
        await this.open(detail.case.caseId)
      }, <><label>Evidence type<select name="kind">{detail.required.map((kind) => <option key={kind}>{kind}</option>)}</select></label>
        <label>PDF<input accept="application/pdf" name="file" required type="file" /></label></>)}
      {this.form('Submit for review', async (form) => {
        if (form.get('attested') !== 'on') throw new Error('confirm the supplier attestation')
        await this.api().supplier.submit.mutate({ ...this.draft(detail), attested: true })
        await this.open(detail.case.caseId)
        await this.refresh()
      }, <label><input name="attested" required type="checkbox" /> I confirm these details are accurate and authorized.</label>)}
    </>
  }

  componentDidMount() {
    this.active = true
    const token = window.location.hash.slice(1)
    if (token) {
      this.setState({ token })
      window.history.replaceState({}, '', window.location.pathname)
    }
    this.refresh().then(this.poll.bind(this), this.report.bind(this))
  }

  componentWillUnmount() {
    this.active = false
    clearTimeout(this.timer)
  }

  render() {
    const { analytics, cases, detail, email, error, memberships, otpSent, tenantId, token } = this.state
    const role = memberships.find((member) => member.tenantId === tenantId)?.role
    return <><header>Harbor BioLabs <span>Vendor onboarding</span></header><main>
      <h1>{role ? 'Procurement workspace' : 'Supplier portal'}</h1>
      {error && <p role="alert">{error}</p>}
      {!email && <section>
        {this.props.demoAuth && this.form('Sign in as demo admin', async () => {
          const result = await fetch('/api/auth/sign-in/demo', { method: 'POST' })
          if (!result.ok) {
            const error = await result.json().catch(() => null)
            throw new Error(error?.message ?? 'Could not sign in as demo admin.')
          }
          await this.refresh()
        }, null)}
        {this.form('Sign in with Google', async () => {
          await Workspace.AUTH.signIn.social({ callbackURL: '/', provider: 'google' })
        }, <p>For enrolled buyer team members.</p>)}
        {!otpSent ? this.form('Email a sign-in code', async (form) => {
          const result = await Workspace.AUTH.emailOtp.sendVerificationOtp({ email: String(form.get('email')), type: 'sign-in' })
          if (result.error) throw new Error('could not send the verification code')
          this.setState({ otpSent: true })
        }, <label>Supplier email<input name="email" required type="email" /></label>) : this.form('Verify code', async (form) => {
          const result = await Workspace.AUTH.signIn.emailOtp({ email: String(form.get('email')), otp: String(form.get('otp')) })
          if (result.error) throw new Error('verification code is invalid or expired')
          await this.refresh()
        }, <><label>Supplier email<input name="email" required type="email" /></label><label>Code<input name="otp" required /></label></>)}
      </section>}
      {email && <>
        {this.form('Sign out', async () => {
          await Workspace.AUTH.signOut()
          window.location.assign('/')
        }, <p>{email}</p>)}
        {token && this.form('Accept invitation', async () => {
          const result = await this.api().invitations.redeem.mutate({ idempotencyKey: crypto.randomUUID(), token })
          this.setState({ token: '' })
          await this.refresh()
          await this.open(result.id)
        }, null)}
        {memberships.length > 1 && this.form('Switch workspace', async (form) => {
          const tenantId = String(form.get('tenantId'))
          await this.api().identity.selectTenant.mutate({ idempotencyKey: crypto.randomUUID(), tenantId })
          await new Promise<void>((resolve) => this.setState({ detail: undefined, tenantId }, resolve))
          await this.refresh()
        }, <label>Workspace<select name="tenantId" defaultValue={tenantId}>{memberships.map((member) => <option key={member.tenantId}>{member.tenantId}</option>)}</select></label>)}
        {(role === 'ADMIN' || role === 'BUYER') && this.form('Invite supplier', async (form) => {
          const result = await this.api().cases.create.mutate(inputs.create.parse({
            ...Object.fromEntries(form.entries()), category: 'CALIBRATION', idempotencyKey: crypto.randomUUID(),
          }))
          await this.refresh()
          await this.open(result.id)
        }, this.fields([{ label: 'Supplier email', name: 'supplierEmail', type: 'email' }, { label: 'Requested service site', name: 'requestedSite' },
          { label: 'Country', name: 'country', options: Values.COUNTRIES }]))}
        {role === 'ADMIN' && <>
          {this.form('Enroll team member', async (form) => {
            await this.api().team.enroll.mutate(inputs.enroll.parse({ ...Object.fromEntries(form.entries()), idempotencyKey: crypto.randomUUID() }))
          }, this.fields([{ label: 'Buyer email', name: 'email', type: 'email' }, { label: 'Role', name: 'role', options: Values.BUYER_ROLES }]))}
          <ul>{memberships.map((member) => <li key={member.id}>{member.role} · {member.id}</li>)}</ul>
          {this.form('Change team role', async (form) => {
            await this.api().team.setRole.mutate(inputs.role.parse({ ...Object.fromEntries(form.entries()), idempotencyKey: crypto.randomUUID() }))
          }, this.fields([{ label: 'Membership ID', name: 'membershipId' }, { label: 'Role', name: 'role', options: Values.BUYER_ROLES }]))}
          {this.form('Revoke team access', async (form) => {
            await this.api().team.revoke.mutate(inputs.member.parse({ ...Object.fromEntries(form.entries()), idempotencyKey: crypto.randomUUID() }))
          }, this.fields([{ label: 'Membership ID', name: 'membershipId' }]))}
        </>}
        {analytics && <section className="metrics">
          <div><strong>{analytics.supplierAction}</strong>Supplier action</div><div><strong>{analytics.reviewerAction}</strong>Reviewer action</div>
          <div><strong>{analytics.completed ? analytics.medianHours.toFixed(1) : '—'}</strong>Median completion hours</div>
          <div><strong>{(analytics.reworkRate * 100).toFixed(0)}%</strong>Rework rate</div>
        </section>}
        <section><h2>Cases</h2>
          {!cases.length && <p>No cases are available.</p>}
          {cases.map((row) => <button className="case" key={row.caseId} onClick={() => this.open(row.caseId).then(undefined, this.report.bind(this))}>
            <span>{row.name || row.requestedSite}</span><span>{row.status}</span>
          </button>)}
        </section>
        {detail && <section><h2>{detail.case.name || detail.case.requestedSite}</h2>
          <p>{detail.case.status} · Submission {detail.case.number}</p>
          <ol className="stages" aria-live="polite">{detail.run.stages.map((stage) => <li key={stage.name}>{stage.name}<strong>{stage.state}</strong></li>)}</ol>
          {detail.issues.map((issue) => <p key={issue.id}>{issue.message || issue.code}</p>)}
          {detail.checks.map((check, index) => <p key={`${check.rule}-${index}`}>{check.rule} · {check.result} · {check.source} · {check.code}
            {check.evidence.length > 0 && ` · pages ${check.evidence.map((item) => item.page).join(', ')}`}</p>)}
          <h3>Documents</h3>
          {detail.documents.map((doc) => <div key={doc.id}>{doc.kind} · {doc.status}
            {doc.status === 'CLEAN' && (!role || role === 'REVIEWER' || role === 'COMPLIANCE' && doc.kind === 'OWNERSHIP') &&
              <button onClick={() => this.api().documents.download.mutate({ caseId: detail.case.caseId, documentId: doc.id })
                .then((result) => window.location.assign(result.url), this.report.bind(this))}>Download</button>}
            {!role && detail.case.status === 'DRAFT' && <button onClick={() => this.api().documents.remove.mutate({ ...this.draft(detail), documentId: doc.id })
              .then(() => this.open(detail.case.caseId)).then(undefined, this.report.bind(this))}>Remove</button>}
          </div>)}
          {this.form('Refresh case', async () => this.open(detail.case.caseId), null)}
          {role ? this.viewBuyer(detail, role) : this.viewSupplier(detail)}
        </section>}
      </>}
    </main></>
  }
}
