import { Prisma } from '@neo/prisma'
import {
  BankProfileRepository, CompanyProfileRepository, DocumentRepository, IssueRepository,
  OnboardingCaseRepository, OwnershipEdgeRepository, OwnershipEntityRepository,
  QualificationRepository, SubmissionRepository, TaxProfileRepository, type TransactionClient,
} from '@neo/prisma/repositories'
import type { Input } from '@neo/schemas'

import { Commands } from './Commands'
import { DocumentProcessor } from './DocumentProcessor'
import { ObjectStore } from './Providers'
import { type Actor, Secrets, Security } from './Security'

type Current = Awaited<ReturnType<typeof Commands.current>>
type Change = Input<'save'>['change']

export class DraftService {
  static readonly MAX_DOCUMENTS = 20

  private static async apply(change: Change, submissionId: string, tenantId: string, tx: TransactionClient) {
    const key = { submissionId, tenantId }
    switch (change.section) {
      case 'company':
        await CompanyProfileRepository.upsert({ create: { ...key, ...change.value }, update: change.value, where: key }, tx)
        break
      case 'bank': {
        const { account, routing, ...rest } = change.value
        const fields = {
          ...rest, accountCiphertext: Secrets.encrypt(account, tenantId),
          accountLast4: account.replace(/[^a-z0-9]/gi, '').slice(-4),
          fingerprint: Secrets.mac(account.replace(/[ -]/g, '').toUpperCase(), tenantId),
          keyVersion: Secrets.KEY_VERSION, routingCiphertext: routing ? Secrets.encrypt(routing, tenantId) : null,
        }
        await BankProfileRepository.upsert({ create: { ...key, ...fields }, update: fields, where: key }, tx)
        break
      }
      case 'tax': {
        const { taxId, vatTrn, ...rest } = change.value
        const fields = {
          ...rest, keyVersion: Secrets.KEY_VERSION, taxIdCiphertext: taxId ? Secrets.encrypt(taxId, tenantId) : null,
          vatTrnCiphertext: vatTrn ? Secrets.encrypt(vatTrn, tenantId) : null,
        }
        await TaxProfileRepository.upsert({ create: { ...key, ...fields }, update: fields, where: key }, tx)
        break
      }
      case 'qualifications':
        await QualificationRepository.deleteMany({ where: key }, tx)
        await QualificationRepository.createMany({ data: change.value.map((value) => ({ ...key, ...value })) }, tx)
        break
      case 'ownership': {
        const entities = new Set(change.value.entities.map((entity) => entity.key))
        Commands.require(entities.size === change.value.entities.length &&
          change.value.entities.filter((entity) => entity.isVendor).length === 1, 'declare a single supplier ownership node')
        const edges = change.value.edges.map((edge) => {
          const percentage = new Prisma.Decimal(edge.percentage)
          Commands.require(entities.has(edge.ownerKey) && entities.has(edge.ownedKey) &&
            edge.ownerKey !== edge.ownedKey && percentage.gt(0) && percentage.lte(100), 'correct ownership edge identifiers or percentage')
          return { ...key, evidenceDocumentId: edge.evidenceDocumentId, ownedEntityKey: edge.ownedKey, ownerEntityKey: edge.ownerKey, percentage }
        })
        await OwnershipEdgeRepository.deleteMany({ where: key }, tx)
        await OwnershipEntityRepository.deleteMany({ where: key }, tx)
        await OwnershipEntityRepository.createMany({ data: change.value.entities.map(({ key: entityKey, ...entity }) => ({ ...key, ...entity, entityKey })) }, tx)
        await OwnershipEdgeRepository.createMany({ data: edges }, tx)
        break
      }
    }
  }

  private static async copy({ snapshot }: Current, target: string, tx: TransactionClient) {
    const key = { submissionId: target, tenantId: snapshot.tenantId }
    if (snapshot.companyProfile) {
      const { id: _id, ...profile } = snapshot.companyProfile
      await CompanyProfileRepository.create({ data: { ...profile, ...key } }, tx)
    }
    if (snapshot.taxProfile) {
      const { id: _id, ...profile } = snapshot.taxProfile
      await TaxProfileRepository.create({ data: { ...profile, ...key } }, tx)
    }
    if (snapshot.bankProfile) {
      const { id: _id, ...profile } = snapshot.bankProfile
      await BankProfileRepository.create({ data: { ...profile, ...key } }, tx)
    }
    const documentMap = new Map<string, string>()
    for (const document of snapshot.document_submission.filter((item) => item.status === 'CLEAN')) {
      const { id, ...fields } = document
      const copied = await DocumentRepository.create({ data: { ...fields, ...key } }, tx)
      documentMap.set(id, copied.id)
      await Commands.enqueue(key.tenantId, 'EXTRACT', DocumentProcessor.extractionKey(copied.id), { documentId: copied.id }, tx, target)
    }
    await QualificationRepository.createMany({ data: snapshot.qualification_submission.map(({ id: _id, ...fields }) => ({ ...fields, ...key })) }, tx)
    await OwnershipEntityRepository.createMany({ data: snapshot.ownershipEntity_submission.map(({ id: _id, ...fields }) => ({ ...fields, ...key })) }, tx)
    await OwnershipEdgeRepository.createMany({ data: snapshot.ownershipEdge_submission.map(({ evidenceDocumentId, id: _id, ...fields }) => ({
      ...fields, ...key, evidenceDocumentId: evidenceDocumentId ? documentMap.get(evidenceDocumentId) : undefined,
    })) }, tx)
    await IssueRepository.createMany({ data: snapshot.issue_submission.filter((issue) => !issue.resolvedAt).map(({ id, ...fields }) => ({
      ...fields, ...key, originIssueId: fields.originIssueId ?? id,
    })) }, tx)
  }

