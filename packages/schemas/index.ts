import { z } from 'zod'

export class Values {
  static readonly ACTIVITIES = ['CALIBRATION'] as const
  static readonly BUYER_ROLES = ['ADMIN', 'AUDITOR', 'BUYER', 'COMPLIANCE', 'REVIEWER'] as const
  static readonly CASE_STATES = ['APPROVED', 'DRAFT', 'INVITED', 'PENDING', 'REJECTED', 'SUBMITTED'] as const
  static readonly DECISIONS = ['APPROVE', 'REJECT'] as const
  static readonly DOCUMENTS = ['BANK', 'CERTIFICATE', 'OWNERSHIP', 'REGISTRATION', 'TAX'] as const
  static readonly HOLD_DECISIONS = ['CLEARED', 'CONFIRMED'] as const
  static readonly MAX_FILE = 10_485_760
  static readonly MAX_PAGE = 100
  static readonly MAX_TEXT = 200
  static readonly TAX_FORMS = ['OTHER_REVIEW', 'W8BEN_E', 'W9'] as const
}

export type Country = { code: string; name: string }

const countryCode = z.string().regex(/^[A-Z]{2}$/)
const id = z.string().min(1).max(128)
const message = z.string().trim().min(10).max(1000)
const text = z.string().trim().min(1).max(Values.MAX_TEXT)
const date = z.iso.datetime()
const command = z.strictObject({ idempotencyKey: z.uuid() })
const caseRef = z.strictObject({ caseId: id })
const change = caseRef.merge(command).extend({ expectedCaseRevision: z.int().nonnegative() })
const draft = change.extend({ expectedDraftRevision: z.int().nonnegative(), submissionId: id })
const member = command.extend({ membershipId: id })

export const profiles = {
  bank: z.strictObject({
    account: z.string().regex(/^[A-Z0-9 -]{4,64}$/i),
    beneficiary: text,
    country: countryCode,
    currency: z.string().regex(/^[A-Z]{3}$/),
    // Routing formats depend on the bank jurisdiction.
    routing: text.optional(),
  }),
  company: z.strictObject({
    addressLine1: text, city: text, contactEmail: z.email({ error: 'Enter a valid mail' }), contactName: text,
    country: countryCode, jurisdiction: text, legalName: text, registryId: text,
  }),
  ownership: z.strictObject({
    edges: z.array(z.strictObject({
      evidenceDocumentId: id.optional(), // Separate declaration evidence can cover multiple edges.
      ownedKey: id, ownerKey: id, percentage: z.string().regex(/^\d{1,3}(\.\d{1,4})?$/),
    })).max(200),
    entities: z.array(z.strictObject({
      country: z.string().regex(/^[A-Z]{2}$/), isVendor: z.boolean(), key: id, legalName: text,
      registryId: text.optional(), // Individuals may lack a registry identifier.
    })).min(1).max(100),
  }),
  qualifications: z.array(z.strictObject({ activity: text, site: text, standard: text })).min(1).max(20),
  tax: z.strictObject({
    formType: z.enum(Values.TAX_FORMS),
    taxId: z.string().regex(/^[A-Z0-9-]{4,40}$/i).optional(), // Foreign tax review may allow omission.
    vatRegistered: z.boolean(),
    vatTrn: z.string().regex(/^\d{15}$/).optional(), // Required only when registered in UAE.
  }),
}

const section = z.discriminatedUnion('section', [
  z.strictObject({ section: z.literal('bank'), value: profiles.bank }),
  z.strictObject({ section: z.literal('company'), value: profiles.company }),
  z.strictObject({ section: z.literal('ownership'), value: profiles.ownership }),
  z.strictObject({ section: z.literal('qualifications'), value: profiles.qualifications }),
  z.strictObject({ section: z.literal('tax'), value: profiles.tax }),
])
const pagination = { cursor: id.optional(), limit: z.int().min(1).max(Values.MAX_PAGE) }
export const inputs = {
  acceptInvitation: command.extend({ invitationId: id }),
  analytics: z.strictObject({ from: date, to: date }),
  audit: caseRef.extend(pagination),
  case: caseRef,
  create: command.extend({
    category: z.enum(Values.ACTIVITIES), country: countryCode,
    requestedSite: text, supplierEmail: z.email({ error: 'Enter a valid mail' }),
  }),
  createSupplierApplication: command.extend({
    category: z.enum(Values.ACTIVITIES), country: countryCode, requestedSite: text,
  }),
  decide: change.extend({ outcome: z.enum(Values.DECISIONS), rationale: message, submissionId: id }),
  document: draft.extend({ documentId: id }),
  download: caseRef.extend({ documentId: id }),
  enroll: command.extend({ email: z.email({ error: 'Enter a valid mail' }), role: z.enum(Values.BUYER_ROLES) }),
  invite: change.extend({ invitationId: id }),
  list: z.strictObject({
    country: countryCode.optional(), // Omitted filters include every matching case.
    ...pagination,
    search: text.optional(),
    status: z.enum(Values.CASE_STATES).optional(),
  }),
  member,
  none: z.strictObject({}),
  redeem: command.extend({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }),
  reissue: change,
  reprocess: change.extend({ submissionId: id }),
  request: change.extend({ message, submissionId: id }),
  reserve: draft.extend({ kind: z.enum(Values.DOCUMENTS), sha256: z.string().regex(/^[a-f0-9]{64}$/), sizeBytes: z.int().min(1).max(Values.MAX_FILE) }),
  resolve: change.extend({ evidenceDocumentIds: z.array(id).min(1).max(20), issueId: id, rationale: message, submissionId: id }),
  resolveHold: change.extend({ disposition: z.enum(Values.HOLD_DECISIONS), evidenceDocumentIds: z.array(id).min(1).max(20), issueId: id, rationale: message, submissionId: id }),
  retry: command.extend({ reason: message, workItemId: id }),
  revokeAccess: change.extend({ userId: id }),
  role: member.extend({ role: z.enum(Values.BUYER_ROLES) }),
  save: draft.extend({ change: section }),
  select: command.extend({ tenantId: id }),
  submit: draft.extend({ attested: z.literal(true) }),
}

