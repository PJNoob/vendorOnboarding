from pathlib import Path

models = {}
groups = {}
def model(name, fields, constraints=(), scoped=True, group='Workflow'):
    base = ['id String @id @default(cuid())']
    if scoped:
        base += ['tenantId String']
    models[name] = base + fields + list(constraints)
    groups[name] = group
    if scoped:
        models[name] += ['@@unique([tenantId, id])']

def relation(child, parent, field, name, optional=False, scoped=True):
    suffix = '?' if optional else ''
    models[child].append(f'{field} String{suffix}')
    keys = f'tenantId, {field}' if scoped else field
    refs = 'tenantId, id' if scoped else 'id'
    models[child].append(f'{name} {parent}{suffix} @relation("{child}_{name}", fields: [{keys}], references: [{refs}], onDelete: Restrict)')
    models[parent].append(f'{child[0].lower()+child[1:]}_{name} {child}[] @relation("{child}_{name}")')

model('User',['name String','email String @unique','emailVerified Boolean @default(false)','image String?','createdAt DateTime @default(now())','updatedAt DateTime @updatedAt'],scoped=False,group='Identity')
model('Session',['authChannel String @default("UNKNOWN")','token String @unique','expiresAt DateTime','ipAddress String?','userAgent String?','createdAt DateTime @default(now())','updatedAt DateTime @updatedAt'],scoped=False,group='Identity')
relation('Session','User','userId','user',scoped=False)
model('Account',['accountId String','providerId String','accessToken String?','refreshToken String?','idToken String?','accessTokenExpiresAt DateTime?','refreshTokenExpiresAt DateTime?','scope String?','password String?','createdAt DateTime @default(now())','updatedAt DateTime @updatedAt','@@unique([providerId, accountId])'],scoped=False,group='Identity')
relation('Account','User','userId','user',scoped=False)
model('Verification',['identifier String','value String','expiresAt DateTime','createdAt DateTime @default(now())','updatedAt DateTime @updatedAt','@@index([identifier])'],scoped=False,group='Identity')
model('Tenant',['name String','createdAt DateTime @default(now())'],scoped=False,group='Identity')
model('Membership',['role BuyerRole','active Boolean @default(true)','createdAt DateTime @default(now())','@@unique([tenantId, userId])'],group='Identity')
relation('Membership','User','userId','user',scoped=False)
model('BuyerEnrollment',['emailKey String','role BuyerRole','expiresAt DateTime','acceptedAt DateTime?','revokedAt DateTime?','@@unique([tenantId, emailKey])'],group='Identity')
model('PolicyVersion',['version Int','category String','country String @db.Char(2)','definition Json','publishedAt DateTime','@@unique([tenantId, category, country, version])'])
model('OnboardingCase',['status CaseStatus @default(INVITED)','revision Int @default(0)','currentNumber Int?','category String','country String @db.Char(2)','requestedSite String','createdAt DateTime @default(now())','updatedAt DateTime @updatedAt','@@index([tenantId, status, createdAt, id])'])
relation('OnboardingCase','PolicyVersion','policyId','policy')
relation('OnboardingCase','User','createdById','createdBy',scoped=False)
model('Invitation',['emailKey String','tokenHash String @unique','expiresAt DateTime','redeemedAt DateTime?','revokedAt DateTime?','createdAt DateTime @default(now())','@@index([tenantId, caseId, createdAt])'])
relation('Invitation','OnboardingCase','caseId','case')
model('CaseAccess',['revokedAt DateTime?','createdAt DateTime @default(now())','@@unique([tenantId, caseId, userId])'])
relation('CaseAccess','OnboardingCase','caseId','case')
relation('CaseAccess','User','userId','user',scoped=False)
model('Submission',['number Int','draftRevision Int @default(0)','submittedAt DateTime?','attestedAt DateTime?','@@unique([tenantId, caseId, number])'])
relation('Submission','OnboardingCase','caseId','case')
relation('Submission','User','submittedById','submittedBy',optional=True,scoped=False)
model('CompanyProfile',['submissionId String @unique','legalName String','registryId String','jurisdiction String','country String @db.Char(2)','addressLine1 String','addressLine2 String?','city String','postalCode String?','contactName String','contactEmail String','@@unique([tenantId, submissionId])'],group='Evidence')
model('TaxProfile',['submissionId String @unique','formType TaxForm','taxIdCiphertext Bytes?','vatRegistered Boolean','vatTrnCiphertext Bytes?','keyVersion String?','@@unique([tenantId, submissionId])'],group='Evidence')
model('BankProfile',['submissionId String @unique','beneficiary String','country String @db.Char(2)','currency String @db.Char(3)','accountCiphertext Bytes','routingCiphertext Bytes?','accountLast4 String @db.VarChar(4)','fingerprint String','keyVersion String','@@unique([tenantId, submissionId])'],group='Evidence')
for child in ['CompanyProfile','TaxProfile','BankProfile']:
    models[child].append(f'submission Submission @relation("{child}_submission", fields: [tenantId, submissionId], references: [tenantId, id], onDelete: Restrict)')
    models['Submission'].append(f'{child[0].lower()+child[1:]} {child}? @relation("{child}_submission")')