  private static async draft(actor: Actor, input: Input<'submit'> | Input<'save'> | Input<'document'> | Input<'reserve'>, tx: TransactionClient) {
    const current = await Commands.current(actor, input.caseId, tx)
    Commands.revision(current.row.revision, input.expectedCaseRevision)
    Commands.revision(current.snapshot.draftRevision, input.expectedDraftRevision)
    Commands.require(current.row.status === 'DRAFT' && !current.snapshot.submittedAt && current.snapshot.id === input.submissionId,
      'select the current editable draft')
    return current
  }

  private static async mutate(actor: Actor, input: { caseId: string; idempotencyKey: string }, operation: string,
    apply: (scoped: Actor, tx: TransactionClient) => Promise<{ id: string; revision: number }>) {
    const access = await Security.access(actor, input.caseId)
    const scoped = { ...actor, tenantId: access.tenantId }
    return Commands.execute(scoped, operation, input, Security.access.bind(Security, scoped, input.caseId), apply.bind(undefined, scoped))
  }

  private static async touch(snapshot: Current['snapshot'], tx: TransactionClient) {
    await SubmissionRepository.updateMany({
      data: { draftRevision: { increment: 1 } }, where: { id: snapshot.id, tenantId: snapshot.tenantId },
    }, tx)
    return snapshot.draftRevision + 1
  }

  static beginRevision(actor: Actor, input: Input<'reissue'>) {
    return DraftService.mutate(actor, input, 'supplier.beginRevision', async (scoped, tx) => {
      const current = await Commands.current(scoped, input.caseId, tx)
      Commands.revision(current.row.revision, input.expectedCaseRevision)
      Commands.require(current.row.status === 'PENDING' && current.snapshot.submittedAt &&
        current.snapshot.issue_submission.some((issue) => !issue.resolvedAt && issue.ownerRole !== 'COMPLIANCE' && issue.supplierMessage),
      'a supplier correction must be requested before starting a revision')
      const next = await SubmissionRepository.create({ data: {
        caseId: current.row.id, number: current.snapshot.number + 1, tenantId: scoped.tenantId,
      } }, tx)
      await DraftService.copy(current, next.id, tx)
      await OnboardingCaseRepository.updateMany({
        data: { currentNumber: next.number, revision: { increment: 1 }, status: 'DRAFT' },
        where: { id: current.row.id, tenantId: scoped.tenantId },
      }, tx)
      await Commands.audit(scoped, 'REVISION_CREATED', current.row.id, tx)
      return { id: next.id, revision: next.draftRevision }
    })
  }

  static async complete(actor: Actor, input: Input<'document'>) {
    const access = await Security.access(actor, input.caseId)
    const file = await DocumentRepository.findFirst({ where: { id: input.documentId, submission: { caseId: input.caseId }, submissionId: input.submissionId, tenantId: access.tenantId } })
    Commands.require(file, 'upload reservation is unavailable')
    const metadata = file.generation ? { generation: file.generation, size: file.sizeBytes } : await ObjectStore.inspect(file.objectKey)
    return DraftService.mutate(actor, input, 'documents.complete', async (scoped, tx) => {
      const { row, snapshot } = await DraftService.draft(scoped, input, tx)
      Commands.require(file.status === 'RESERVED' && metadata.size === file.sizeBytes, 'complete a matching reserved upload')
      const updated = await DocumentRepository.updateMany({
        data: { generation: metadata.generation, status: 'UPLOADED' },
        where: { id: file.id, status: 'RESERVED', submissionId: snapshot.id, tenantId: scoped.tenantId },
      }, tx)
      Commands.require(updated.count === 1, 'document upload state changed')
      await Commands.enqueue(scoped.tenantId, 'SCAN', file.id, { documentId: file.id }, tx, snapshot.id)
      await Commands.audit(scoped, 'UPLOAD_COMPLETED', row.id, tx)
      return { id: file.id, revision: await DraftService.touch(snapshot, tx) }
    })
  }