const summary = z.strictObject({
  supplierEmail: z.string().optional(), requesterName: z.string().optional(), requesterEmail: z.string().optional(),
  issueCount: z.int().nonnegative().optional(), issueSummary: z.array(z.string()).optional(), submittedAt: date.optional(),
  invitationDelivery: z.string().optional(),
  caseId: id, createdAt: date, name: z.string(), number: z.int(), requestedSite: text,
  revision: z.int(), status: z.enum(Values.CASE_STATES), updatedAt: date,
})
const issue = z.strictObject({ code: text, id, message: z.string(), owner: text })
const stage = z.strictObject({ name: text, state: text })
const run = z.strictObject({ stages: z.array(stage) })
export const verificationReport = z.strictObject({
  submissionId: id, version: text, recommendation: z.enum(['CONSISTENT', 'NEEDS_REVIEW']),
  findings: z.array(z.strictObject({
    rule: z.enum(['BANK_BENEFICIARY', 'CERTIFICATE_SCOPE', 'ENTITY_CONSISTENCY', 'TAX_PROFILE']),
    result: z.enum(['PASS', 'REVIEW']), code: text, message: z.string(),
    evidence: z.array(z.strictObject({ documentId: id, page: z.int().positive(), field: text, value: z.string(), quote: z.string() })),
  })),
})
export const outputs = {
  ack: z.strictObject({ id, revision: z.int() }),
  analytics: z.strictObject({
    completed: z.int(), counts: z.record(z.string(), z.int()), medianHours: z.number(), reworkRate: z.number(),
    reviewerAction: z.int(), supplierAction: z.int(),
  }),
  audit: z.strictObject({
    items: z.array(z.strictObject({ action: text, actorId: z.string(), at: date, id, requestId: id })),
    nextCursor: id.optional(), // Omitted on the last page.
  }),
  detail: z.strictObject({
    verificationReport: verificationReport.optional(),
    case: summary, checks: z.array(z.strictObject({
      code: text, evidence: z.array(z.strictObject({ documentId: id, field: text, page: z.int() })),
      result: text, rule: text, source: text,
    })),
    decisions: z.array(z.strictObject({ at: date, outcome: text, rationale: z.string().optional(), reviewerName: z.string().optional() })),
    documents: z.array(z.strictObject({ id, kind: z.enum(Values.DOCUMENTS), status: text })),
    draftRevision: z.int(), issues: z.array(issue), required: z.array(z.enum(Values.DOCUMENTS)),
    run, submissionId: id, values: z.record(z.string(), z.json()),
  }),
  download: z.strictObject({ url: z.url() }),
  pendingInvitations: z.strictObject({ items: z.array(z.strictObject({
    id, caseId: id, requestedSite: text, country: countryCode, expiresAt: date,
  })) }),
  identity: z.strictObject({
    channel: z.string(),
    email: z.email({ error: 'Enter a valid mail' }), memberships: z.array(z.strictObject({ id, role: z.enum(Values.BUYER_ROLES), tenantId: id })),
    tenantId: z.string(),
  }),
  list: z.strictObject({ items: z.array(summary), nextCursor: id.optional() }), // Omitted on the last page.
  teamDirectory: z.strictObject({
    members: z.array(z.strictObject({ id, name: z.string(), email: z.email(), role: z.enum(Values.BUYER_ROLES) })),
    suppliers: z.array(z.strictObject({ id, name: z.string(), email: z.email(), caseId: id, requestedSite: text })),
  }),
  run,
  upload: z.strictObject({ id, headers: z.record(z.string(), z.string()), revision: z.int(), url: z.url() }),
}
export type Input<K extends keyof typeof inputs> = z.infer<(typeof inputs)[K]>
export type Output<K extends keyof typeof outputs> = z.infer<(typeof outputs)[K]>
