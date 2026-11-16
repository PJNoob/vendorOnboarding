import { createAuthClient } from 'better-auth/react'
import { emailOTPClient } from 'better-auth/client/plugins'
import { Component, type FormEvent, type ReactNode } from 'react'
import { ZodError, type z } from 'zod'

import { inputs, type Output, Values } from '@neo/schemas'

import { ApiClient } from '@/lib/trpc'
import { Icon } from './Icon'
import { OwnershipFields, QualificationFields } from './ProfileFields'
import Head from 'next/head'

type Detail = Output<'detail'>
type Role = Output<'identity'>['memberships'][number]['role']
type Action = (form: FormData) => Promise<void>
type DraftChange = z.infer<typeof inputs.save>['change']
type Field = { name: string; label: string; type?: string; options?: readonly string[] }
type State = {
  view: 'overview' | 'suppliers' | 'reviews' | 'team'
  search: string
  filter: string
  supplierStep: number
  showInvite: boolean
  notice: string
  loading: boolean
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
  state: State = { view: 'overview', search: '', filter: 'ALL', supplierStep: 0, showInvite: false, notice: '', loading: true, busy: false, cases: [], email: '', error: '', history: [], memberships: [], otpSent: false, tenantId: '', token: '' }

  private api() {
    return ApiClient.create(this.state.tenantId)
  }

  private async command(action: Action, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    this.setState({ busy: true, error: '', notice: '' })
    await action(data).then(() => this.setState({ notice: 'Action completed successfully.' }), this.report.bind(this))
    this.setState({ busy: false })
  }

  private draft(detail: Detail) {
    return { ...this.version(detail), expectedDraftRevision: detail.draftRevision, submissionId: detail.submissionId }
  }

  private fields(fields: Field[], values: Record<string, unknown> = {}) {
    return fields.map(({ label, name, options, type }) => (
      <label key={name}>{label}
        {options
          ? <select defaultValue={String(values[name] ?? options[0])} name={name}>{options.map((option) => <option key={option} value={option}>{({ US: 'United States', AE: 'United Arab Emirates', false: 'No', true: 'Yes', W9: 'W-9', W8BEN_E: 'W-8BEN-E', OTHER_REVIEW: 'Other (manual review)' } as Record<string, string>)[option] ?? Workspace.label(option)}</option>)}</select>
          : <input defaultValue={type === 'password' ? '' : String(values[name] ?? '')} name={name} type={type ?? 'text'} />}
      </label>
    ))
  }

  private form(title: string, action: Action, body: ReactNode, key = title) {
    return <form className="workspace-form" key={key} onSubmit={this.command.bind(this, action)}><h3>{title}</h3>{body}<button disabled={this.state.busy}>{title}</button></form>
  }

  private object(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
  }

  private async open(caseId: string) {
    const detail = await (this.state.tenantId ? this.api().cases.get.query({ caseId }) : this.api().supplier.get.query({ caseId }))
    this.setState((state) => ({ detail, history: [], supplierStep: state.detail?.case.caseId === caseId ? state.supplierStep : 0 }))
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
    this.setState({ error: error instanceof ZodError ? `Check ${error.issues[0]?.path.join(' › ') || 'your details'}: ${error.issues[0]?.message || 'Complete all required fields.'}` : error instanceof Error ? error.message : 'Request could not be completed. Please try again.' })
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
    return <div className="supplier-editor" data-step={this.state.supplierStep}>
      <nav className="supplier-steps" aria-label="Application steps">{['Company', 'Banking', 'Tax', 'Qualifications', 'Ownership', 'Documents', 'Submit'].map((step, index) => <button type="button" key={step} className={this.state.supplierStep === index ? 'active' : ''} aria-current={this.state.supplierStep === index ? 'step' : undefined} onClick={() => this.setState({ supplierStep: index })}><span>{index + 1}</span>{step}</button>)}</nav>
      <p className="muted">Complete each section and save your changes before moving to the next step.</p>
      {(['company', 'bank', 'tax'] as const).map((section) => this.form(`Save ${section}`, async (form) => {
        const fields = Object.fromEntries([...form.entries()].filter(([, value]) => value !== ''))
        if (section === 'company') await this.save(detail, { section, value: inputs.save.shape.change.options[1].shape.value.parse(fields) })
        if (section === 'bank') await this.save(detail, { section, value: inputs.save.shape.change.options[0].shape.value.parse(fields) })
        if (section === 'tax') await this.save(detail, { section, value: inputs.save.shape.change.options[4].shape.value.parse({ ...fields, vatRegistered: fields.vatRegistered === 'true' }) })
      }, this.fields({ bank: Workspace.BANK, company: Workspace.COMPANY, tax: Workspace.TAX }[section], this.object(detail.values[section])), `${detail.submissionId}-${section}`))}
      {this.form('Save qualifications', async (form) => {
        const value: unknown = JSON.parse(String(form.get('json')))
        await this.save(detail, inputs.save.shape.change.parse({ section: 'qualifications', value }))
      }, <QualificationFields value={detail.values.qualifications} />, `${detail.submissionId}-qualifications`)}
      {this.form('Save ownership', async (form) => {
        const value: unknown = JSON.parse(String(form.get('json')))
        await this.save(detail, inputs.save.shape.change.parse({ section: 'ownership', value }))
      }, <OwnershipFields value={detail.values.ownership} />, `${detail.submissionId}-ownership`)}
      {this.form('Upload supporting document', async (form) => {
        const file = form.get('file')
        if (!(file instanceof File) || !file.size) throw new Error('Select a PDF file to continue.')
        if (file.type !== 'application/pdf' || file.size > Values.MAX_FILE) throw new Error('Choose a PDF file smaller than 10 MB.')
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
      }, <><label>Evidence type<select name="kind">{detail.required.map((kind) => <option key={kind} value={kind}>{Workspace.label(kind)}</option>)}</select></label>
        <p className="muted">Upload a PDF up to 10 MB for each required evidence type. Files are checked before they can be reviewed.</p><label>PDF document<input accept="application/pdf" name="file" required type="file" /></label></>)}
      {this.form('Submit for review', async (form) => {
        if (form.get('attested') !== 'on') throw new Error('confirm the supplier attestation')
        await this.api().supplier.submit.mutate({ ...this.draft(detail), attested: true })
        await this.open(detail.case.caseId)
        await this.refresh()
      }, <label className="checkbox-label"><input name="attested" required type="checkbox" /> I confirm these details are accurate and authorized.</label>)}
      <div className="step-controls"><button className="button-secondary" disabled={this.state.supplierStep === 0} onClick={() => this.setState({ supplierStep: this.state.supplierStep - 1 })}>Previous step</button><span>Step {this.state.supplierStep + 1} of 7</span><button disabled={this.state.supplierStep === 6} onClick={() => this.setState({ supplierStep: this.state.supplierStep + 1 })}>Next step <Icon name="arrow" /></button></div>
    </div>
  }

  componentDidMount() {
    this.active = true
    const token = window.location.hash.slice(1)
    if (token) {
      this.setState({ token })
      window.history.replaceState({}, '', window.location.pathname)
    }
    this.refresh().then(this.poll.bind(this), this.report.bind(this)).finally(() => this.setState({ loading: false }))
  }

  componentWillUnmount() {
    this.active = false
    clearTimeout(this.timer)
  }

  private signIn() {
    return <div className="auth-layout">
      <div className="auth-story"><span className="brand"><span className="brand-mark"><Icon name="harbor" /></span>Harbor BioLabs</span>
        <div><span className="auth-tag">Supplier partnerships, built on trust</span><h1>Great science starts<br />with the right partners.</h1><p>A clear path from first introduction to an approved partnership. Everything you need, together in one workspace.</p>
          <ol className="auth-journey">{[['Connect', 'Accept your invitation and meet your team.'], ['Share', 'Add your business details and supporting documents.'], ['Move forward', 'Track verification and your onboarding decision.']].map(([title, body], i) => <li key={title}><span>{i + 1}</span><div><strong>{title}</strong><p>{body}</p></div></li>)}</ol>
        </div><small>Harbor BioLabs · Procurement & supplier operations</small>
      </div>
      <div className="auth-panel"><div className="auth-card"><span className="auth-symbol"><Icon name="shield" /></span><h2>Welcome to Harbor</h2><p className="muted">Sign in to continue your onboarding journey.</p>
        {this.state.error && <p role="alert">{this.state.error}</p>}
        {!this.state.otpSent ? this.form('Email a sign-in code', async (form) => {
          const email = String(form.get('email'))
          const result = await Workspace.AUTH.emailOtp.sendVerificationOtp({ email, type: 'sign-in' })
          if (result.error) throw new Error('Could not send your code. Check your email address and try again.')
          this.setState({ otpSent: true, email: '', notice: '', token: this.state.token })
          this.signInEmail = email
        }, <label>Work email<input autoComplete="email" placeholder="you@company.com" name="email" required type="email" /></label>) : this.form('Verify code', async (form) => {
          const result = await Workspace.AUTH.signIn.emailOtp({ email: this.signInEmail, otp: String(form.get('otp')) })
          if (result.error) throw new Error('Your code is invalid or expired. Please try again.')
          await this.refresh()
        }, <><p className="muted">Enter the code sent to {this.signInEmail}.</p><label>Verification code<input autoComplete="one-time-code" inputMode="numeric" name="otp" required /></label><button type="button" className="text-button" onClick={() => this.setState({ otpSent: false })}>Use another email</button></>)}
        <div className="auth-divider">For the Harbor team</div>
        {this.form('Continue with Google', async () => { await Workspace.AUTH.signIn.social({ callbackURL: '/', provider: 'google' }) }, null)}
        {this.props.demoAuth && this.form('Sign in to demo workspace', async (form) => {
          const result = await fetch('/api/auth/sign-in/demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: String(form.get('demoEmail')), password: String(form.get('demoPassword')) }) })
          if (!result.ok) {
            const failure = await result.json().catch(() => null)
            throw new Error(failure?.message ?? 'Could not open the demo workspace.')
          }
          await this.refresh()
        }, <><p className="muted">Local testing · Use your demo credentials to explore the procurement workspace.</p><label>Demo email<input name="demoEmail" type="email" autoComplete="username" defaultValue="demo-admin@example.test" required /></label><label>Demo password<input name="demoPassword" type="password" autoComplete="current-password" placeholder="Enter your demo password" required /></label></>)}
        <p className="auth-footnote"><Icon name="lock" /> Secure access to your supplier workspace</p>
      </div></div>
    </div>
  }

  private signInEmail = ''

  private team() {
    return <section className="panel"><div className="panel-heading"><div><h2>Team & access</h2><p>Give the right people a role in every decision.</p></div><Icon name="team" /></div><div className="team-forms">
      {this.form('Enroll team member', async (form) => {
        await this.api().team.enroll.mutate(inputs.enroll.parse({ ...Object.fromEntries(form.entries()), idempotencyKey: crypto.randomUUID() }))
      }, this.fields([{ label: 'Work email', name: 'email', type: 'email' }, { label: 'Role', name: 'role', options: Values.BUYER_ROLES }]))}
      {this.form('Change team role', async (form) => {
        await this.api().team.setRole.mutate(inputs.role.parse({ ...Object.fromEntries(form.entries()), idempotencyKey: crypto.randomUUID() }))
      }, this.fields([{ label: 'Membership ID', name: 'membershipId' }, { label: 'Role', name: 'role', options: Values.BUYER_ROLES }]))}
      {this.form('Revoke team access', async (form) => {
        await this.api().team.revoke.mutate(inputs.member.parse({ ...Object.fromEntries(form.entries()), idempotencyKey: crypto.randomUUID() }))
      }, this.fields([{ label: 'Membership ID', name: 'membershipId' }]))}
    </div></section>
  }

  render() {
    const { analytics, cases, detail, email, error, memberships, tenantId, token, view, search, filter, notice, loading } = this.state
    const role = memberships.find((member) => member.tenantId === tenantId)?.role
    const canInvite = role === 'ADMIN' || role === 'BUYER'
    const pending = cases.filter((row) => ['PENDING', 'SUBMITTED'].includes(row.status))
    const visible = cases.filter((row) => (view !== 'reviews' || ['PENDING', 'SUBMITTED'].includes(row.status)) && (filter === 'ALL' || row.status === filter) && `${row.name} ${row.requestedSite} ${row.number}`.toLowerCase().includes(search.toLowerCase()))
    const nav: { id: State['view']; label: string; icon: string }[] = [{ id: 'overview', label: 'Overview', icon: 'grid' }, { id: 'suppliers', label: role ? 'Suppliers' : 'My applications', icon: 'suppliers' }, ...(role ? [{ id: 'reviews' as const, label: 'Review queue', icon: 'check' }] : []), ...(role === 'ADMIN' ? [{ id: 'team' as const, label: 'Team & access', icon: 'team' }] : [])]
    return <><Head><title>Harbor | Supplier onboarding</title><meta name="description" content="Your Harbor BioLabs supplier onboarding workspace. Manage invitations, complete applications, and track verification." /><meta name="viewport" content="width=device-width, initial-scale=1" /></Head>
      {!email ? loading ? <div className="loading-screen"><span className="brand-mark"><Icon name="harbor" /></span><p>Opening your workspace…</p></div> : this.signIn() : <div className="app-shell">
      <aside className="sidebar"><a className="brand" href="/" aria-label="Harbor home"><span className="brand-mark"><Icon name="harbor" /></span><span>Harbor<span className="brand-subtitle">BioLabs</span></span></a>
        <div className="workspace-label"><span className="workspace-avatar">H</span><div>Harbor BioLabs<small>{role ? 'Procurement workspace' : 'Supplier workspace'}</small></div><Icon name="chevron" /></div>
        <span className="nav-label">Workspace</span><nav aria-label="Main navigation">{nav.map((item) => <button key={item.id} aria-current={view === item.id ? 'page' : undefined} className={view === item.id ? 'nav-item active' : 'nav-item'} onClick={() => this.setState({ view: item.id, detail: undefined, filter: 'ALL', search: '' })}><Icon name={item.icon} />{item.label}{item.id === 'reviews' && pending.length > 0 && <span className="nav-count">{pending.length}</span>}</button>)}</nav>
        <div className="sidebar-bottom"><div className="sidebar-note"><Icon name="shield" /><strong>Better partners.<br />Stronger science.</strong><p>A clear path to trusted supplier relationships.</p></div><div className="user-profile"><span className="avatar">{email.slice(0, 2).toUpperCase()}</span><div><strong>{role ? Workspace.label(role) : 'Supplier'}</strong><small title={email}>{email}</small></div><button className="icon-button" aria-label="Sign out" title="Sign out" onClick={() => Workspace.AUTH.signOut().then(() => window.location.assign('/'), this.report.bind(this))}><Icon name="logout" /></button></div></div>
      </aside>
      <div className="workspace-main"><header className="topbar"><div>Workspace <Icon name="chevron" /><strong>{detail ? 'Supplier details' : nav.find((item) => item.id === view)?.label}</strong></div><span className="secure-label"><Icon name="lock" /> Secure workspace</span></header>
      <main>
        <div className="page-heading"><div><p className="page-context">{role ? 'Supplier operations' : 'Your partnership with Harbor'}</p><h1>{detail ? detail.case.name || detail.case.requestedSite : view === 'overview' ? role ? 'Good partnerships start here.' : 'Your next chapter starts here.' : view === 'reviews' ? 'Ready for a closer look.' : view === 'team' ? 'The people behind the process.' : 'Every partnership, in one place.'}</h1><p className="muted">{detail ? `Application #${detail.case.number} · Manage details, evidence, and next steps.` : view === 'overview' ? 'Bring the right suppliers on board. Keep every step moving with confidence.' : view === 'reviews' ? 'Review submitted applications and help suppliers move forward.' : view === 'team' ? 'Manage the people who invite, verify, and approve your suppliers.' : 'Follow each supplier from invitation to approval.'}</p></div>{canInvite && <button className="primary-button" onClick={() => this.setState({ showInvite: !this.state.showInvite })}><Icon name="plus" />Invite supplier</button>}</div>
        {error && <p role="alert">{error}</p>}{notice && <p className="notice" role="status"><Icon name="check" />{notice}<button className="icon-button" aria-label="Dismiss notification" onClick={() => this.setState({ notice: '' })}>×</button></p>}
        {token && this.form('Accept invitation', async () => { const result = await this.api().invitations.redeem.mutate({ idempotencyKey: crypto.randomUUID(), token }); this.setState({ token: '' }); await this.refresh(); await this.open(result.id) }, <p>You have been invited to become a Harbor supplier. Accept to start your application.</p>)}
        {memberships.length > 1 && this.form('Switch workspace', async (form) => { const tenantId = String(form.get('tenantId')); await this.api().identity.selectTenant.mutate({ idempotencyKey: crypto.randomUUID(), tenantId }); await new Promise<void>((resolve) => this.setState({ detail: undefined, tenantId }, resolve)); await this.refresh() }, <label>Workspace<select name="tenantId" defaultValue={tenantId}>{memberships.map((member) => <option key={member.tenantId}>{member.tenantId}</option>)}</select></label>)}
        {canInvite && this.state.showInvite && <section className="panel invite-panel"><div className="panel-heading"><div><h2>Start a new partnership</h2><p>Invite a supplier to complete their company profile and verification.</p></div><button className="icon-button" aria-label="Close invitation form" onClick={() => this.setState({ showInvite: false })}>×</button></div>{this.form('Send supplier invitation', async (form) => { const result = await this.api().cases.create.mutate(inputs.create.parse({ ...Object.fromEntries(form.entries()), category: 'CALIBRATION', idempotencyKey: crypto.randomUUID() })); this.setState({ showInvite: false }); await this.refresh(); await this.open(result.id) }, this.fields([{ label: 'Supplier email', name: 'supplierEmail', type: 'email' }, { label: 'Requested service site', name: 'requestedSite' }, { label: 'Country', name: 'country', options: Values.COUNTRIES }]))}</section>}
        {!detail && view === 'overview' && <>
          <section className="journey-banner"><div className="journey-intro"><span className="journey-symbol"><Icon name="harbor" /></span><h2>From introduction<br />to trusted partner.</h2><p>One connected onboarding journey.</p></div><ol className="journey-track">{[['Invite', 'Open the conversation', 'mail'], ['Collect', 'Build the supplier profile', 'document'], ['Verify', 'Check what matters', 'shield'], ['Approve', 'Begin the partnership', 'check']].map(([title, text, icon], i) => <li key={title}><span className="journey-node"><Icon name={icon} /></span><span className="journey-step">Step {i + 1}</span><strong>{title}</strong><small>{text}</small></li>)}</ol></section>
          <div className="section-label"><h2>Your onboarding at a glance</h2><span>Last 30 days</span></div>
          <section className="metrics" aria-label="Onboarding metrics">{[{ title: 'Awaiting suppliers', value: analytics?.supplierAction ?? cases.filter((c) => ['DRAFT', 'INVITED'].includes(c.status)).length, text: 'Invited or completing their profile', icon: 'suppliers', color: 'amber' }, { title: 'Ready for review', value: analytics?.reviewerAction ?? pending.length, text: 'Your next decisions start here', icon: 'document', color: 'blue' }, { title: 'Median completion', value: analytics?.completed ? analytics.medianHours.toFixed(1) : '—', text: 'Hours from submission to decision', icon: 'clock', color: 'teal' }, { title: 'Rework rate', value: analytics ? `${(analytics.reworkRate * 100).toFixed(0)}%` : '—', text: 'Applications needing another pass', icon: 'refresh', color: 'violet' }].map((metric) => <div className="metric" key={metric.title}><div className="metric-top"><span>{metric.title}</span><span className={`metric-icon ${metric.color}`}><Icon name={metric.icon} /></span></div><strong>{metric.value}</strong><small>{metric.text}</small></div>)}</section>
        </>}
        {!detail && view === 'team' && role === 'ADMIN' ? this.team() : !detail && <div className={view === 'overview' ? 'overview-grid' : ''}><section className="panel supplier-panel"><div className="panel-heading"><div><h2>{view === 'reviews' ? 'Review queue' : role ? 'Supplier pipeline' : 'Your applications'}<span className="count-label">{view === 'reviews' ? pending.length : cases.length}</span></h2><p>{view === 'reviews' ? 'Applications awaiting verification and decisions.' : 'A little visibility goes a long way.'}</p></div>{view === 'overview' && <button className="text-button" onClick={() => this.setState({ view: 'suppliers' })}>View all <Icon name="arrow" /></button>}</div>
          <div className="table-toolbar"><div className="filter-tabs">{[['ALL', 'All suppliers'], ['PENDING', 'In review'], ['APPROVED', 'Approved']].map(([value, label]) => <button key={value} className={filter === value ? 'active' : ''} onClick={() => this.setState({ filter: value })}>{label}</button>)}</div><label className="search-field"><Icon name="search" /><input aria-label="Search suppliers" placeholder="Search suppliers…" value={search} onChange={(event) => this.setState({ search: event.target.value })} /></label></div>
          <div className="table-scroll"><table><thead><tr><th>Supplier / service site</th><th>Status</th><th>Last updated</th><th><span className="sr-only">Open application</span></th></tr></thead><tbody>{visible.map((row) => <tr key={row.caseId}><td><button className="supplier-link" onClick={() => this.open(row.caseId).then(undefined, this.report.bind(this))}><span className="supplier-avatar">{(row.name || row.requestedSite).slice(0, 2).toUpperCase()}</span><span><strong>{row.name || row.requestedSite}</strong><small>{row.name ? row.requestedSite : `Application #${row.number}`}</small></span></button></td><td><span className={`status status-${row.status.toLowerCase()}`}><i />{Workspace.label(row.status)}</span></td><td className="date-cell">{new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(row.updatedAt))}</td><td><button className="icon-button" aria-label={`Open ${row.name || row.requestedSite}`} onClick={() => this.open(row.caseId).then(undefined, this.report.bind(this))}><Icon name="arrow" /></button></td></tr>)}</tbody></table></div>
          {!visible.length && <div className="empty-state"><span className="empty-icon"><Icon name={search || filter !== 'ALL' ? 'search' : 'suppliers'} /></span><h3>{search || filter !== 'ALL' ? 'No matching suppliers' : view === 'reviews' ? 'Your review queue is clear' : 'Your next partnership starts here'}</h3><p>{search || filter !== 'ALL' ? 'Try another search or choose a different status.' : canInvite ? 'Invite your first supplier. We’ll guide them through the rest.' : 'Applications shared with you will appear here.'}</p>{canInvite && !search && filter === 'ALL' && view !== 'reviews' && <button className="button-secondary" onClick={() => this.setState({ showInvite: true })}><Icon name="plus" />Invite your first supplier</button>}</div>}
          <div className="table-footer"><span>{visible.length} of {cases.length} loaded applications</span><span>Latest 25 applications</span></div>
        </section>{view === 'overview' && <aside className="next-panel"><span className="next-icon"><Icon name="check" /></span><h2>Keep things moving.</h2><p>{pending.length ? `${pending.length} applications are waiting for review. Your next decision brings a partnership closer.` : 'A good start makes every next step easier. Here’s what to focus on.'}</p><div className="next-task"><Icon name="mail" /><div><strong>{canInvite ? 'Make the first introduction' : 'Complete your profile'}</strong><p>{canInvite ? 'Send an invitation to start onboarding.' : 'Open an application to add your details.'}</p></div></div><div className="next-task"><Icon name="shield" /><div><strong>Let evidence lead the way</strong><p>Company, tax, and banking details come together for verification.</p></div></div><button className="text-button" onClick={() => this.setState({ view: role ? 'reviews' : 'suppliers' })}>{role ? 'Open review queue' : 'Open my applications'}<Icon name="arrow" /></button><div className="next-note"><Icon name="lock" /><span>Access is tailored to your role.</span></div></aside>}</div>}
        {detail && <section className="panel detail-panel"><button className="text-button back-button" onClick={() => this.setState({ detail: undefined })}>← Back to {view === 'reviews' ? 'review queue' : 'suppliers'}</button><div className="panel-heading"><div><h2>Application overview</h2><p>Follow progress and see what needs to happen next.</p></div><span className={`status status-${detail.case.status.toLowerCase()}`}><i />{Workspace.label(detail.case.status)}</span></div>
          <ol className="stages" aria-label="Verification progress" aria-live="polite">{detail.run.stages.map((stage, index) => <li key={stage.name}><span className="stage-number">{index + 1}</span><div>{stage.name}<strong>{Workspace.label(stage.state)}</strong></div></li>)}</ol>
          {detail.issues.length > 0 && <div className="issues"><h3>Needs attention</h3>{detail.issues.map((issue) => <p key={issue.id}>{issue.message || Workspace.label(issue.code)}</p>)}</div>}
          {detail.certificateScopeReview && <details className="check-details">
            <summary>Certificate scope suggestions</summary>
            {detail.certificateScopeReview.status === 'unavailable' && <p>Certificate evidence suggestions are unavailable.</p>}
            {detail.certificateScopeReview.status === 'no_evidence' && <p>No candidate evidence was found.</p>}
            {detail.certificateScopeReview.citations.length > 0 && <>
              <p>Verify these excerpts against the certificate and its annex before making a decision.</p>
              <ul>{detail.certificateScopeReview.citations.map((citation) =>
                <li key={JSON.stringify(citation)}><strong>{Workspace.label(citation.field)}</strong> · Document {citation.documentId}, page {citation.page} · <q>{citation.quote}</q></li>,
              )}</ul>
            </>}
          </details>}
          {detail.checks.length > 0 && <details className="check-details"><summary>Verification results <span className="count-label">{detail.checks.length}</span></summary>{detail.checks.map((check, index) => <p key={`${check.rule}-${index}`}><strong>{Workspace.label(check.rule)}</strong> — {Workspace.label(check.result)} · {check.source} · {check.code}{check.evidence.length > 0 && ` · pages ${check.evidence.map((item) => item.page).join(', ')}`}</p>)}</details>}
          <div className="document-section"><h3>Supporting documents <span className="count-label">{detail.documents.length}</span></h3>{!detail.documents.length && <p className="muted">Documents will appear here as your supplier completes their application.</p>}{detail.documents.map((doc) => <div className="document-row" key={doc.id}><Icon name="document" /><strong>{Workspace.label(doc.kind)}</strong><span className="document-status">{Workspace.label(doc.status)}</span>{doc.status === 'CLEAN' && (!role || role === 'REVIEWER' || role === 'COMPLIANCE' && doc.kind === 'OWNERSHIP') && <button className="button-secondary" onClick={() => this.api().documents.download.mutate({ caseId: detail.case.caseId, documentId: doc.id }).then((result) => window.location.assign(result.url), this.report.bind(this))}>Download</button>}{!role && detail.case.status === 'DRAFT' && <button className="text-button" onClick={() => this.api().documents.remove.mutate({ ...this.draft(detail), documentId: doc.id }).then(() => this.open(detail.case.caseId)).then(undefined, this.report.bind(this))}>Remove</button>}</div>)}</div>
          {this.form('Refresh case', async () => this.open(detail.case.caseId), null)}{role ? this.viewBuyer(detail, role) : this.viewSupplier(detail)}
        </section>}
        <footer className="page-footer"><span>Harbor BioLabs</span><span>Trusted partnerships. Thoughtful progress.</span></footer>
      </main></div></div>}
    </>
  }

  private static label(value: string) {
    return value.toLowerCase().replaceAll('_', ' ').replace(/^./, (char) => char.toUpperCase())
  }
}
