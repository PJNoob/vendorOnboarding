from pathlib import Path
import re, textwrap
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
ROOT=Path('/Users/prathamjaiswal/Documents/ChatGPT/VendorOnboarding'); W=ROOT/'tmp/technical'; OUT=ROOT/'output'
doc=Document();sec=doc.sections[0]
sec.page_width=Inches(8.27);sec.page_height=Inches(11.69)
sec.top_margin=Inches(.62);sec.bottom_margin=Inches(.60);sec.left_margin=sec.right_margin=Inches(.7)
for n,z in [('Normal',10),('Title',27),('Subtitle',12),('Heading 1',17),('Heading 2',12),('Heading 3',10.5)]:
 s=doc.styles[n];s.font.name='Calibri';s.font.size=Pt(z);s.font.color.rgb=RGBColor(0,0,0)
 s.paragraph_format.space_after=Pt(5);s.paragraph_format.line_spacing=1.04
 if n.startswith('Heading'):s.paragraph_format.space_before=Pt(10)
doc.styles['Caption'].font.color.rgb=RGBColor(0,0,0)
for el in doc.styles.element.xpath('.//w:pBdr'):el.getparent().remove(el)
doc.core_properties.title='Vendor onboarding technical design';doc.core_properties.author='';doc.core_properties.subject='Prisma schema API contracts and scalable execution design'
f=sec.footer.paragraphs[0];f.alignment=WD_ALIGN_PARAGRAPH.RIGHT;r=f.add_run('Vendor onboarding technical design   |   ');r.font.size=Pt(8)
fld=OxmlElement('w:fldSimple');fld.set(qn('w:instr'),'PAGE');f._p.append(fld)
def h(s,l=1):doc.add_heading(s,l)
def p(s,style=None):return doc.add_paragraph(s,style)
def page(title):
 q=doc.add_heading(title,1);q.paragraph_format.page_break_before=True
def code(s):
 q=doc.add_paragraph();q.paragraph_format.space_after=Pt(7);q.paragraph_format.line_spacing=Pt(9.5)
 q.paragraph_format.widow_control=False
 r=q.add_run(textwrap.dedent(s).strip());r.font.name='Courier New';r.font.size=Pt(8.5)
 return q
def table(head,rows,width=None):
 width=width or [6.87/len(head)]*len(head);t=doc.add_table(rows=1,cols=len(head));t.alignment=WD_TABLE_ALIGNMENT.CENTER;t.autofit=False
 for c,w in zip(t.columns,width):c.width=Inches(w)
 for i,v in enumerate(head):t.rows[0].cells[i].text=v
 for row in rows:
  for c,v in zip(t.add_row().cells,row):c.text=str(v)
 for j,row in enumerate(t.rows):
  pr=row._tr.get_or_add_trPr();pr.append(OxmlElement('w:cantSplit'))
  for i,c in enumerate(row.cells):
   c.width=Inches(width[i]);c.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
   pr=c._tc.get_or_add_tcPr();sh=OxmlElement('w:shd');sh.set(qn('w:fill'),'263F56' if j==0 else ('F0F4F7' if j%2==0 else 'FFFFFF'));pr.append(sh)
   bd=OxmlElement('w:tcBorders')
   for k in ['top','bottom','left','right']:
    e=OxmlElement('w:'+k);e.set(qn('w:val'),'single');e.set(qn('w:sz'),'4');e.set(qn('w:color'),'D9D9D9');bd.append(e)
   pr.append(bd);mg=OxmlElement('w:tcMar')
   for k in ['top','bottom','left','right']:
    e=OxmlElement('w:'+k);e.set(qn('w:w'),'80');e.set(qn('w:type'),'dxa');mg.append(e)
   pr.append(mg)
   for q in c.paragraphs:
    q.paragraph_format.space_after=Pt(2);q.paragraph_format.line_spacing=1.02
    for r in q.runs:r.font.size=Pt(9);r.bold=j==0;r.font.color.rgb=RGBColor.from_string('FFFFFF' if j==0 else '17232F')
 t.rows[0]._tr.get_or_add_trPr().append(OxmlElement('w:tblHeader'))
 p('').paragraph_format.space_after=Pt(0)
 return t
def picture(name,caption):
 doc.add_picture(str(W/name),width=Inches(6.25 if name=='network.png' else 6.87));p(caption,'Caption')
def link(n,title,url):
 q=p('['+str(n)+'] ');rel=q.part.relate_to(url,'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',is_external=True)
 e=OxmlElement('w:hyperlink');e.set(qn('r:id'),rel);r=OxmlElement('w:r');t=OxmlElement('w:t');t.text=title;r.append(t);e.append(r);q._p.append(e)

h('Vendor onboarding technical design',0)
p('PS 2 implementation specification   11 November 2026','Subtitle')
p('Build an invitation based onboarding service that turns supplier forms and documents into an explainable Approved, Pending or Rejected outcome. PostgreSQL owns workflow truth; background workers process evidence; authorized reviewers control final approval. The design uses the existing GKE cluster and keeps the first release focused on a working happy path followed by two meaningful exceptions.')
h('Scope and delivery boundaries')
p('The fictional buyer is Harbor BioLabs, a US biopharma company procuring calibration services. Release one handles US incorporated suppliers. The later UAE profile covers mainland corporate suppliers only. Initial onboarding and corrections are included; payments, ERP activation, continuous screening, public supplier registration and a global legal rules engine are excluded.')
table(['Case study requirement','Design commitment'],[
('Real inputs and runnable process','Forms and uploaded PDFs execute through persisted jobs and evidence based checks.'),
('Visible live run and history','Buyer case dashboard and a stage view driven by persisted state, with supplier next actions.'),
('Approved pending or rejected with reasons','Guarded state transitions, structured findings, reviewer decisions and notifications.'),
('Two to four deliberate edge cases','After the happy path: certificate scope mismatch and blocked ownership through a parent.'),
('One week and live demonstration','Implement in stages. The requested architecture is our choice; the PDF does not mandate Kubernetes or enterprise certification.')],[2.05,4.82])
p('The case study requires a runnable link and a five minute video; this specification supports the build and is not a substitute for those deliverables. Realistic synthetic inputs are permitted. [1]')
h('Technology baseline')
p('Next.js on the Node runtime, tRPC v11, Zod v4, Prisma schema validated against 6.19.0, PostgreSQL, Better Auth, BullMQ and Redis, private Google Cloud Storage and GKE. Prisma 6.19.0 is a reproducible schema validation baseline, not a claim that it is the newest release. Pin a mutually compatible, security supported package set and lockfile before implementation; revalidate when upgrading. The optional Python extractor has one internal contract and no direct database writes.')
p('Navigation: database and Prisma schema pages 2 to 11; identity and API contracts pages 12 to 20; SOLID architecture and diagrams pages 21 to 24; workflow and recovery pages 25 to 27; UI and scenarios pages 28 to 30; delivery and verification pages 31 to 32; sources page 33. Settings and service targets are proposed application choices unless a source is cited.')

page('1 Database design and invariants')
p('Use a shared database with tenant scoped rows. User identities can participate in more than one buyer organization, but every domain lookup includes tenantId. Composite foreign keys prevent linking a record to another tenant. Authorization still checks membership or CaseAccess on every request; foreign keys are not an access control system.')
table(['Aggregate','Responsibility and cardinality'],[
('Identity','User has many Sessions and Accounts. Tenant has many Memberships. BuyerEnrollment is an approved invitation to join the buyer team.'),
('Onboarding case','One case pins one PolicyVersion and contains many Submission versions. currentNumber points to the working version. CaseAccess links an invited user to this case only.'),
('Submission evidence','One version has at most one company, tax and bank profile; many qualifications, ownership entities, edges and documents. Profiles may be absent while a draft is incomplete.'),
('Checks and decisions','CheckRun is immutable per rule attempt. CheckEvidence references documents and fields. Issues hold independent blockers. Decisions are append only; Supplier references the exact approved snapshot.'),
('Operations','WorkItem is durable work intent; OutboxEvent publishes it; Notification records delivery. IdempotencyRecord protects commands; AuditEvent records safe metadata.')],[1.6,5.27])
h('Normalization and deliberate snapshots',2)
p('Profiles separate one to one data domains; repeating evidence and ownership relationships are child tables. A new submission copies prior values into a new version intentionally: historical approvals must remain reproducible. Submitted values, document generation and policy version never change. JSON is limited to versioned policy definitions, validated job payloads, redacted audit metadata and replayable safe responses; business relationships use foreign keys.')
h('Constraints beyond Prisma',2)
p('Migration SQL must add the constraints listed below. These are part of the design, not features supplied automatically by Prisma. The application role cannot alter schema, update audit history or modify frozen evidence. A separate migration role owns DDL.')
code('''ALTER TABLE "OwnershipEdge" ADD CONSTRAINT ownership_percent
  CHECK (percentage > 0 AND percentage <= 100);
ALTER TABLE "Document" ADD CONSTRAINT document_size
  CHECK ("sizeBytes" IS NULL OR "sizeBytes" BETWEEN 1 AND 10485760);
ALTER TABLE "Submission" ADD CONSTRAINT submission_number CHECK (number > 0);
ALTER TABLE "OnboardingCase" ADD CONSTRAINT current_submission_fk
  FOREIGN KEY ("tenantId", id, "currentNumber")
  REFERENCES "Submission" ("tenantId", "caseId", number)
  DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX one_vendor_node ON "OwnershipEntity"
  ("tenantId", "submissionId") WHERE "isVendor" = true;
''')
p('Create case and submission 1 in one transaction, setting currentNumber before commit. Add deferred constraint triggers that reject a null currentNumber, evidence attached across submissions, changes to frozen profiles or ownership, and updates to an existing Decision or AuditEvent. Validate ownership totals per owned entity, duplicate identities and graph cycles in OwnershipPolicy; incomplete ownership produces REVIEW rather than clearance. All listed triggers need migration integration tests.')