model('Qualification',['activity String','site String','standard String'],group='Evidence')
relation('Qualification','Submission','submissionId','submission')
model('OwnershipEntity',['entityKey String','legalName String','registryId String?','country String @db.Char(2)','isVendor Boolean @default(false)','@@unique([tenantId, submissionId, entityKey])'],group='Evidence')
relation('OwnershipEntity','Submission','submissionId','submission')
model('OwnershipEdge',['ownedEntityKey String','ownerEntityKey String','percentage Decimal @db.Decimal(7,4)','evidenceDocumentId String?','@@unique([tenantId, submissionId, ownerEntityKey, ownedEntityKey])'],group='Evidence')
for role in ['owner', 'owned']:
    models['OwnershipEdge'].append(f'{role} OwnershipEntity @relation("Edge_{role}", fields: [tenantId, submissionId, {role}EntityKey], references: [tenantId, submissionId, entityKey], onDelete: Restrict)')
    models['OwnershipEntity'].append(f'{role}Edges OwnershipEdge[] @relation("Edge_{role}")')
relation('OwnershipEdge','Submission','submissionId','submission')
model('Document',['kind DocumentKind','objectKey String @unique','generation String?','sha256 String?','sizeBytes Int?','status DocumentStatus @default(RESERVED)','createdAt DateTime @default(now())','@@index([tenantId, submissionId, status])'],group='Evidence')
relation('Document','Submission','submissionId','submission')
relation('Document','User','uploadedById','uploadedBy',scoped=False)
models['Document'].append('@@unique([tenantId, submissionId, id])')
models['OwnershipEdge'].append('evidence Document? @relation("Ownership_evidence", fields: [tenantId, submissionId, evidenceDocumentId], references: [tenantId, submissionId, id], onDelete: Restrict)')
models['Document'].append('ownershipEdges OwnershipEdge[] @relation("Ownership_evidence")')
model('Extraction',['documentId String','extractorVersion String','modelVersion String?','outputRef String','createdAt DateTime @default(now())','@@unique([tenantId, documentId, extractorVersion])'],group='Evidence')
models['Extraction'].append('document Document @relation("Extraction_document", fields: [tenantId, documentId], references: [tenantId, id], onDelete: Restrict)')
models['Document'].append('extractions Extraction[] @relation("Extraction_document")')
model('CheckRun',['ruleKey String','ruleVersion String','attempt Int','result CheckResult','sourceMode SourceMode','sourceRef String?','checkedAt DateTime','validUntil DateTime?','reasonCode String','@@unique([tenantId, submissionId, ruleKey, attempt])'],group='Evidence')
relation('CheckRun','Submission','submissionId','submission')
model('CheckEvidence',['page Int?','fieldPath String','excerptRef String?'],group='Evidence')
relation('CheckEvidence','CheckRun','checkRunId','checkRun')
relation('CheckEvidence','Document','documentId','document',optional=True)
model('Issue',['code String','ownerRole BuyerRole','supplierMessage String?','openedAt DateTime @default(now())','resolvedAt DateTime?','resolution String?'],group='Evidence')
relation('Issue','Submission','submissionId','submission')
model('Decision',['outcome DecisionOutcome','rationale String','createdAt DateTime @default(now())','@@index([tenantId, submissionId, createdAt])'],group='Evidence')
relation('Decision','Submission','submissionId','submission')
relation('Decision','User','reviewerId','reviewer',scoped=False)
model('Supplier',['approvedSubmissionId String @unique','registryKey String','createdAt DateTime @default(now())','@@unique([tenantId, registryKey])','@@unique([tenantId, approvedSubmissionId])'],group='Evidence')
models['Supplier'].append('approvedSubmission Submission @relation("Supplier_approved", fields: [tenantId, approvedSubmissionId], references: [tenantId, id], onDelete: Restrict)')
models['Submission'].append('supplier Supplier? @relation("Supplier_approved")')
model('WorkItem',['kind WorkKind','dedupeKey String','state WorkState @default(READY)','payload Json','attempt Int @default(0)','leaseOwner String?','leaseEpoch Int @default(0)','leaseUntil DateTime?','availableAt DateTime @default(now())','startedAt DateTime?','completedAt DateTime?','lastErrorCode String?','createdAt DateTime @default(now())','@@unique([tenantId, dedupeKey])','@@index([state, availableAt, leaseUntil])'],group='Operations')
relation('WorkItem','Submission','submissionId','submission',optional=True)
model('OutboxEvent',['workItemId String','publishedAt DateTime?','leaseUntil DateTime?','createdAt DateTime @default(now())','@@index([publishedAt, leaseUntil, createdAt])'],group='Operations')
models['OutboxEvent'].append('workItem WorkItem @relation("Outbox_work", fields: [tenantId, workItemId], references: [tenantId, id], onDelete: Restrict)')
models['WorkItem'].append('events OutboxEvent[] @relation("Outbox_work")')
model('Notification',['template String','recipientCiphertext Bytes','payloadCiphertext Bytes','keyVersion String','providerMessageId String?','deliveryState String','@@unique([tenantId, workItemId])','createdAt DateTime @default(now())'],group='Operations')
relation('Notification','WorkItem','workItemId','workItem')
model('IdempotencyRecord',['actorId String','operation String','key String','requestHash String','response Json','createdAt DateTime @default(now())','expiresAt DateTime','@@unique([tenantId, actorId, operation, key])'],group='Operations')
model('AuditEvent',['actorId String?','actorType String','action String','entityType String','entityId String','requestId String','safeMetadata Json','createdAt DateTime @default(now())','@@index([tenantId, entityType, entityId, createdAt])'],group='Operations')
for name,fields in models.items():
    if 'tenantId String' in fields:
        fields.append(f'tenant Tenant @relation("{name}_tenant", fields: [tenantId], references: [id], onDelete: Restrict)')
        models['Tenant'].append(f'{name[0].lower()+name[1:]}Records {name}[] @relation("{name}_tenant")')