  static remove(actor: Actor, input: Input<'document'>) {
    return DraftService.mutate(actor, input, 'documents.remove', async (scoped, tx) => {
      const { row, snapshot } = await DraftService.draft(scoped, input, tx)
      const where = { id: input.documentId, submissionId: snapshot.id, tenantId: scoped.tenantId }
      const references = await OwnershipEdgeRepository.count({
        where: { evidenceDocumentId: input.documentId, submissionId: snapshot.id, tenantId: scoped.tenantId },
      }, tx)
      Commands.require(references === 0, 'remove ownership references before removing this file')
      const changed = await DocumentRepository.updateMany({ data: { status: 'DELETED' }, where }, tx)
      Commands.require(changed.count, 'document is unavailable')
      await Commands.audit(scoped, 'DOCUMENT_REMOVED', row.id, tx)
      return { id: input.documentId, revision: await DraftService.touch(snapshot, tx) }
    })
  }

  static async reserve(actor: Actor, input: Input<'reserve'>) {
    const result = await DraftService.mutate(actor, input, 'documents.reserve', async (scoped, tx) => {
      const { row, snapshot } = await DraftService.draft(scoped, input, tx)
      Commands.require(snapshot.document_submission.length < DraftService.MAX_DOCUMENTS, 'remove an existing document before adding another')
      const document = await DocumentRepository.create({ data: {
        kind: input.kind, objectKey: Secrets.token(), sha256: input.sha256, sizeBytes: input.sizeBytes,
        submissionId: snapshot.id, tenantId: scoped.tenantId, uploadedById: actor.id,
      } }, tx)
      await Commands.audit(scoped, 'UPLOAD_RESERVED', row.id, tx)
      return { id: document.id, revision: await DraftService.touch(snapshot, tx) }
    })
    const access = await Security.access(actor, input.caseId)
    const reservation = await DocumentRepository.findFirst({
      where: { id: result.id, status: 'RESERVED', tenantId: access.tenantId },
    })
    Commands.require(reservation && Date.now() - reservation.createdAt.getTime() < Commands.DAY_MS, 'upload reservation is no longer usable')
    return { ...result, ...await ObjectStore.upload(reservation.objectKey, input.sizeBytes) }
  }

  static save(actor: Actor, input: Input<'save'>) {
    return DraftService.mutate(actor, input, 'supplier.saveDraft', async (scoped, tx) => {
      const { row, snapshot } = await DraftService.draft(scoped, input, tx)
      if (input.change.section === 'company') {
        Commands.require(input.change.value.country === row.country, 'company country must match the invitation')
      }
      await DraftService.apply(input.change, snapshot.id, scoped.tenantId, tx)
      await Commands.audit(scoped, 'DRAFT_SAVED', row.id, tx, { section: input.change.section })
      return { id: snapshot.id, revision: await DraftService.touch(snapshot, tx) }
    })
  }

  static submit(actor: Actor, input: Input<'submit'>) {
    return DraftService.mutate(actor, input, 'supplier.submit', async (scoped, tx) => {
      const { policy, row, snapshot } = await DraftService.draft(scoped, input, tx)
      Commands.require(snapshot.companyProfile && snapshot.bankProfile && snapshot.taxProfile &&
        snapshot.qualification_submission.length && snapshot.ownershipEntity_submission.length, 'complete all supplier sections')
      Commands.require(policy.documents.every((kind) => snapshot.document_submission.some((doc) => doc.kind === kind && doc.status === 'CLEAN')),
        'upload clean evidence for each required document kind')
      const now = new Date()
      await SubmissionRepository.updateMany({
        data: { attestedAt: now, submittedAt: now, submittedById: actor.id },
        where: { id: snapshot.id, tenantId: scoped.tenantId },
      }, tx)
      await OnboardingCaseRepository.updateMany({
        data: { revision: { increment: 1 }, status: 'SUBMITTED' }, where: { id: row.id, tenantId: scoped.tenantId },
      }, tx)
      for (const document of snapshot.document_submission.filter((item) => item.status === 'CLEAN')) {
        const key = DocumentProcessor.extractionKey(document.id)
        if (!snapshot.workItem_submission.some((item) => item.kind === 'EXTRACT' && item.dedupeKey === key)) {
          await Commands.enqueue(scoped.tenantId, 'EXTRACT', key, { documentId: document.id }, tx, snapshot.id)
        }
      }
      await Commands.enqueue(scoped.tenantId, 'VERIFY', snapshot.id, {}, tx, snapshot.id)
      await Commands.audit(scoped, 'SUBMITTED', row.id, tx)
      return { id: snapshot.id, revision: row.revision + 1 }
    })
  }
}