# Full schema, paginate complete model blocks without splitting models where practical.
schema=(W/'schema.prisma').read_text()
blocks=re.findall(r'(?:generator|datasource|enum|model)\s+\w+\s*\{.*?\n\}',schema,re.S)
page('2 Prisma schema')
p('The schema below is the database contract. Better Auth core tables follow its database model; run the pinned Better Auth schema generator and review the adapter diff before adopting a plugin. Domain role fields are deliberately kept out of the identity provider tables. [2]')
code(schema)

page('3 Authentication and authorization')
h('Buyer sign in and enrollment',2)
p('Use Better Auth with its Prisma adapter and Google OIDC for buyer sign in. The server handles the callback, verifies the provider response and establishes an HttpOnly Secure SameSite=Lax session cookie. Use server backed sessions; a browser JWT is unnecessary for this same origin application. Disable session cookie caching initially so revocation takes effect on the next request. Better Auth documents database sessions separately from its JWT plugin. [3, 4]')
p('Bootstrap one tenant and ADMIN membership through an audited operator seed. An admin creates BuyerEnrollment with an exact normalized email, role and expiry. On verified Google sign in, EnrollmentService atomically consumes a matching enrollment and creates Membership. A company domain match is only a hint; it never creates authority. No self service tenant creation or password signup in this release. Buyer eligibility also requires Google sign in for that session: a vendor OTP session for the same user cannot obtain buyer routes. Session.authChannel is an application extension with UNKNOWN as the default. Configure it as a server-only Better Auth additional field. A trusted post-authentication hook writes SSO_GOOGLE or EMAIL_OTP only after the corresponding flow succeeds. Unknown assurance fails closed. Disable automatic account linking for the pilot; never let client input set the channel.')
p('Application policy: eight hour session lifetime without sliding extension; fresh sign in within fifteen minutes for role changes and final decisions. Enforce membership and assurance server side. Buyer MFA is enforced at the identity provider, not inferred from email domain. SAML is deferred. Logout revokes the session and cookie.')
h('Supplier identity and invitation redemption',2)
p('InvitationService generates 32 random bytes, stores only SHA 256 of the token in Invitation and emails a seven day link. Keep the token out of application logs and analytics. Prefer a URL fragment read by the client and posted to the server, then remove it from browser history. The GET landing page never consumes the invitation, so security scanners cannot accept it.')
p('Supplier uses Better Auth email OTP to verify the exact invited address. Email OTP proves mailbox access, not company ownership. On authenticated redemption, lock Invitation; check hash, tenant and case, expiry, revocation, unused status and normalized verified email. Atomically create CaseAccess and set redeemedAt. The supplier can later sign in by OTP and resume through CaseAccess without reusing the invitation. A forwarded link alone grants nothing. [5]')
p('Use the library OTP verifier and hashed OTP storage supported by the pinned plugin. Limits: five minute OTP validity, five verification attempts, one send per minute and five sends per hour per email plus IP rate limits. Return generic login responses. Reissue invalidates previous outstanding invitations; revoking an invitation does not revoke existing CaseAccess, so the UI exposes a separate revoke access action. Keep Better Auth session storage compatible with its adapter.')
h('Role and scope rules',2)
table(['Role','Allowed scope','Limits'],[
('ADMIN','Manage buyer enrollment, roles and access; read organization cases','Cannot approve or clear compliance holds by default.'),
('BUYER','Create invitations, follow cases, request corrections','No final decision and no full bank or tax fields.'),
('REVIEWER','Review evidence and approve or reject ordinary cases','Cannot clear sanctions holds; cannot approve own created case.'),
('COMPLIANCE','Inspect ownership evidence and clear or confirm holds','Does not grant final ordinary approval unless separately assigned reviewer role.'),
('AUDITOR','Read decisions and redacted history','No mutations or original sensitive document access.'),
('SUPPLIER','Read and edit explicitly granted case drafts; upload and submit','No tenant dashboard, internal screening notes or other supplier cases.')],[1,2.8,3.07])
p('Membership grants one role per tenant in the MVP; provision distinct reviewer and compliance users. A later MembershipRole join table can support multiple roles. ADMIN is not a universal bypass. Buyer summary access does not grant original document access.')

page('4 API conventions and protection')
p('Expose application procedures under /api/trpc and Better Auth under /api/auth. Use the Node runtime. tRPC query procedures read state; mutation procedures use POST. Validate inputs and output DTOs with strict Zod schemas. The typed client is a developer aid; the server remains the trust boundary. tRPC supports reusable procedure middleware and input validators. [6]')
table(['Layer','Required behavior'],[
('Request context','requestId, verified server session, actorId and trusted active tenant context. No client supplied role. Tenant switching verifies active Membership.'),
('Identity middleware','Return UNAUTHORIZED for missing or expired session. Require correct authentication assurance for buyer procedures.'),
('Scope middleware','buyerProcedure checks membership and allowed roles; supplierProcedure checks live CaseAccess. A case ID never supplies authority on its own.'),
('Command policy','Reload case, expected revision, current submission and permissions inside the write transaction to avoid check then act races.'),
('Repository','All domain methods take TenantScope or CaseScope; composite tenant keys for selects and writes. No exposed generic findUnique(id) repository.'),
('Response projection','Map models through DTO classes. Supplier outputs exclude internal findings; all ordinary outputs mask bank and tax identifiers.'),
('Transport protections','Same origin credentials; explicit trusted origin checks for mutations; no permissive credentialed CORS. Better Auth origin protections remain enabled. Limit tRPC batch size and enforce rate limits per operation.')],[1.45,5.42])
h('Error and concurrency contract',2)
p('Return a stable domain code, requestId and retryable flag through the tRPC error formatter. BAD_REQUEST covers invalid shape; UNAUTHORIZED missing identity; FORBIDDEN insufficient role; NOT_FOUND covers inaccessible case IDs without existence disclosure; CONFLICT covers stale revisions or reused idempotency key with a different payload; TOO_MANY_REQUESTS includes retryAfterSeconds. Unexpected failures expose no stack, document content or provider payload.')
p('Every state-changing domain command carries a UUID idempotencyKey. Store canonical request hash and safe response under tenant + actor + operation + key in the same transaction as the mutation. Retain seven days as an initial policy. For commands that return signed URLs, persist the resource reservation, then issue a fresh short lived URL on replay. Store neither invite tokens nor signed URLs in IdempotencyRecord.response.')
p('Use explicit expectedCaseRevision on state transitions and expectedDraftRevision on draft writes. Lock the case row before its submission, then invitation or issue rows in a stable order. Increment revisions with compare and swap. An outdated browser receives CONFLICT and must reload; it never silently overwrites another editor. Transactions contain database work only, with bounded retries for serialization failures and deadlocks. [7]')
page('5 Buyer and administration API catalog')
p('Q means query and M means mutation. All named inputs are defined in ContractSchemas below. Every output is projected through the DTO contract; no Prisma model is returned directly. The role names below are additional to the common authorization rules.')
table(['Procedure','Input → output','Authority and write effect'],[
('identity.me Q','None → IdentityDto','Any session. Returns eligible access, never tokens.'),
('identity.selectTenant M','SelectTenant → IdentityDto','Active buyer member. Updates signed server tenant selection.'),
('team.enroll M','Enroll → EnrollmentDto','ADMIN. Upsert/reissue enrollment plus notification work and audit.'),
('team.setRole M','SetRole → MembershipDto','ADMIN with fresh sign in. Locks membership; cannot remove last active admin.'),
('team.revoke M','RevokeMember → AckDto','ADMIN. Deactivates membership, invalidates tenant selection and records audit.'),
('cases.create M','CreateCase → CaseSummaryDto','BUYER or ADMIN. Case, draft 1, pinned policy, invite and outbox in one transaction.'),
('cases.list Q','ListCases → CasePageDto','All buyer roles. Tenant scoped cursor page.'),
('cases.get Q','CaseId → BuyerCaseDto','All buyer roles. Sensitive evidence depends on reviewer or compliance access.'),
('invitations.reissue M','CaseCommand → InvitationDto','BUYER or ADMIN. Revokes outstanding invite, issues fresh link via email worker.'),
('invitations.revoke M','InviteCommand → AckDto','BUYER or ADMIN. Revokes unused invitation only.'),
('access.revoke M','RevokeAccess → AckDto','BUYER or ADMIN. Revokes supplier CaseAccess immediately.'),
('cases.requestChanges M','RequestChanges → CaseSummaryDto','BUYER or REVIEWER. Creates supplier visible issues, sets PENDING and enqueues message.'),
('reviews.resolveIssue M','ResolveIssue → IssueDto','REVIEWER. Resolve ordinary manual request with current evidence; cannot clear compliance holds or override a failed check.'),
('reviews.decide M','Decide → DecisionDto','REVIEWER. Fresh session, current version and approval guards. REJECT requires reason.'),
('compliance.resolve M','ResolveHold → IssueDto','COMPLIANCE. Requires source evidence and rationale; closes or confirms specific hold.'),
('work.retry M','RetryWork → WorkDto','ADMIN. Only failed transient job; creates audited recovery attempt without bypassing rules.'),
('analytics.summary Q','Analytics → AnalyticsDto','All buyer roles. Tenant scoped counts and timing metrics.'),
('audit.list Q','AuditQuery → AuditPageDto','Buyer roles; sensitive internal actions restricted to REVIEWER COMPLIANCE AUDITOR ADMIN.')],[1.57,2.2,3.1])
p('Policy versions are seeded from reviewed configuration for the pilot; no general policy editor API is exposed. Identity selection is application session context, not a role stored in a browser JWT. Team mutations use expected membership updatedAt or a membership revision extension before production multi-admin use; the pilot serializes them using row locks and rereads active roles.')