enums={
'BuyerRole':'ADMIN BUYER REVIEWER COMPLIANCE AUDITOR',
'CaseStatus':'INVITED DRAFT SUBMITTED PENDING APPROVED REJECTED',
'TaxForm':'W9 W8BEN_E OTHER_REVIEW',
'DocumentKind':'REGISTRATION TAX BANK CERTIFICATE OWNERSHIP',
'DocumentStatus':'RESERVED UPLOADED CLEAN REJECTED DELETED',
'CheckResult':'PASS FAIL REVIEW UNAVAILABLE',
'SourceMode':'LIVE MANUAL FIXTURE',
'DecisionOutcome':'APPROVE REJECT REQUEST_CHANGES CLEAR_HOLD',
'WorkKind':'SCAN EXTRACT VERIFY NOTIFY',
'WorkState':'READY RUNNING SUCCEEDED FAILED'}
header='generator client {\n  provider = "prisma-client-js"\n}\n\ndatasource db {\n  provider = "postgresql"\n  url = env("DATABASE_URL")\n}\n'
parts=[header]+['enum '+name+' {\n  '+'\n  '.join(vals.split())+'\n}' for name,vals in enums.items()]
parts += ['model '+name+' {\n  '+'\n  '.join(fields)+'\n}' for name,fields in models.items()]
Path('tmp/technical/schema.prisma').write_text('\n\n'.join(parts)+'\n')
