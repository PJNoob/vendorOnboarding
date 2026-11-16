import { createAuthClient } from 'better-auth/react'
import { emailOTPClient } from 'better-auth/client/plugins'
import { Component, type FormEvent, type ReactNode } from 'react'
import { ZodError, z } from 'zod'

import { inputs, type Country, type Input, type Output, Values } from '@neo/schemas'

import { ApiClient } from '@/lib/trpc'
import { Icon } from './Icon'
import { SupplierDetails } from './SupplierDetails'
import { OwnershipFields, QualificationFields } from './ProfileFields'
import Head from 'next/head'

type Detail = Output<'detail'>
type Role = Output<'identity'>['memberships'][number]['role']
type Action = (form: FormData) => Promise<void | string>
type DraftChange = z.infer<typeof inputs.save>['change']
type Field = { name: string; label: string; type?: string; options?: readonly string[]; allCountries?: boolean }
type State = {
  view: 'overview' | 'suppliers' | 'reviews' | 'team'
  search: string
  filter: string
  supplierStep: number
  showInvite: boolean
  showNewApplication: boolean
  pendingInvitations: Output<'pendingInvitations'>['items']
  notice: string
  loading: boolean
  analytics?: Output<'analytics'>
  busy: boolean
  cases: Output<'list'>['items']
  detail?: Detail
  email: string
  authChannel: string
  error: string
  history: Output<'audit'>['items']
  memberships: Output<'identity'>['memberships']
  teamDirectory?: Output<'teamDirectory'>
  teamLoading: boolean
  teamError: string
  otpSent: boolean
  tenantId: string
  token: string
}

export class Workspace extends Component<{ demoAuth?: boolean; countries: Country[] }, State> {
  static supplierStatus(row: Output<'list'>['items'][number]) {
    if (row.status !== 'INVITED') return Workspace.label(row.status)
    return ({ QUEUED: 'Queued for email check', CHECKING: 'Checking email', INVALID: 'Failed — invalid supplier credentials', VERIFICATION_FAILED: 'Failed — email check unavailable', CANCELED: 'Invitation canceled', UNKNOWN: 'Invitation failed', SENT: 'Invited' } as Record<string, string>)[row.invitationDelivery ?? ''] ?? 'Invited'
  }

  static supplierStatusClass(row: Output<'list'>['items'][number]) {
    if (row.status === 'INVITED') {
      if (['INVALID', 'VERIFICATION_FAILED', 'UNKNOWN'].includes(row.invitationDelivery ?? '')) return 'rejected'
      if (['QUEUED', 'CHECKING'].includes(row.invitationDelivery ?? '')) return 'pending'
    }
    return row.status.toLowerCase()
  }