page('6 Supplier document and worker API catalog')
table(['Procedure','Input → output','Authority and behavior'],[
('invitations.redeem M','RedeemInvite → SupplierCaseDto','Verified supplier session; token plus email match; atomic one time redemption.'),
('supplier.cases Q','None → SupplierCaseSummaryDto[]','Only cases with live CaseAccess. Cap 100, add pagination before broader supplier organization support.'),
('supplier.get Q','CaseId → SupplierCaseDto','CaseAccess. Current public status, draft and requested actions.'),
('supplier.saveDraft M','SaveDraft → DraftAckDto','CaseAccess. Current editable draft only; update one section atomically.'),
('supplier.beginRevision M','CaseCommand → DraftAckDto','CaseAccess and open correction request. Copy previous snapshot into next draft; preserve hold issues.'),
('supplier.submit M','Submit → CaseSummaryDto','CaseAccess. Complete validated profile, clean documents and attestation; freeze and enqueue checks.'),
('documents.reserve M','ReserveDocument → UploadDto','CaseAccess and editable draft. Limits and authorized requirement kind; create RESERVED record.'),
('documents.complete M','DocumentCommand → DocumentDto','CaseAccess. Server checks GCS metadata and generation; creates scan work.'),
('documents.remove M','DocumentCommand → AckDto','CaseAccess and draft only. Tombstone metadata; asynchronous object cleanup after retention check.'),
('documents.download M','DocumentId → DownloadDto','CaseAccess for own clean originals; REVIEWER or COMPLIANCE by kind. Audit URL issuance; 60 second signed GET.'),
('runs.get Q','CaseId → RunDto','Buyer scope or CaseAccess. Project internal reasons differently for supplier.'),
('GET /health/live and /health/ready','No business input → HTTP 200 or 503','Internal probes. No sensitive dependency details; readiness checks ability to serve.'),
('POST /internal/v1/extract','ExtractionRequest → ExtractionResult','Node worker only; authenticated service identity, bounded timeout. Optional Python service.'),
('POST /internal/v1/email/events','Signed provider event → HTTP 204','Only if provider supports signed callbacks. Dedupe event ID and update monotonic delivery state.')],[1.67,2.13,3.07])
p('No public callback can change case approval. Workers call application command services directly, using a system actor scoped to the WorkItem tenant and frozen submission. The Python service may read a narrowly scoped object capability and return structured extraction; it cannot update cases, issue invitations or authorize decisions.')
page('Authentication endpoints and shared responses')
h('Authentication endpoints',2)
table(['Owner and path','Request and result'],[
('Better Auth POST /api/auth/sign-in/social','provider=google, approved callbackURL; redirect flow creates session.'),
('Better Auth GET /api/auth/callback/google','Provider callback, state validation and code exchange; library owned handler.'),
('Better Auth POST /api/auth/email-otp/send-verification-otp','email and type=sign-in; generic response. Restrict enabled OTP purposes.'),
('Better Auth POST /api/auth/sign-in/email-otp','email and otp; creates supplier assurance session.'),
('Better Auth GET /api/auth/get-session and POST /api/auth/sign-out','Sanitized session lookup and revocation; use library routes and client.'),
('Application identity.me and identity.selectTenant','Current actor, eligible memberships or supplier cases; switching only after membership check.')],[3.1,3.77])

h('Output data contract',2)
code('''interface AckDto { requestId: string; ok: true }
interface CaseSummaryDto {
  id: string; status: CaseStatus; revision: number;
  currentNumber: number; legalName: string | null;
  createdAt: string; updatedAt: string;
  nextAction: { code: string; owner: string; message: string } | null;
}
interface DraftAckDto { caseId: string; submissionId: string;
  number: number; draftRevision: number; caseRevision: number }
interface RunDto { caseId: string; submissionId: string; stages: {
  stage: 'INTAKE'|'DOCUMENTS'|'CHECKS'|'DECISION'|'FOLLOW_UP';
  state: 'WAITING'|'RUNNING'|'PASSED'|'ACTION_REQUIRED'|'FAILED';
  startedAt: string|null; completedAt: string|null;
  reasonCodes: string[]; attempt: number;
}[]; updatedAt: string }
interface UploadDto { documentId: string; url: string;
  method: 'PUT'; headers: Record<string,string>; expiresAt: string }
interface DownloadDto { url: string; expiresAt: string }
''')

page('7 Contract schemas')
p('All dates crossing the API are UTC ISO 8601 strings; Decimal percentages are decimal strings, not floating point JSON numbers. IDs are opaque strings; tenantId is never a domain command input; identity.selectTenant is the explicit membership-checked exception. Use Prisma generated enum types internally and identical Zod enum values at the transport boundary. Unknown object keys are rejected. The following class owns reusable validation schemas. [8]')
code('''import { z } from 'zod';
export class ContractSchemas {
  static readonly id = z.string().min(1).max(64);
  static readonly key = z.uuid();
  static readonly text = z.string().trim().min(1).max(200);
  static readonly email = z.email().max(254);
  static readonly country = z.enum(['US', 'AE']);
  static readonly role = z.enum(['ADMIN','BUYER','REVIEWER','COMPLIANCE','AUDITOR']);
  static readonly status = z.enum(['INVITED','DRAFT','SUBMITTED',
    'PENDING','APPROVED','REJECTED']);
  static readonly kind = z.enum(['REGISTRATION','TAX','BANK','CERTIFICATE','OWNERSHIP']);
  static readonly None = z.strictObject({});
  static readonly CaseId = z.strictObject({ caseId: this.id });
  static readonly CaseCommand = this.CaseId.extend({
    expectedCaseRevision: z.int().nonnegative(), idempotencyKey: this.key });
  static readonly SelectTenant = z.strictObject({
    tenantId: this.id, idempotencyKey: this.key }); // identity context only
  static readonly Enroll = z.strictObject({ email: this.email,
    role: this.role, idempotencyKey: this.key });
  static readonly SetRole = z.strictObject({ membershipId: this.id,
    role: this.role, idempotencyKey: this.key });
  static readonly RevokeMember = z.strictObject({ membershipId: this.id,
    idempotencyKey: this.key });
  static readonly CreateCase = z.strictObject({ supplierEmail: this.email,
    country: this.country, category: z.literal('CALIBRATION'),
    requestedSite: this.text, idempotencyKey: this.key });
  static readonly ListCases = z.strictObject({ status: this.status.optional(),
    country: this.country.optional(), search: z.string().max(120).optional(),
    cursor: z.string().max(512).optional(), limit: z.int().min(1).max(100).default(25) });
  static readonly InviteCommand = this.CaseCommand.extend({ invitationId: this.id });
  static readonly RevokeAccess = this.CaseCommand.extend({ userId: this.id });
  static readonly RedeemInvite = z.strictObject({ token:
    z.string().regex(/^[A-Za-z0-9_-]{43}$/), idempotencyKey: this.key });
  static readonly RequestChanges = this.CaseCommand.extend({
    submissionId: this.id, requests: z.array(z.strictObject({
      code: z.enum(['MISSING_EVIDENCE','SCOPE_MISMATCH','DETAIL_MISMATCH']),
      message: z.string().trim().min(10).max(1000)
    })).min(1).max(20) });
  static readonly Decide = this.CaseCommand.extend({ submissionId: this.id,
    outcome: z.enum(['APPROVE','REJECT']), rationale: z.string().min(10).max(2000) });
  static readonly ResolveIssue = this.CaseCommand.extend({ submissionId: this.id,
    issueId: this.id, evidenceDocumentIds: z.array(this.id).min(1).max(20),
    rationale: z.string().min(10).max(2000) });
  static readonly ResolveHold = this.CaseCommand.extend({ submissionId: this.id,
    issueId: this.id, disposition: z.enum(['CLEARED','CONFIRMED']),
    evidenceDocumentIds: z.array(this.id).min(1).max(20),
    rationale: z.string().min(20).max(2000) });
  static readonly RetryWork = z.strictObject({ workItemId: this.id,
    reason: z.string().min(10).max(500), idempotencyKey: this.key });
  static readonly Analytics = z.strictObject({
    from: z.iso.datetime(), to: z.iso.datetime() });
  static readonly AuditQuery = this.CaseId.extend({
    cursor: z.string().max(512).optional(), limit: z.int().min(1).max(100).default(25) });
}
''')
p('Domain validation adds from < to and a maximum ninety day analytics window, authorized enum transitions, correct evidence ownership, country profile requirements and role permissions. Zod shape validation alone cannot express database state or authorization.')

page('Contract schemas continued')
code('''export class ProfileSchemas {
  static readonly Company = z.strictObject({
    legalName: ContractSchemas.text, registryId: ContractSchemas.text,
    jurisdiction: ContractSchemas.text, country: ContractSchemas.country,
    addressLine1: ContractSchemas.text,
    addressLine2: z.string().max(200).optional(), city: ContractSchemas.text,
    postalCode: z.string().max(20).optional(), contactName: ContractSchemas.text,
    contactEmail: ContractSchemas.email });
  static readonly Tax = z.strictObject({
    formType: z.enum(['W9','W8BEN_E','OTHER_REVIEW']),
    taxId: z.string().min(1).max(40).optional(), vatRegistered: z.boolean(),
    vatTrn: z.string().max(40).optional() });
  static readonly Bank = z.strictObject({ beneficiary: ContractSchemas.text,
    country: ContractSchemas.country, currency: z.enum(['USD','AED']),
    account: z.string().min(4).max(64), routing: z.string().max(40).optional() });
  static readonly Qualification = z.strictObject({ activity: ContractSchemas.text,
    site: ContractSchemas.text, standard: ContractSchemas.text });
  static readonly Ownership = z.strictObject({
    entities: z.array(z.strictObject({ key: ContractSchemas.id,
      legalName: ContractSchemas.text, registryId: z.string().max(200).optional(),
      country: z.string().regex(/^[A-Z]{2}$/), isVendor: z.boolean()
    })).min(1).max(100),
    edges: z.array(z.strictObject({ ownerKey: ContractSchemas.id,
      ownedKey: ContractSchemas.id,
      percentage: z.string().regex(/^(100(\\.0{1,4})?|[0-9]{1,2}(\\.[0-9]{1,4})?)$/),
      evidenceDocumentId: ContractSchemas.id.optional()
    })).max(200) });
  static readonly Section = z.discriminatedUnion('section', [
    z.strictObject({ section: z.literal('company'), value: this.Company }),
    z.strictObject({ section: z.literal('tax'), value: this.Tax }),
    z.strictObject({ section: z.literal('bank'), value: this.Bank }),
    z.strictObject({ section: z.literal('qualifications'),
      value: z.array(this.Qualification).min(1).max(20) }),
    z.strictObject({ section: z.literal('ownership'), value: this.Ownership }) ]);
}
export class EvidenceSchemas {
  static readonly Draft = ContractSchemas.CaseCommand.extend({
    submissionId: ContractSchemas.id, expectedDraftRevision: z.int().nonnegative() });
  static readonly SaveDraft = this.Draft.extend({ change: ProfileSchemas.Section });
  static readonly Submit = this.Draft.extend({ attested: z.literal(true) });
  static readonly ReserveDocument = this.Draft.extend({
    kind: ContractSchemas.kind, contentType: z.literal('application/pdf'),
    sizeBytes: z.int().min(1).max(10_485_760),
    sha256: z.string().regex(/^[a-f0-9]{64}$/) });
  static readonly DocumentId = ContractSchemas.CaseId.extend({
    documentId: ContractSchemas.id });
  static readonly DocumentCommand = this.Draft.extend({ documentId: ContractSchemas.id });
}
export type SaveDraftInput = z.infer<typeof EvidenceSchemas.SaveDraft>;
export type DecisionInput = z.infer<typeof ContractSchemas.Decide>;
''')
p('A draft may omit whole sections, but each saved section must be structurally valid. Partial field autosave stays in memory until its section validates; do not persist bank or tax drafts to browser localStorage. TaxPolicy validates format and applicability by profile; a valid EIN or VAT format is not proof that it belongs to the supplier. Encrypt sensitive inputs before any persistent write.')

page('8 Output schemas and service interfaces')
p('Use DTO constructors with strict output validators generated from these interfaces. Strings ending At are ISO dates; optional absent data is consistently null. Read APIs never return ciphertext, access tokens, invitation tokens or raw tax and bank values. The supplier and buyer projections are separate types, not a shared object with hidden UI fields.')
code('''interface IdentityDto { userId: string; email: string; activeTenantId: string|null;
  memberships: MembershipDto[]; supplierCases: {caseId:string}[] }
interface MembershipDto { id:string; tenantId:string; role:BuyerRole; active:boolean }
interface EnrollmentDto { id:string; email:string; role:BuyerRole; expiresAt:string }
interface InvitationDto { id:string; caseId:string; expiresAt:string;
  state:'SENT'|'QUEUED'|'FAILED'|'REVOKED'|'REDEEMED' }
interface DocumentDto { id:string; kind:DocumentKind; status:DocumentStatus;
  sizeBytes:number|null; createdAt:string; reasonCode:string|null }
interface IssueDto { id:string; code:string; ownerRole:BuyerRole;
  openedAt:string; resolvedAt:string|null; supplierMessage:string|null }
interface DecisionDto { id:string; submissionId:string; outcome:DecisionOutcome;
  rationale:string; reviewerId:string; createdAt:string; case:CaseSummaryDto }
interface WorkDto { id:string; kind:WorkKind; state:WorkState; attempt:number;
  availableAt:string; lastErrorCode:string|null }
interface SafeProfiles { company:CompanyInput|null; tax:{formType:TaxForm;
  vatRegistered:boolean; taxIdPresent:boolean; vatTrnPresent:boolean}|null;
  bank:{beneficiary:string;country:string;currency:string;accountLast4:string}|null;
  qualifications:QualificationInput[]; ownership:OwnershipInput|null }
interface SupplierCaseDto { case:CaseSummaryDto; draft:DraftAckDto;
  requirements:RequirementDto[]; profiles:SafeProfiles; documents:DocumentDto[];
  actions:{code:string;message:string}[]; run:RunDto }
interface BuyerCaseDto extends SupplierCaseDto { checks:CheckDto[];
  issues:IssueDto[]; decisions:DecisionDto[] }
interface RequirementDto { kind:DocumentKind; required:boolean;
  reason:string; authority:'BUYER_POLICY'|'TAX_REVIEW'; policyVersion:number }
interface CheckDto { id:string;ruleKey:string;ruleVersion:string;attempt:number;
  result:CheckResult;sourceMode:SourceMode;checkedAt:string;validUntil:string|null;
  reasonCode:string;sourceRef:string|null;evidence:{documentId:string|null;page:number|null;fieldPath:string}[] }
interface AuditDto { id:string;actorId:string|null;action:string;entityType:string;
  entityId:string;requestId:string;createdAt:string;safeMetadata:Record<string,unknown> }
interface CasePageDto { items:CaseSummaryDto[];nextCursor:string|null }
interface AuditPageDto { items:AuditDto[];nextCursor:string|null }
interface AnalyticsDto { asOf:string;byStatus:Record<CaseStatus,number>;
  supplierActionCount:number;reviewerActionCount:number;complianceHoldCount:number;
  completedCount:number;medianCompletionHours:number|null;reworkRate:number|null }
interface TenantScope { tenantId:string;actorId:string;requestId:string }
interface CaseScope extends TenantScope { caseId:string }
interface JobEnvelope { schemaVersion:1;workItemId:string }
interface CaseRepository { lock(scope:CaseScope, tx:Transaction):Promise<CaseRecord> }
interface UnitOfWork { execute<T>(command:TransactionalCommand<T>):Promise<T> }
interface TransactionalCommand<T> { run(tx:Transaction):Promise<T> }
interface ObjectStore { reserve(input:UploadIntent):Promise<UploadDto>;
  inspect(objectKey:string):Promise<ObjectMetadata> }
interface ScreeningProvider { screen(input:FrozenScreeningInput):Promise<ScreeningEvidence> }
interface Clock { now():Date }
''')
p('CompanyInput, QualificationInput and OwnershipInput are z.infer aliases of ProfileSchemas fields; SupplierCaseSummaryDto is CaseSummaryDto. Transaction, CaseRecord and provider payload types are internal ports implemented by adapters. Do not use unbounded arbitrary JSON in AuditDto: the serializer selects an allowlist by action. This document specifies interfaces and behavior; it is not an implemented or typechecked application.')