  static readonly INVITATION_STORAGE = 'harbor.pendingInvitation'
  static readonly AUTH = createAuthClient({ plugins: [emailOTPClient()] })
  static readonly COMPANY: Field[] = [
    { label: 'Legal name', name: 'legalName' }, { label: 'Registration ID', name: 'registryId' },
    { label: 'Jurisdiction', name: 'jurisdiction' }, { label: 'Country', name: 'country', allCountries: true },
    { label: 'Street address', name: 'addressLine1' }, { label: 'City', name: 'city' },
    { label: 'Contact name', name: 'contactName' }, { label: 'Contact email', name: 'contactEmail', type: 'email' },
  ]
  static readonly BANK: Field[] = [
    { label: 'Beneficiary', name: 'beneficiary' }, { label: 'Country', name: 'country', allCountries: true },
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
  private creatingApplication = false
  private pendingApplication?: { input: Input<'createSupplierApplication'>; result?: Output<'ack'> }
  state: State = { view: 'overview', search: '', filter: 'ALL', supplierStep: 0, showInvite: false, showNewApplication: false, pendingInvitations: [], notice: '', loading: true, busy: false, cases: [], email: '', authChannel: '', error: '', history: [], memberships: [], teamLoading: false, teamError: '', otpSent: false, tenantId: '', token: '' }

  private api() {
    return ApiClient.create(this.state.tenantId)
  }

  private async createApplication(form: FormData) {
    if (this.creatingApplication) return
    this.creatingApplication = true
    try {
      const input = inputs.createSupplierApplication.parse({
        requestedSite: form.get('requestedSite'), country: form.get('country'), category: 'CALIBRATION',
        idempotencyKey: this.pendingApplication?.input.idempotencyKey ?? crypto.randomUUID(),
      })
      const previous = this.pendingApplication?.input
      if (!previous || previous.requestedSite !== input.requestedSite || previous.country !== input.country) {
        if (previous) input.idempotencyKey = crypto.randomUUID()
        this.pendingApplication = { input }
      }
      const pending = this.pendingApplication!
      pending.result ??= await ApiClient.create().supplier.create.mutate(pending.input)
      await new Promise<void>((resolve) => this.setState({ view: 'suppliers', filter: 'ALL', search: '', supplierStep: 0 }, resolve))
      await this.refresh(false)
      await this.open(pending.result.id)
      this.pendingApplication = undefined
      this.setState({ showNewApplication: false })
      return 'Application created. Complete your profile and submit it for review.'
    } finally {
      this.creatingApplication = false
    }
  }

  private async command(action: Action, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    for (const input of event.currentTarget.querySelectorAll<HTMLInputElement>('input[type="email"]')) {
      if (!this.validateEmail(input)) {
        input.reportValidity()
        return
      }
    }
    const data = new FormData(event.currentTarget)
    this.setState({ busy: true, error: '', notice: '' })
    await action(data).then((notice) => this.setState({ notice: notice || 'Action completed successfully.' }), this.report.bind(this))
    this.setState({ busy: false })
  }

  private draft(detail: Detail) {
    return { ...this.version(detail), expectedDraftRevision: detail.draftRevision, submissionId: detail.submissionId }
  }

  private fields(fields: Field[], values: Record<string, unknown> = {}) {
    return fields.map(({ label, name, options, type, allCountries }) => {
      if (allCountries) options = this.props.countries.map((country) => country.code)
      return (
      <label key={name}>{label}
        {options
          ? <select aria-label={label} defaultValue={String(values[name] ?? options[0])} name={name}>{options.map((option) => <option key={option} value={option}>{(name === 'country' ? this.props.countries.find((country) => country.code === option)?.name : undefined) ?? ({ US: 'United States', AE: 'United Arab Emirates', false: 'No', true: 'Yes', W9: 'W-9', W8BEN_E: 'W-8BEN-E', OTHER_REVIEW: 'Other (manual review)' } as Record<string, string>)[option] ?? Workspace.label(option)}</option>)}</select>
          : <input defaultValue={type === 'password' ? '' : String(values[name] ?? '')} name={name} required={type === 'email'} type={type ?? 'text'} />}
      </label>
    )})
  }

  private validateEmail(input: HTMLInputElement) {
    const valid = z.email().safeParse(input.value).success
    input.setCustomValidity(valid ? '' : 'Enter a valid mail')
    if (!valid) this.setState({ error: 'Enter a valid mail', notice: '' })
    return valid
  }

  private form(title: string, action: Action, body: ReactNode, key = title) {
    return <form className="workspace-form" key={key} onInvalidCapture={(event) => {
      const input = event.target as HTMLInputElement
      if (input.type === 'email') this.validateEmail(input)
    }} onInputCapture={(event) => {
      const input = event.target as HTMLInputElement
      if (input.type === 'email') {
        input.setCustomValidity('')
        if (this.state.error === 'Enter a valid mail') this.setState({ error: '' })
      }
    }} onBlurCapture={(event) => {
      const input = event.target as unknown as HTMLInputElement
      if (input.type === 'email' && input.value) this.validateEmail(input)
    }} onSubmit={this.command.bind(this, action)}><h3>{title}</h3>{body}<button disabled={this.state.busy}>{title}</button></form>
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
    if (this.active && this.state.tenantId && !this.state.busy) {
      await this.api().cases.list.query({ limit: 100 }).then((result) => this.setState({ cases: result.items }), this.report.bind(this))
      if (detail?.case.status === 'INVITED') await this.open(detail.case.caseId).then(undefined, this.report.bind(this))
    }
    if (this.active && detail && !this.state.busy && ['DRAFT', 'PENDING', 'SUBMITTED'].includes(detail.case.status)) {
      const run = await this.api().runs.get.query({ caseId: detail.case.caseId }).then((value) => value, () => undefined)
      if (run && this.state.detail?.case.caseId === detail.case.caseId) {
        const status = run.stages.find((stage) => stage.name === 'Decision')?.state
        if (status !== detail.case.status || JSON.stringify(run.stages) !== JSON.stringify(detail.run.stages)) await this.open(detail.case.caseId).then(undefined, this.report.bind(this))
        else this.setState({ detail: { ...detail, run } })
      }
    }
    if (this.active) this.timer = setTimeout(this.poll.bind(this), Workspace.POLL_MS)
  }

  private report(error: unknown) {
    this.setState({ error: error instanceof ZodError ? `Check ${error.issues[0]?.path.join(' › ') || 'your details'}: ${error.issues[0]?.message || 'Complete all required fields.'}` : error instanceof Error ? error.message : 'Request could not be completed. Please try again.' })
  }

  private async refresh(acceptLink = true) {
    this.setState({ teamDirectory: undefined, teamError: '' })
    const identity = await this.api().identity.me.query({}).then((result) => result, () => undefined)
    if (!identity) return
    const tenantId = identity.memberships.find((member) => member.tenantId === this.state.tenantId)?.tenantId
      ?? identity.memberships[0]?.tenantId ?? ''
    await new Promise<void>((resolve) => this.setState({ email: identity.email, authChannel: identity.channel, memberships: identity.memberships, tenantId }, resolve))
    const api = ApiClient.create(tenantId)
    if (tenantId) {
      const now = new Date()
      const from = new Date(now.getTime() - 30 * 86_400_000)
      const [analytics, cases] = await Promise.all([
        api.analytics.summary.query({ from: from.toISOString(), to: now.toISOString() }), api.cases.list.query({ limit: 100 }),
      ])
      this.setState({ analytics, cases: cases.items, pendingInvitations: [] })
      if (identity.memberships.some((member) => member.tenantId === tenantId && member.role === 'ADMIN')) await this.loadTeam()
    } else if (identity.channel === 'EMAIL_OTP') {
      const [cases, invitations] = await Promise.all([api.supplier.cases.query({}), api.invitations.pending.query({})])
      this.setState({ cases: cases.items, pendingInvitations: invitations.items })
      if (acceptLink && this.state.token) await this.acceptInvitation()
    } else {
      this.setState({ cases: [], pendingInvitations: [] })
    }
  }

  private async acceptInvitation(invitationId?: string) {
    const api = ApiClient.create()
    const idempotencyKey = crypto.randomUUID()
    const result = invitationId
      ? await api.invitations.accept.mutate({ idempotencyKey, invitationId })
      : await api.invitations.redeem.mutate({ idempotencyKey, token: this.state.token })
    sessionStorage.removeItem(Workspace.INVITATION_STORAGE)
    window.history.replaceState({}, '', window.location.pathname)
    await new Promise<void>((resolve) => this.setState({ token: '', view: 'suppliers', supplierStep: 0, notice: 'Invitation accepted. Complete your supplier profile to continue.' }, resolve))
    await this.refresh(false)
    await this.open(result.id)
  }

  private async supplierSignOut() {
    await Workspace.AUTH.signOut()
    window.location.assign(this.state.token ? `/invite#${this.state.token}` : '/invite')
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
        }, <p>{String(this.object(entry).name || 'Supplier')} · {String(this.object(entry).email || userId)}</p>, userId)
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
          <label>Decision reason<textarea name="rationale" minLength={10} placeholder="Explain the evidence and specific reasons for approval or rejection." required /></label></>)}
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
      {role === 'ADMIN' && ['SUBMITTED', 'PENDING'].includes(detail.case.status) && this.form('Reprocess documents', async () => {
        await this.api().work.reprocess.mutate({ caseId: detail.case.caseId, submissionId: detail.submissionId, expectedCaseRevision: detail.case.revision, idempotencyKey: crypto.randomUUID() })
        await this.open(detail.case.caseId)
      }, <p>Run document extraction and verification again for this submission.</p>)}
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
      }, <OwnershipFields countries={this.props.countries} value={detail.values.ownership} />, `${detail.submissionId}-ownership`)}
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
      }, <><label>Evidence type<select aria-label="Evidence type" name="kind">{detail.required.map((kind) => <option key={kind} value={kind}>{Workspace.label(kind)}</option>)}</select></label>
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
    const authError = new URLSearchParams(window.location.search).get('error')
    if (authError) {
      this.setState({ error: authError === 'access_denied'
        ? 'Google sign-in was cancelled or access was denied. Please try again.'
        : 'Google sign-in could not be completed. Please try again or contact your workspace administrator.' })
    }
    const fragment = window.location.hash.slice(1)
    const token = fragment || sessionStorage.getItem(Workspace.INVITATION_STORAGE) || ''
    if (token && inputs.redeem.shape.token.safeParse(token).success) {
      sessionStorage.setItem(Workspace.INVITATION_STORAGE, token)
      this.setState({ token }, () => {
        this.refresh().then(this.poll.bind(this), this.report.bind(this)).finally(() => this.setState({ loading: false }))
      })
      return
    }
    this.refresh().then(async () => { const caseId = new URLSearchParams(window.location.search).get('caseId'); if (caseId) await this.open(caseId); await this.poll() }, this.report.bind(this)).catch(this.report.bind(this)).finally(() => this.setState({ loading: false }))
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
      <div className="auth-panel"><div className="auth-card"><span className="auth-symbol"><Icon name="shield" /></span><h2>{this.state.token ? 'Open your supplier invitation' : 'Welcome to Harbor'}</h2><p className="muted">{this.state.token ? 'Use the email address that received the invitation. After sign-in, we will open your supplier profile.' : 'Sign in to continue your onboarding journey.'}</p>
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
        {!this.state.token && <><div className="auth-divider">For the Harbor team</div>
        {this.form('Continue with Google', async () => {
          const result = await Workspace.AUTH.signIn.social({ callbackURL: '/', errorCallbackURL: '/', provider: 'google' })
          if (result.error) throw new Error(result.error.message || 'Google sign-in could not be started. Please try again.')
        }, null)}</>}
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

  private async loadTeam() {
    const tenantId = this.state.tenantId
    this.setState({ teamLoading: true, teamError: '' })
    try {
      const teamDirectory = await this.api().team.directory.query({})
      if (this.state.tenantId === tenantId) this.setState({ teamDirectory, teamLoading: false })
    } catch (error) {
      if (this.state.tenantId === tenantId) this.setState({ teamDirectory: undefined, teamLoading: false, teamError: error instanceof Error ? error.message : 'Could not load workspace access.' })
    }
  }

  private team() {
    const { teamDirectory, teamLoading, teamError } = this.state
    return <section className="panel"><div className="panel-heading"><div><h2>Team & access</h2><p>Everyone who currently has access to this workspace, including previously added members.</p></div><button className="button-secondary" disabled={teamLoading} onClick={() => this.loadTeam()}>Refresh access</button></div>
      <div className="access-directory" aria-busy={teamLoading}>
        {teamLoading && <p role="status">Loading workspace access…</p>}
        {teamError && <p role="alert">{teamError} Use Refresh access to try again.</p>}
        {teamDirectory && <>
          <h3>Team members ({teamDirectory.members.length})</h3>
          <p className="muted">Active administrators, buyers, reviewers, and compliance members.</p>
          {teamDirectory.members.length ? <div className="table-scroll"><table><thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Membership ID</th></tr></thead><tbody>{teamDirectory.members.map((member) => <tr key={member.id}><td>{member.name || 'Team member'}</td><td>{member.email}</td><td>{Workspace.label(member.role)}</td><td><code>{member.id}</code></td></tr>)}</tbody></table></div> : <p>No team members currently have access.</p>}
          <h3>Supplier contacts ({new Set(teamDirectory.suppliers.map((supplier) => supplier.email)).size})</h3>
          <p className="muted">Contacts with active application access. Invitations awaiting acceptance do not grant access yet.</p>
          {teamDirectory.suppliers.length ? <div className="table-scroll"><table><thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Application access</th></tr></thead><tbody>{teamDirectory.suppliers.map((supplier) => <tr key={supplier.id}><td>{supplier.name || 'Supplier contact'}</td><td>{supplier.email}</td><td>Supplier</td><td><button className="text-button" onClick={() => this.open(supplier.caseId).then(undefined, this.report.bind(this))}>{supplier.requestedSite}</button></td></tr>)}</tbody></table></div> : <p>No supplier contacts currently have access.</p>}
        </>}
      </div><div className="team-forms">
      {this.form('Enroll team member', async (form) => {
        await this.api().team.enroll.mutate(inputs.enroll.parse({ ...Object.fromEntries(form.entries()), idempotencyKey: crypto.randomUUID() }))
        await this.loadTeam()
        return 'Team enrollment created. The member will appear after accepting access.'
      }, this.fields([{ label: 'Work email', name: 'email', type: 'email' }, { label: 'Role', name: 'role', options: Values.BUYER_ROLES }]))}
      {this.form('Change team role', async (form) => {
        await this.api().team.setRole.mutate(inputs.role.parse({ ...Object.fromEntries(form.entries()), idempotencyKey: crypto.randomUUID() }))
        await this.loadTeam()
      }, this.fields([{ label: 'Membership ID', name: 'membershipId' }, { label: 'Role', name: 'role', options: Values.BUYER_ROLES }]))}
      {this.form('Revoke team access', async (form) => {
        await this.api().team.revoke.mutate(inputs.member.parse({ ...Object.fromEntries(form.entries()), idempotencyKey: crypto.randomUUID() }))
        await this.loadTeam()
      }, this.fields([{ label: 'Membership ID', name: 'membershipId' }]))}
    </div></section>
  }

  render() {
    const { analytics, cases, detail, email, error, memberships, tenantId, token, view, search, filter, notice, loading } = this.state
    const role = memberships.find((member) => member.tenantId === tenantId)?.role
    const canInvite = role === 'ADMIN' || role === 'BUYER'
    const canCreateApplication = !role && this.state.authChannel === 'EMAIL_OTP'
    const pending = cases.filter((row) => ['PENDING', 'SUBMITTED'].includes(row.status))
    const visible = cases.filter((row) => (view !== 'reviews' || ['PENDING', 'SUBMITTED'].includes(row.status)) && (filter === 'ALL' || row.status === filter) && `${row.name} ${row.supplierEmail ?? ''} ${row.requestedSite} ${row.number}`.toLowerCase().includes(search.toLowerCase()))
    const nav: { id: State['view']; label: string; icon: string }[] = [{ id: 'overview', label: 'Overview', icon: 'grid' }, { id: 'suppliers', label: role ? 'Suppliers' : 'My applications', icon: 'suppliers' }, ...(role ? [{ id: 'reviews' as const, label: 'Review queue', icon: 'check' }] : []), ...(role === 'ADMIN' ? [{ id: 'team' as const, label: 'Team & access', icon: 'team' }] : [])]
    return <><Head><title>Harbor | Supplier onboarding</title><meta name="description" content="Your Harbor BioLabs supplier onboarding workspace. Manage invitations, complete applications, and track verification." /><meta name="viewport" content="width=device-width, initial-scale=1" /></Head>
      {!email ? loading ? <div className="loading-screen"><span className="brand-mark"><Icon name="harbor" /></span><p>Opening your workspace…</p></div> : this.signIn() : <div className="app-shell">
      <aside className="sidebar"><a className="brand" href="/" aria-label="Harbor home"><span className="brand-mark"><Icon name="harbor" /></span><span>Harbor<span className="brand-subtitle">BioLabs</span></span></a>
        <div className="workspace-label"><span className="workspace-avatar">H</span><div>Harbor BioLabs<small>{role ? 'Procurement workspace' : 'Supplier workspace'}</small></div><Icon name="chevron" /></div>
        <span className="nav-label">Workspace</span><nav aria-label="Main navigation">{nav.map((item) => <button key={item.id} aria-current={view === item.id ? 'page' : undefined} className={view === item.id ? 'nav-item active' : 'nav-item'} onClick={() => this.setState({ view: item.id, detail: undefined, filter: 'ALL', search: '' }, () => { if (item.id === 'team') void this.loadTeam() })}><Icon name={item.icon} />{item.label}{item.id === 'reviews' && pending.length > 0 && <span className="nav-count">{pending.length}</span>}</button>)}</nav>
        <div className="sidebar-bottom"><div className="sidebar-note"><Icon name="shield" /><strong>Better partners.<br />Stronger science.</strong><p>A clear path to trusted supplier relationships.</p></div><div className="user-profile"><span className="avatar">{email.slice(0, 2).toUpperCase()}</span><div><strong>{role ? Workspace.label(role) : 'Supplier'}</strong><small title={email}>{email}</small></div><button className="icon-button" aria-label="Sign out" title="Sign out" onClick={() => Workspace.AUTH.signOut().then(() => window.location.assign('/'), this.report.bind(this))}><Icon name="logout" /></button></div></div>
      </aside>
      <div className="workspace-main"><header className="topbar"><div>Workspace <Icon name="chevron" /><strong>{detail ? 'Supplier details' : nav.find((item) => item.id === view)?.label}</strong></div><span className="secure-label"><Icon name="lock" /> Secure workspace</span></header>
      <main>
        <div className="page-heading"><div><p className="page-context">{role ? 'Supplier operations' : 'Your partnership with Harbor'}</p><h1>{detail ? detail.case.name || detail.case.requestedSite : view === 'overview' ? role ? 'Good partnerships start here.' : 'Your next chapter starts here.' : view === 'reviews' ? 'Ready for a closer look.' : view === 'team' ? 'The people behind the process.' : 'Every partnership, in one place.'}</h1><p className="muted">{detail ? `Application #${detail.case.number} · Manage details, evidence, and next steps.` : view === 'overview' ? 'Bring the right suppliers on board. Keep every step moving with confidence.' : view === 'reviews' ? 'Review submitted applications and help suppliers move forward.' : view === 'team' ? 'Manage the people who invite, verify, and approve your suppliers.' : 'Follow each supplier from invitation to approval.'}</p></div>{canInvite && <button className="primary-button" onClick={() => this.setState({ showInvite: !this.state.showInvite })}><Icon name="plus" />Invite supplier</button>}{canCreateApplication && <button className="primary-button" disabled={this.state.busy} onClick={() => this.setState({ showNewApplication: !this.state.showNewApplication })}><Icon name="plus" />New application</button>}</div>
        {error && <p role="alert">{error}</p>}{notice && <p className="notice" role="status"><Icon name="check" />{notice}<button className="icon-button" aria-label="Dismiss notification" onClick={() => this.setState({ notice: '' })}>×</button></p>}
        {token && (this.state.authChannel !== 'EMAIL_OTP' ? <section className="panel"><h2>Open this invitation as a supplier</h2><p>This session is signed in as a buyer. Use supplier email sign-in with the address that received the invitation.</p><button className="primary-button" onClick={() => this.supplierSignOut().catch(this.report.bind(this))}>Sign in as the invited supplier</button></section> : this.form('Open supplier invitation', async () => this.acceptInvitation(), <p>This invitation belongs to the email address that received it. Sign in with that address to open your application.</p>))}
        {!role && this.state.pendingInvitations.length > 0 && <section className="panel"><h2>Your supplier invitations</h2><p>Accept an invitation to complete your supplier profile.</p>{this.state.pendingInvitations.map((invite) => <div key={invite.id}><h3>{invite.requestedSite}</h3><p>Country: {invite.country}</p><button className="primary-button" disabled={this.state.busy} onClick={() => this.acceptInvitation(invite.id).catch(this.report.bind(this))}>Start onboarding</button></div>)}</section>}
        {!role && cases.some((row) => row.status === 'DRAFT') && <section className="panel"><h2>Complete your supplier profile</h2><p>Your application is incomplete. Add your company, banking, tax, and ownership details and upload the required documents.</p>{cases.filter((row) => row.status === 'DRAFT').map((row) => <button className="button-secondary" key={row.caseId} onClick={() => this.open(row.caseId).catch(this.report.bind(this))}>Continue profile — {row.name || row.requestedSite}</button>)}</section>}
        {memberships.length > 1 && this.form('Switch workspace', async (form) => { const tenantId = String(form.get('tenantId')); await this.api().identity.selectTenant.mutate({ idempotencyKey: crypto.randomUUID(), tenantId }); await new Promise<void>((resolve) => this.setState({ detail: undefined, tenantId }, resolve)); await this.refresh() }, <label>Workspace<select name="tenantId" defaultValue={tenantId}>{memberships.map((member) => <option key={member.tenantId}>{member.tenantId}</option>)}</select></label>)}
        {canCreateApplication && this.state.showNewApplication && <section className="panel invite-panel"><div className="panel-heading"><div><h2>Start a new application</h2><p>Apply to Harbor BioLabs. Complete your profile and submit it for review.</p></div><button className="icon-button" disabled={this.state.busy} aria-label="Close new application form" onClick={() => this.setState({ showNewApplication: false })}>×</button></div>{this.form('Create application', this.createApplication.bind(this), <><label>Requested service site<input name="requestedSite" required maxLength={Values.MAX_TEXT} defaultValue={this.pendingApplication?.input.requestedSite ?? ''} /></label>{this.fields([{ label: 'Country', name: 'country', allCountries: true }], this.pendingApplication?.input)}</>)}</section>}
        {canInvite && this.state.showInvite && <section className="panel invite-panel"><div className="panel-heading"><div><h2>Start a new partnership</h2><p>Invite a supplier to complete their company profile and verification.</p></div><button className="icon-button" aria-label="Close invitation form" onClick={() => this.setState({ showInvite: false })}>×</button></div>{this.form('Send supplier invitation', async (form) => { const result = await this.api().cases.create.mutate(inputs.create.parse({ ...Object.fromEntries(form.entries()), category: 'CALIBRATION', idempotencyKey: crypto.randomUUID() })); this.setState({ showInvite: false }); await this.refresh(); await this.open(result.id); return 'Supplier queued for email verification. One queued supplier is checked every 35 seconds.' }, this.fields([{ label: 'Supplier email', name: 'supplierEmail', type: 'email' }, { label: 'Requested service site', name: 'requestedSite' }, { label: 'Country', name: 'country', allCountries: true }]))}</section>}
        {!detail && view === 'overview' && <>
          <section className="journey-banner"><div className="journey-intro"><span className="journey-symbol"><Icon name="harbor" /></span><h2>From introduction<br />to trusted partner.</h2><p>One connected onboarding journey.</p></div><ol className="journey-track">{[['Invite', 'Open the conversation', 'mail'], ['Collect', 'Build the supplier profile', 'document'], ['Verify', 'Check what matters', 'shield'], ['Approve', 'Begin the partnership', 'check']].map(([title, text, icon], i) => <li key={title}><span className="journey-node"><Icon name={icon} /></span><span className="journey-step">Step {i + 1}</span><strong>{title}</strong><small>{text}</small></li>)}</ol></section>
          <div className="section-label"><h2>Your onboarding at a glance</h2><span>Last 30 days</span></div>
          <section className="metrics" aria-label="Onboarding metrics">{[{ title: 'Awaiting suppliers', value: analytics?.supplierAction ?? cases.filter((c) => ['DRAFT', 'INVITED'].includes(c.status)).length, text: 'Invited or completing their profile', icon: 'suppliers', color: 'amber' }, { title: 'Ready for review', value: analytics?.reviewerAction ?? pending.length, text: 'Your next decisions start here', icon: 'document', color: 'blue' }, { title: 'Median completion', value: analytics?.completed ? analytics.medianHours.toFixed(1) : '—', text: 'Hours from submission to decision', icon: 'clock', color: 'teal' }, { title: 'Rework rate', value: analytics ? `${(analytics.reworkRate * 100).toFixed(0)}%` : '—', text: 'Applications needing another pass', icon: 'refresh', color: 'violet' }].map((metric) => <div className="metric" key={metric.title}><div className="metric-top"><span>{metric.title}</span><span className={`metric-icon ${metric.color}`}><Icon name={metric.icon} /></span></div><strong>{metric.value}</strong><small>{metric.text}</small></div>)}</section>
        </>}
        {!detail && role && view === 'overview' && <section className="panel requester-inbox" aria-label="Supplier requests and issues"><div className="panel-heading"><div><h2>Supplier requests & issues <span className="count-label">{pending.length}</span></h2><p>Supplier submissions arrive here automatically. Open a request to inspect every field, document and issue.</p></div><button className="text-button" onClick={() => this.setState({ view: 'reviews', filter: 'ALL' })}>Open review queue</button></div>
          {pending.length ? pending.map((request) => <article className="request-card" key={request.caseId}><div><strong>{request.name || request.requestedSite}</strong><p>{request.supplierEmail || 'Email not provided'} · {request.requestedSite}</p><small>Requester: {request.requesterName || request.requesterEmail || 'Procurement'} · {request.submittedAt ? `Submitted ${new Date(request.submittedAt).toLocaleString()}` : 'Verification in progress'}</small></div><div><span className={request.issueCount ? 'issue-count' : 'request-clear'}>{request.issueCount ? `${request.issueCount} open issues` : request.status === 'SUBMITTED' ? 'Checking documents' : 'No issues found'}</span><button className="button-secondary" onClick={() => this.open(request.caseId).then(undefined, this.report.bind(this))}>Review request</button></div>{Boolean(request.issueSummary?.length) && <ul>{request.issueSummary!.map((reason, index) => <li key={index}>{reason}</li>)}</ul>}</article>) : <p>No supplier requests are awaiting a decision.</p>}
        </section>}
        {!detail && view === 'team' && role === 'ADMIN' ? this.team() : !detail && <div className={view === 'overview' ? 'overview-grid' : ''}><section className="panel supplier-panel"><div className="panel-heading"><div><h2>{view === 'reviews' ? 'Review queue' : role ? 'Supplier pipeline' : 'Your applications'}<span className="count-label">{view === 'reviews' ? pending.length : cases.length}</span></h2><p>{view === 'reviews' ? 'Applications awaiting verification and decisions.' : 'A little visibility goes a long way.'}</p></div>{view === 'overview' && <button className="text-button" onClick={() => this.setState({ view: 'suppliers' })}>View all <Icon name="arrow" /></button>}</div>
          <div className="table-toolbar"><div className="filter-tabs">{[['ALL', 'All suppliers'], ['PENDING', 'In review'], ['APPROVED', 'Approved'], ['REJECTED', 'Rejected']].map(([value, label]) => <button key={value} className={filter === value ? 'active' : ''} onClick={() => this.setState({ filter: value })}>{label}</button>)}</div><label className="search-field"><Icon name="search" /><input aria-label="Search suppliers" placeholder="Search suppliers…" value={search} onChange={(event) => this.setState({ search: event.target.value })} /></label></div>
          <div className="table-scroll"><table><thead><tr><th>Supplier</th><th>Supplier email</th><th>Service site</th><th>Open issues</th><th>Status</th><th>Last updated</th><th><span className="sr-only">Open application</span></th></tr></thead><tbody>{visible.map((row) => <tr key={row.caseId}><td><button className="supplier-link" onClick={() => this.open(row.caseId).then(undefined, this.report.bind(this))}><span className="supplier-avatar">{(row.name || row.requestedSite).slice(0, 2).toUpperCase()}</span><span><strong>{row.name || row.requestedSite}</strong><small>{row.name ? row.requestedSite : `Application #${row.number}`}</small></span></button></td><td className="supplier-email">{row.supplierEmail || 'Not provided'}</td><td>{row.requestedSite}</td><td>{row.issueCount ? <button className="issue-count" onClick={() => this.open(row.caseId).then(undefined, this.report.bind(this))}>{row.issueCount} open</button> : 'None'}</td><td><span className={`status status-${Workspace.supplierStatusClass(row)}`}><i />{Workspace.supplierStatus(row)}</span></td><td className="date-cell">{new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(row.updatedAt))}</td><td><button className="icon-button" aria-label={`Open ${row.name || row.requestedSite}`} onClick={() => this.open(row.caseId).then(undefined, this.report.bind(this))}><Icon name="arrow" /></button></td></tr>)}</tbody></table></div>
          {!visible.length && <div className="empty-state"><span className="empty-icon"><Icon name={search || filter !== 'ALL' ? 'search' : 'suppliers'} /></span><h3>{search || filter !== 'ALL' ? 'No matching suppliers' : view === 'reviews' ? 'Your review queue is clear' : 'Your next partnership starts here'}</h3><p>{search || filter !== 'ALL' ? 'Try another search or choose a different status.' : canInvite ? 'Invite your first supplier. We’ll guide them through the rest.' : canCreateApplication ? 'Start an application to submit your company for review.' : 'Applications shared with you will appear here.'}</p>{canInvite && !search && filter === 'ALL' && view !== 'reviews' && <button className="button-secondary" onClick={() => this.setState({ showInvite: true })}><Icon name="plus" />Invite your first supplier</button>}{canCreateApplication && !search && filter === 'ALL' && <button className="button-secondary" disabled={this.state.busy} onClick={() => this.setState({ showNewApplication: true })}><Icon name="plus" />Start your first application</button>}</div>}
          <div className="table-footer"><span>{visible.length} of {cases.length} loaded applications</span><span>Latest 100 applications</span></div>
        </section>{view === 'overview' && <aside className="next-panel"><span className="next-icon"><Icon name="check" /></span><h2>Keep things moving.</h2><p>{pending.length ? `${pending.length} applications are waiting for review. Your next decision brings a partnership closer.` : 'A good start makes every next step easier. Here’s what to focus on.'}</p><div className="next-task"><Icon name="mail" /><div><strong>{canInvite ? 'Make the first introduction' : 'Complete your profile'}</strong><p>{canInvite ? 'Send an invitation to start onboarding.' : 'Open an application to add your details.'}</p></div></div><div className="next-task"><Icon name="shield" /><div><strong>Let evidence lead the way</strong><p>Company, tax, and banking details come together for verification.</p></div></div><button className="text-button" onClick={() => this.setState({ view: role ? 'reviews' : 'suppliers' })}>{role ? 'Open review queue' : 'Open my applications'}<Icon name="arrow" /></button><div className="next-note"><Icon name="lock" /><span>Access is tailored to your role.</span></div></aside>}</div>}
        {detail && <section className="panel detail-panel"><button className="text-button back-button" onClick={() => this.setState({ detail: undefined })}>← Back to {view === 'reviews' ? 'review queue' : 'suppliers'}</button><div className="panel-heading"><div><h2>Application overview</h2><p>Follow progress and see what needs to happen next.</p></div><span className={`status status-${Workspace.supplierStatusClass(detail.case)}`}><i />{Workspace.supplierStatus(detail.case)}</span></div>
          <ol className="stages" aria-label="Verification progress" aria-live="polite">{detail.run.stages.map((stage, index) => <li key={stage.name}><span className="stage-number">{index + 1}</span><div>{stage.name}<strong>{Workspace.label(stage.state)}</strong></div></li>)}</ol>
          {role && <SupplierDetails detail={detail} />}
          {detail.issues.length > 0 && <div className="issues"><h3>Needs attention</h3>{detail.issues.map((issue) => <p key={issue.id}>{issue.message || Workspace.label(issue.code)}</p>)}</div>}
          {detail.verificationReport && <details className="check-details"><summary>Cross-document verification — {Workspace.label(detail.verificationReport.recommendation)}</summary><p>Consistency findings support the internal review. A reviewer makes the final decision.</p>{detail.verificationReport.findings.map((finding) => <div key={finding.rule}><h3>{Workspace.label(finding.rule)} · {Workspace.label(finding.result)}</h3><p>{finding.message}</p>{finding.evidence.map((item, index) => <p key={`${item.documentId}-${item.field}-${index}`}><strong>{Workspace.label(item.field)}: {item.value}</strong> · {Workspace.label(detail.documents.find((document) => document.id === item.documentId)?.kind ?? item.documentId)}, page {item.page}<br /><q>{item.quote}</q></p>)}</div>)}</details>}
          {detail.checks.length > 0 && <details className="check-details"><summary>Verification results <span className="count-label">{detail.checks.length}</span></summary>{detail.checks.map((check, index) => <p key={`${check.rule}-${index}`}><strong>{Workspace.label(check.rule)}</strong> — {Workspace.label(check.result)} · {check.source} · {check.code}{check.evidence.length > 0 && ` · pages ${check.evidence.map((item) => item.page).join(', ')}`}</p>)}</details>}
          {detail.case.status === 'INVITED' && detail.case.invitationDelivery === 'INVALID' && <p role="alert">Incorrect supplier credentials. Enter the correct supplier email.</p>}
          {detail.case.status === 'INVITED' && detail.case.invitationDelivery === 'VERIFICATION_FAILED' && <p role="alert">Email verification failed. No invitation was sent. Check the verification service configuration and retry.</p>}
          {detail.case.status === 'INVITED' && ['QUEUED', 'CHECKING'].includes(detail.case.invitationDelivery ?? '') && <p role="status">Your supplier is queued for email verification. One supplier is checked every 35 seconds; the invitation email is sent only after a successful check.</p>}
          <div className="document-section"><h3>Supporting documents <span className="count-label">{detail.documents.length}</span></h3>{!detail.documents.length && <p className="muted">Documents will appear here as your supplier completes their application.</p>}{detail.documents.map((doc) => <div className="document-row" key={doc.id}><Icon name="document" /><strong>{Workspace.label(doc.kind)}</strong><span className="document-status">{Workspace.label(doc.status)}</span>{doc.status === 'CLEAN' && (!role || role === 'ADMIN' || role === 'REVIEWER' || role === 'COMPLIANCE' && doc.kind === 'OWNERSHIP') && <button className="button-secondary" onClick={() => this.api().documents.download.mutate({ caseId: detail.case.caseId, documentId: doc.id }).then((result) => window.location.assign(result.url), this.report.bind(this))}>Download</button>}{!role && detail.case.status === 'DRAFT' && <button className="text-button" onClick={() => this.api().documents.remove.mutate({ ...this.draft(detail), documentId: doc.id }).then(() => this.open(detail.case.caseId)).then(undefined, this.report.bind(this))}>Remove</button>}</div>)}</div>
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