page('Internal extraction and policy contracts')
p('The Python service is optional. The initial TypeScript worker can implement the same Extractor port. Use Python only when the selected OCR or document parsing dependency benefits from it; a second language is not required for CRUD or workflow decisions.')
code("""interface ExtractionRequest {
  schemaVersion:1; workItemId:string; documentId:string;
  object:{generation:string;sha256:string;readUrl:string;expiresAt:string};
  extractorVersion:string; profile:'US_CORPORATE_CALIBRATION';
  limits:{maxPages:50;maxBytes:10485760};
}
interface ExtractedField {
  path:string; value:string|null; confidence:number;
  evidence:{page:number;quote:string}[];
}
interface ExtractionResult {
  schemaVersion:1;workItemId:string;documentId:string;generation:string;
  extractorVersion:string;modelVersion:string|null;
  fields:ExtractedField[];
  warnings:{code:'UNREADABLE'|'MISSING_FIELD'|'CONFLICT'|'UNSUPPORTED';
    fieldPath:string|null}[];
}
interface PolicyDefinition {
  schemaVersion:1;profile:'US_CORPORATE_CALIBRATION'|'AE_MAINLAND_CORPORATE';
  requirements:{kind:DocumentKind;when:'ALWAYS'|'VAT_REGISTERED'|'TAX_APPROVED';
    authority:'BUYER_POLICY'|'TAX_REVIEW';reason:string}[];
  rules:{key:string;version:string;required:boolean;maxAgeHours:number|null}[];
  requireIndependentReviewer:true;
  maxDocuments:20;maxDocumentBytes:10485760;
}
interface ScreeningEvidence {
  result:'PASS'|'REVIEW'|'UNAVAILABLE';sourceMode:'LIVE'|'MANUAL'|'FIXTURE';
  sourceRef:string;datasetVersion:string;checkedAt:string;validUntil:string|null;
  matches:{entityKey:string;sourceEntityId:string;matchType:'EXACT'|'POSSIBLE'}[];
  ownershipTrace:{ownerKey:string;ownedKey:string;percentage:string}[];
}
""")
p('Strict internal validation checks workItemId, documentId and generation against the request; confidence is 0 to 1, pages are positive integers within the parsed count, field paths are allowlisted by document kind, at most 200 extracted fields and at most three evidence quotations of 500 characters per field. Missing values are null. Confidence is a model signal, not calibrated proof. The worker stores encrypted extraction JSON in private GCS and persists Extraction.outputRef, never logging the body.')
p('The worker obtains a short lived Google signed identity token with the extractor audience. The internal service validates issuer, audience, expiry and an allowlisted service account identity; Kubernetes NetworkPolicy adds network isolation. Signed object read URLs remain in memory and are stripped from tracing. A 90 second request timeout cancels the attempt; retry uses the same work ID and fixed object generation. HTTP 422 is permanent input failure; 429 and 503 are retryable.')
p('PolicyVersion.definition is immutable after publication and validated against PolicyDefinition before seeding. The US policy requires company identity, tax, bank, certificate and ownership evidence. Required rule keys are ENTITY_CONSISTENCY, TAX_PROFILE, BANK_BENEFICIARY, CERTIFICATE_SCOPE and OWNERSHIP_SCREENING. Initially set screening freshness to 24 hours and other evidence freshness to document expiry where relevant; expired evidence requires new checks. Only the pinned policy controls the decision, never an LLM generated policy.')
p('For the pilot, provider source mode is configured per check and visible beside its result. A FIXTURE result can satisfy a demonstration policy only. A production policy rejects fixture-backed clearance. The same schema carries dataset version and source references so historical results remain reproducible.')

page('9 Class architecture and SOLID boundaries')
p('All business behavior lives in classes. Routers validate and delegate; services coordinate use cases; domain policy classes decide; repositories persist; adapters call external systems. Constructors receive narrow interfaces. CompositionRoot builds the graph once per process, while request scope contains only identity and tenant context. Avoid a generic BaseService with mixed responsibilities.')
table(['Component','Responsibility and dependency'],[
('AuthConfiguration and AuthGateway','Configure Better Auth; map trusted session to ActorContext. Depend on identity adapter, not workflow repositories.'),
('InvitationService and EnrollmentService','Issue or redeem supplier invitations; enroll buyers. Depend on UnitOfWork, random token generator and Clock.'),
('DraftService and SubmissionService','Validate editable data; freeze versions and enqueue work. Depend on repositories and ProfilePolicy.'),
('DecisionService and ApprovalPolicy','Apply current version, issue, freshness, role and separation of duty guards; record decision atomically.'),
('DocumentService and EvidenceWorker','Reserve uploads and scan/extract a fixed generation. Depend on ObjectStore, Scanner and Extractor ports.'),
('VerificationOrchestrator and CheckStrategy','Run required rule strategies and persist CheckRun. RegistryPolicy, BankNamePolicy, TaxPolicy, CertificateScopePolicy and OwnershipPolicy are substitutable strategies.'),
('OutboxDispatcher and WorkCoordinator','Publish committed work, acquire leases, fence commits and reconcile stale jobs.'),
('NotificationService and MailProvider','Render approved templates, dedupe delivery and record outcome; no workflow decision authority.'),
('BuyerDashboardController and SupplierFormController','Fetch DTOs, manage view state and submit commands; no eligibility rules duplicated in UI.')],[2.3,4.57])
p('Single responsibility separates decisions from delivery. Open closed design adds a CheckStrategy or provider adapter without changing the orchestrator. Liskov substitution requires every provider to distinguish PASS, REVIEW and UNAVAILABLE, rather than treating a missing response as success. Interface segregation keeps upload, screening and email ports separate. Dependency inversion keeps domain policy independent of Prisma, Redis and HTTP.')
h('Protected procedure pattern',2)
code('''export class CaseRouter {
  constructor(private readonly procedures: ProtectedProcedures,
              private readonly controller: CaseController) {}
  build() {
    return this.procedures.router({
      create: this.procedures.buyer(['BUYER','ADMIN'])
        .input(ContractSchemas.CreateCase)
        .output(ResponseSchemas.CaseSummary)
        .mutation(this.controller.create.bind(this.controller)),
      get: this.procedures.buyerReader()
        .input(ContractSchemas.CaseId)
        .output(ResponseSchemas.BuyerCase)
        .query(this.controller.get.bind(this.controller))
    });
  }
}
// ProtectedProcedures builds tRPC middleware from bound class methods.
// Its middleware checks session and scope; each service repeats write guards
// inside the transaction. ResponseSchemas mirrors the DTOs above.
''')
p('Next.js and tRPC require callable framework entry points. Export bound adapter methods for GET and POST; keep their behavior inside classes. React supports class components but recommends functions for new code. To honor the requested class approach, use client class components and controllers with the imperative tRPC client; do not attempt hooks inside classes. A minimal framework page or layout adapter may delegate rendering to a class. This is a deliberate project constraint, not an industry requirement. [9]')

page('10 Network and deployment topology')
p('Reuse the existing GKE cluster. Keep one modular TypeScript codebase with separate web, worker and dispatcher deployments; these are independently scalable processes, not separately owned microservices. PostgreSQL and Redis use managed services outside the cluster. No database or queue is publicly reachable.')
picture('network.png','Figure 1  Runtime trust boundaries and principal connections')
table(['Connection','Control'],[
('Browser to web and GCS','HTTPS only; exact origin CORS for upload; scoped expiring capability for one object.'),
('Web worker dispatcher to Cloud SQL','Cloud SQL Auth Proxy sidecar, private IP path and per-service database role. Proxy authorizes connection; DB roles authorize queries. [10]'),
('GKE to Google APIs','Workload Identity Federation and dedicated Kubernetes service accounts; no downloaded service account keys. [11]'),
('Web to worker or extractor','Web persists work; no synchronous extraction. Only worker can reach internal extractor through NetworkPolicy and authenticated service credentials.'),
('Provider egress','HTTPS to configured identity, mail and verification providers. Default deny network policies with DNS and explicit approved egress paths.')],[2,4.87])
p('Use a private GCS bucket with public access prevention, uniform access and distinct quarantine/evidence permissions. Secrets come from Secret Manager; KMS protects application encryption keys. Cloud SQL and Redis topology, region, capacity and service compatibility must be verified against the existing cluster before deployment; having a cluster does not establish these controls automatically.')

page('11 Sequence for buyer invitation and supplier access')
picture('invite.png','Figure 2  Authentication invitation delivery and one time redemption')
p('Boundary A: case creation commits before any email is sent. A mail outage leaves an auditable INVITED case with failed or queued delivery; the buyer can retry. Boundary B: OTP authentication and invitation redemption are separate. If redemption fails, the session still has no case access. Concurrent redemption succeeds once; an identical retry by the same verified actor returns the granted case without creating a second CaseAccess.')
p('The invitation notification needs the original link token for delivery. Store it only within the KMS encrypted Notification payload, purge that secret after successful delivery or expiry, and keep Invitation.tokenHash for verification. A plain token must never appear in the outbox, queue, audit event or normal response.')

page('12 Sequence for evidence checks and approval')
picture('submit.png','Figure 3  Direct upload asynchronous evidence processing and guarded approval')
p('The browser polls runs.get every two seconds while the page is visible; back off to ten seconds on inactive views or errors. The live run reflects WorkItem, document and check records, not a timer animation. Intake and document stages can precede submission; verification only reads the frozen submitted version. VERIFY waits until all required EXTRACT jobs succeed. Dependency waiting does not consume failure retries; a permanent extraction failure becomes an actionable issue. Document CLEAN means malware scanning passed, not that extraction or verification succeeded.')
p('For corrections, beginRevision creates version n+1 with copied profile values and independent document references or generation-pinned server copies. Freeze the old version. Carry unresolved holds into the new version. Old work may finish and remain visible in history, but the commit guard prevents it changing current case status. Recheck all required rules for the MVP; selective dependency-based reuse is deferred.')

page('13 State machine and decision transaction')
table(['From and event','To','Guard and durable writes'],[
('No case then buyer creates','INVITED','Case plus draft 1, policy, invitation, notification work, outbox and audit in one transaction.'),
('INVITED then supplier redeems or saves','DRAFT','Verified supplier and CaseAccess. Redemption does not imply a completed profile.'),
('DRAFT then supplier submits','SUBMITTED','All required sections valid, documents CLEAN, attestation recorded; freeze submission and create VERIFY work.'),
('SUBMITTED then checks finish','PENDING','Checks and issues recorded; either supplier action, compliance review or ready for ordinary reviewer.'),
('PENDING then corrections begin','DRAFT','Open correction request. New version, currentNumber increment, unresolved holds preserved.'),
('PENDING then reviewer approves','APPROVED','Current frozen version, fresh mandatory PASS or authorized resolution, no blocking issue; atomic Decision and Supplier.'),
('PENDING then reviewer rejects','REJECTED','Confirmed disqualification and reason; if sanctions hold exists, compliance confirmation required first.'),
('APPROVED or REJECTED','Terminal','No editing or reopening in MVP. A new case is required for future onboarding changes.')],[2.1,.95,3.82])
p('Display Approved, Pending or Rejected as the business outcome. INVITED, DRAFT and SUBMITTED are progress states with outcome “not decided”. Processing failures map to Pending once a submission exists; UNAVAILABLE never becomes a pass. A case ready for a human reviewer is Pending with nextAction=REVIEW_REQUIRED, not a misleading failure.')
h('Approval command algorithm',2)
p('DecisionService starts a transaction and locks the case. It verifies tenant, reviewer membership, fresh buyer assurance, reviewerId different from createdById, expected revision and submitted currentNumber. It reads the pinned policy, latest completed check attempt for every required rule and all unresolved issues. PASS must still be valid at decision time. A sanctioned ownership issue must have an explicit compliance disposition; clearing a false positive does not automatically pass unrelated rules.')
p('If any check is missing, stale, unavailable or unresolved, approval returns PRECONDITION_NOT_MET with safe blocking codes. Otherwise insert Decision(APPROVE), Supplier with approvedSubmissionId, update case status and revision, and create notification WorkItem, OutboxEvent and AuditEvent. Commit once. A concurrent decision loses the revision comparison and cannot create another approval. Duplicate registryKey returns a reviewable duplicate supplier conflict; do not silently merge legal entities.')
p('Issue resolution is version scoped. VerificationOrchestrator may close a rule-generated ordinary issue only after the corresponding current rule passes. A reviewer closes a manual correction request through reviews.resolveIssue with current evidence and rationale; this does not change failed check results. Only COMPLIANCE resolves a compliance hold. Each resolution is audited, and copied holds retain their origin in audit history. Approval still evaluates every required check independently.')
h('Bank and document credibility',2)
p('Compare declared beneficiary and extracted bank evidence with the legal name; normalize punctuation and legal suffixes without claiming a fuzzy match proves ownership. A material mismatch is Pending and requires a corrected document or separately verified explanation. No account payment or bank ownership verification is implied. PDFs are evidence, not proof of authenticity; missing registry or certification source access must be shown as MANUAL or UNAVAILABLE.')

page('14 Asynchronous work recovery and idempotency')
p('BullMQ is the execution transport. PostgreSQL WorkItem and OutboxEvent are the durable record of required work. Queue messages contain only schemaVersion and workItemId. Redis loss must delay processing, not erase business intent. BullMQ recommends retry safe jobs and an appropriate Redis persistence and eviction configuration. [12, 13]')
h('Dispatch and worker protocol',2)
p('OutboxDispatcher claims unpublished rows with SELECT FOR UPDATE SKIP LOCKED in a short transaction and a thirty second lease. It publishes jobId=workItemId, then marks publishedAt. If it crashes between publish and mark, re-publication is safe. The worker reads WorkItem, acquires a lease by conditional update and increments leaseEpoch. Every result commit includes the same epoch and RUNNING state; a worker whose lease expired cannot overwrite a newer attempt.')
p('Persist stage output, WorkItem completion, any downstream WorkItem and its OutboxEvent in one transaction. Never mark work complete before evidence is saved. A sixty second reconciler scans READY work past availableAt, published work without progress and expired RUNNING leases. It repairs queue state and republishes or schedules retry. Retained failed BullMQ jobs must be explicitly retried or removed before re-adding the same jobId; a fresh add alone is not recovery.')
table(['Work kind','Retry policy','Failure result'],[
('SCAN','3 attempts, exponential 5 second base plus jitter; 60 second lease with heartbeat','Malware or invalid file is permanent Document REJECTED. Scanner outage is retryable; keep quarantined.'),
('EXTRACT','3 attempts, 30 second base; provider timeout 90 seconds; 120 second renewable lease','Unreadable PDF creates action required. Provider outage remains UNAVAILABLE; no invented values.'),
('VERIFY','5 attempts, 10 second base; per provider timeout 15 seconds','HTTP 429 honors Retry-After within cap; auth/config errors need operator action. Persist attempt and source.'),
('NOTIFY','5 attempts, 30 second base; bounded send timeout','Record failed or unknown delivery. Case decision remains committed; alert and permit controlled resend.')],[.8,3.05,3.02])
p('These are initial settings to tune using measured latency. Distinguish business negatives from transient failures. Do not retry a known rejected document or confirmed disqualification as if it were a network error. After the configured limit, WorkItem is FAILED, an operator task is visible and retry requires an audited reason. Provider circuit breakers pause new calls without changing outcomes.')
h('Exactly once boundaries',2)
p('Database effects are deduplicated by unique command and work keys. External email delivery is at least once: use a provider idempotency key when available, but a timeout after provider acceptance can still leave delivery uncertain. Save UNKNOWN, reconcile provider status where supported and avoid blind resend. External scanning and extraction may run twice; only a fenced result is committed. Do not describe the whole workflow as exactly once.')
p('Deterministic work key format: kind/submissionId/documentId or ruleKey/version. Keep raw PII out of the key. A repeated client request after seven day idempotency expiry still encounters state guards and natural unique constraints. Roll back and retry serialization failures at most three times with jitter; return a retryable error when exhausted.')

page('15 Storage lifecycle privacy and audit')
table(['Stage','PostgreSQL','GCS and Redis'],[
('Create and invite','Case, draft, token hash, encrypted Notification payload and outbox','Redis receives work ID only. No document object yet.'),
('Draft entry','Company/contact fields; encrypted bank and tax fields; versioned children','Browser memory only for unfinished sensitive inputs.'),
('Upload','Document reservation then fixed generation, checksum and size','Quarantine object at random server generated key; no names in path.'),
('Scan and extraction','Document status; Extraction pointer/version; work timing','Clean fixed-generation evidence; encrypted extraction JSON including page evidence. No OCR text in Redis.'),
('Submit and verify','Frozen version, CheckRun, CheckEvidence, Issues and audit events','Restricted evidence remains linked to version; work contains IDs.'),
('Decision and notification','Decision, Supplier when approved, delivery status and safe audit','Temporary encrypted email link payload purged after delivery/expiry.'),
('Retention expiry','Audited purge metadata subject to hold policy','Generation-specific deletion, derivative cleanup and backup retention process.')],[1.25,2.8,2.82])
h('Upload and extraction security',2)
p('Accept PDFs only, at most 10 MiB each and twenty active documents per draft. Enforce extension, actual file signature and content parsing limits; reject encrypted or unsupported PDFs for resubmission. Size declared by the client is not trusted: verify stored metadata, recompute SHA256 from object bytes in the scanner against the reservation, scan in quarantine and enforce worker CPU, memory, page and decompression limits. Use random object keys and least privilege. These controls follow OWASP upload guidance. [14]')
p('Signed uploads expire after five minutes. Require create-only semantics supported by the selected GCS upload API, enforce expected generation, and preserve the inspected generation through scan and extraction. GCS generations and request preconditions protect against overwrites and stale operations. Never accept an arbitrary objectKey or remote URL supplied by the browser. Expired or orphaned reservations are reconciled after one hour. [15, 16]')
p('Treat document text as untrusted data, including any instructions embedded inside it. Extraction may return field values, confidence and document page references only. It cannot call tools, choose approval, change bank details or execute text from a PDF. Validate structured output, require evidence for each value and route uncertain or conflicting values to review. Send only required content to an approved model provider; full bank and tax identifiers are excluded unless explicitly required and approved.')
h('Privacy and audit contract',2)
p('Use envelope encryption for bank account, routing and tax identifiers, with KMS key version and authenticated tenant/record context. Compute bank fingerprints with a keyed HMAC for duplicate detection, not an unsalted hash. Ordinary responses show last four digits only. Restrict original BANK and TAX document downloads to the supplier and designated reviewer; compliance gets ownership evidence unless separately authorized.')
p('AuditEvent captures actor, tenant, action, entity, requestId, timestamp, safe reason code and changed field names. It must not contain request bodies, OTPs, auth headers, session tokens, signed URLs, full identifiers or extracted text. Disable raw request and provider body logging; a centralized RedactionService allowlists log fields. Application role has INSERT/SELECT only on audit records; export to a separately controlled retention bucket for stronger tamper resistance. This is not a cryptographic immutability claim.')
p('Proposed retention: seven days for command replays, thirty days for operational logs, one hour for orphan uploads; business evidence and audit retention require buyer approval by jurisdiction and contract. Legal holds override deletion. Do not invent a universal seven year rule. Include object versions, extraction derivatives and backups in the deletion policy and verify a restore drill before using real PII.')

page('16 Buyer workspace design')
picture('buyer-ui.png','Figure 4  Buyer dashboard and case review layout with illustrative data')
p('The table is the operational home: legal name, status, age, next owner/action, unresolved issues, invitation delivery and last update. Filters include status, supplier country and category. Selecting a case opens Company, Tax, Banking, Documents, Checks, Issues and History tabs. Sensitive fields remain masked. Each check shows source mode, date, rule version, reason and evidence page; FIXTURE is visibly labeled as demonstration data.')
p('A fixed stage strip shows Intake, Documents, Checks, Decision and Follow-up. A provider error is separate from a failed eligibility check. Approve is disabled with specific blocking reasons, and the server rechecks all guards on click. Request changes requires specific supplier-visible actions. Reject requires rationale. Compliance notes and screening evidence have a separate restricted panel.')
h('Analytics definitions',2)
p('Status cards count current cases in the selected tenant. Supplier action count counts distinct cases with unresolved supplier requests; compliance hold count is a separate count and may overlap. Median completion hours uses createdAt to final APPROVE/REJECT decision for cases completed within the chosen window; show completedCount and null when no sample. Rework rate is cases with submission number >1 divided by cases with at least one submitted version in the selected creation cohort. Do not mix these denominators or label waiting time as reviewer handling time.')
p('Compute current counts directly with indexed queries for the pilot; cap the date range and page lists by createdAt plus id. Read replicas or materialized reporting projections are later options. Decisions and access checks always read the primary. Display asOf and explain delayed refresh rather than presenting cached analytics as live workflow truth.')

page('17 Supplier portal design')
picture('vendor-ui.png','Figure 5  Supplier draft form and submission controls')
p('Start with a plain invitation page naming the buyer and intended recipient in a masked form. Authenticate before showing full case details. Steps are Company, Tax, Banking, Ownership and qualifications, Documents, and Review. Requirements explain what is needed and why; optional VAT evidence is not shown as mandatory for an unregistered UAE supplier. Each section shows saved time and validation feedback.')
p('Document rows distinguish Reserved, Uploading, Scanning, Clean and Rejected; a completed upload is not labeled verified. Allow a retry against the same reservation while valid, then a new reservation. Show file specific errors without raw scanner messages. Disable submission until required evidence is clean and the supplier attests that information is accurate and authorized.')
p('After submit, the form is read only and shows the business outcome, next actor and next action. Pending requests list the exact missing annex or conflicting detail. Begin correction creates a new version; show what changed before resubmission. Internal sanctions hypotheses are not exposed as allegations. Approved means eligible under this onboarding policy, not that payment has been executed.')
h('Frontend class structure and accessibility',2)
p('BuyerDashboardPage, CaseDetailPage and SupplierWizardPage are client class components. Their controllers own API calls and observable view state; ProfileFormModel owns local form state; ApiClient wraps the imperative tRPC client. Bind lifecycle handlers, cancel fetches and polling on unmount, and handle stale revision conflicts with a reload/review dialog. Shared validation shapes can provide immediate feedback, while server policy remains authoritative.')
p('Use visible labels, keyboard navigation, focus on validation errors, descriptive buttons and a polite live region for stage changes. Do not rely on color alone. Include loading, empty, forbidden, expired invitation, stale edit and temporary outage views. A failed notification does not disappear from the dashboard because the case itself succeeded.')

page('18 Scenarios rules and regional evidence')
h('Happy path for the initial release',2)
p('Nova Calibration Inc is a fictional Delaware corporate supplier. The buyer invites its authorized contact for a specified calibration site and activity. The supplier submits company registration evidence, W9, bank evidence naming the same company, a certificate and scope annex covering the requested work, and a complete declared ownership graph. Extraction finds consistent identifiers; required checks pass against clearly labeled sources. The independent reviewer approves, creating Supplier from the frozen version and sending confirmation.')
h('Later edge case one certificate scope mismatch',2)
p('Atlas Calibration submits a valid certificate for its head office, but Harbor is procuring work at a different service site. CertificateScopePolicy compares the requested site and activity with the certificate scope and annex; validity alone is insufficient. It creates SCOPE_MISMATCH, sets Pending and requests the site annex or alternative evidence. The supplier revises; all required rules rerun against the new snapshot. Reviewer approval remains blocked while scope is unresolved.')
h('Later edge case two ownership through a blocked parent',2)
p('A fictional blocked entity owns 60 percent of Parent A, and Parent A owns 80 percent of Orion Instruments. Under OFAC’s illustrated cascading ownership interpretation, the parent becomes blocked and its majority owned subsidiary can also be blocked. Multiplying 60 by 80 to conclude 48 percent and clear the vendor is incorrect. OwnershipPolicy records the graph, dated screening evidence and a compliance hold; it never rejects merely because a contact has Russian nationality. [17]')
p('The demo uses a dated, clearly labeled fixture screening dataset with a real running graph/rules process. It is not live clearance. Unknown owners, cycles, insufficient evidence, approximate name matches or unavailable providers produce REVIEW or UNAVAILABLE. Compliance confirms or clears the specific finding with evidence; ordinary reviewers cannot bypass it. Broader sanctions programs and transactions remain outside this limited rule demonstration.')
h('Requirements by supplier profile',2)
table(['Profile','Evidence and rationale'],[
('US incorporated supplier','Company identity and registry evidence under buyer policy; W9 for US taxpayer information; bank beneficiary evidence; certificate scope where required by calibration category. IRS guidance supports W9 use, not a universal procurement approval rule. [18]'),
('UAE mainland corporate supplier later','Commercial/trade license under buyer policy; VAT registration certificate if registered; bank evidence and service qualification. W8BEN-E only when buyer Tax determines it is the applicable US payee documentation, not simply because the supplier is foreign. [19, 20]'),
('All profiles','Ownership declaration and evidence required by this buyer policy. ISO/qualification scope is category-specific. Negative online reviews or an unrecognized brand do not automatically prove fraud or sanctions exposure.')],[1.75,5.12])
p('ProfilePolicy must explain each required item as buyer policy or tax review requirement. Country selection alone does not determine sanctions eligibility, tax residency, beneficial ownership or permission to buy technology. Keep the first release narrow and add a new jurisdiction only after the requirements and reviewer authority are defined.')

page('19 Scaling operations and delivery gates')
h('Deployment and capacity',2)
p('Deploy web and workers separately with resource requests and limits, graceful shutdown and readiness probes. Start with two web replicas and one worker replica for the pilot, then scale workers from queue age and CPU within provider and database limits. Extraction CPU work runs in a separate process or Python container so it cannot block the Node event loop. Do not create one Kubernetes Job per document in this release.')
p('Budget database connections before increasing replicas: total maximum web, worker and dispatcher pools plus operational reserve must fit Cloud SQL capacity. Example starting budget is 5 connections per web pod, 5 per worker and 2 for dispatcher, with at least 20 percent reserve; size against measured load. Bound worker concurrency and per-tenant outstanding work to prevent one supplier monopolizing processing. Configure Redis with noeviction and supported persistence/high availability; verify the chosen managed tier supports the BullMQ commands and connection model. [12]')
p('Use a dedicated migration Job and a single deployment lock; never let every web pod migrate on startup. Apply expand, backfill and contract migrations across releases. Store images in Artifact Registry, scan dependencies and images, run containers without root, and use environment specific service accounts, buckets, domains and databases. A rollback must preserve data written by the newer schema.')
h('Operational targets and monitoring',2)
p('Initial targets to measure, not promised capacity: CRUD p95 below 500 ms excluding file transfer and external authentication; queued work starts within thirty seconds in healthy operation; every submitted case has a visible stage or actionable failure; recovery point objective fifteen minutes and recovery time objective four hours after the required backup/restore configuration is proven. The existing cluster alone does not deliver these targets.')
p('Trace requestId, caseId, submissionId and workItemId across web, dispatcher and worker. Alert on oldest ready job above two minutes, expired leases, rising dead letters, failed email, DB saturation and provider failures. Keep case identifiers out of unbounded metric labels. Enable Cloud SQL backups and point in time recovery; exercise restore together with GCS generation references and encryption keys before production.')
h('Build sequence aligned to the case study',2)
table(['Stage','Exit condition'],[
('Happy path first','Auth, invitation, complete form, PDF upload, extraction, required checks, independent decision, visible run and delivery all execute with real persistence.'),
('Edge case one','Wrong certificate site produces actionable Pending; correction and new version lead to the correct decision.'),
('Edge case two','Blocked parent chain opens a non-bypassable compliance hold; evidence and source labels are visible.'),
('Recovery and demo','Duplicate requests, worker crash and provider failure recover without duplicate decisions or false approval. Prepare reproducible inputs and a five minute recording.')],[1.45,5.42])

page('20 Verification and open implementation decisions')
table(['Test','Required assertion'],[
('Schema and migration','Prisma validate passes; create schema on disposable PostgreSQL; test composite FKs, deferred current version constraint and frozen evidence triggers.'),
('Tenant and case isolation','Changing tenant, case, document or submission ID cannot reveal or modify another tenant or another supplier case.'),
('Authentication and invitation','OTP-only session cannot access buyer routes. Expired, forwarded, redeemed and revoked links behave correctly. GET scanners never consume invitation.'),
('Authorization','Inactive membership takes effect immediately. Admin cannot clear a compliance issue. Creator cannot approve own case. Last admin cannot be removed.'),
('Concurrent writes','Parallel draft saves yield one conflict. Duplicate submit and approve commands return the same result and create one durable effect.'),
('Frozen versions','Late results for submission 1 cannot approve submission 2. Old signed upload cannot replace the generation used for a decision.'),
('Queue recovery','Kill worker after provider return and before commit. Retry commits at most one result; stale lease cannot write. Redis loss is repaired from WorkItem.'),
('Privacy and files','Oversized, malicious, encrypted or malformed PDF stays unusable; PII, OTPs and signed URLs never enter logs or queue bodies.'),
('Business behavior','Happy path approves; scope mismatch requests an annex; blocked parent scenario holds. Unknown or unavailable evidence never passes.'),
('UI and notification','Run stages reflect records; supplier sees approved next steps; email failure stays visible and does not roll back case state.')],[1.65,5.22])
h('Decisions to settle during implementation',2)
p('Choose and pin the Better Auth version and integration-test the server-only authentication-channel hook; choose the email provider and delivery idempotency behavior; confirm Cloud SQL, Redis and GCS region and connectivity; choose the extraction provider and data processing settings; approve the exact buyer policy and retention schedule. Use fixture screening for the case study with a clear label until a licensed live data source is configured.')
p('The Prisma schema passes CLI validation against Prisma 6.19.0. API examples, migration trigger requirements, OOP adapters and deployment settings still require implementation and integration tests. A detailed design is not evidence that the application meets an enterprise security certification or that a legal entity is safe to pay.')
h('Release acceptance',2)
p('A buyer can invite a supplier; that supplier can securely complete and submit the required evidence; background processing produces traceable findings; a qualified reviewer can reach the correct outcome; the supplier receives understandable next steps. The dashboard and live view remain correct across retries, restarts and corrections. Those observable behaviors are the release gate.')

page('Sources and technical references')
p('Primary documentation consulted for technical behavior and regional examples. The numbered references distinguish source-backed behavior from the proposed application settings and implementation choices in this specification.')
p('[1] Supplied AI Solutions Associate Case Study Candidate Guide, 2026. PS 2, schedule, submission requirements and FAQ. Local attachment supplied by the candidate.')
refs=[
(2,'Better Auth database models','https://better-auth.com/docs/concepts/database'),
(3,'Better Auth session management','https://better-auth.com/docs/concepts/session-management'),
(4,'Better Auth Google authentication','https://better-auth.com/docs/authentication/google'),
(5,'Better Auth email OTP','https://better-auth.com/docs/plugins/email-otp'),
(6,'tRPC procedures and middleware','https://trpc.io/docs/server/procedures'),
(7,'Prisma transactions and concurrency','https://www.prisma.io/docs/orm/prisma-client/queries/transactions'),
(8,'Zod schema API','https://zod.dev/api'),
(9,'React class component support and guidance','https://react.dev/reference/react/Component'),
(10,'Cloud SQL connections from GKE','https://docs.cloud.google.com/sql/docs/postgres/connect-kubernetes-engine'),
(11,'Workload Identity Federation for GKE','https://docs.cloud.google.com/kubernetes-engine/docs/concepts/workload-identity'),
(12,'BullMQ production considerations','https://docs.bullmq.io/guide/going-to-production'),
(13,'BullMQ idempotent jobs','https://docs.bullmq.io/patterns/idempotent-jobs'),
(14,'OWASP file upload guidance','https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html'),
(15,'GCS signed URLs','https://docs.cloud.google.com/storage/docs/access-control/signed-urls'),
(16,'GCS request preconditions','https://docs.cloud.google.com/storage/docs/request-preconditions'),
(17,'OFAC FAQ 401 and indirect blocked ownership','https://ofac.treasury.gov/faqs/401'),
(18,'IRS instructions for Form W9','https://www.irs.gov/instructions/iw9'),
(19,'IRS instructions for Form W8BEN E','https://www.irs.gov/instructions/iw8bene'),
(20,'UAE Federal Tax Authority VAT registration','https://tax.gov.ae/en/services/vat.registration.aspx'),
(21,'Better Auth Next.js integration','https://better-auth.com/docs/integrations/next'),
(22,'Prisma Better Auth integration guide','https://docs.prisma.io/docs/guides/authentication/better-auth/nextjs'),
(23,'BullMQ retries and backoff','https://docs.bullmq.io/guide/retrying-failing-jobs')]
for r in refs:link(*r)
OUT.mkdir(exist_ok=True);doc.save(OUT/'Vendor_Onboarding_Technical_Design.docx')
print(OUT/'Vendor_Onboarding_Technical_Design.docx')
