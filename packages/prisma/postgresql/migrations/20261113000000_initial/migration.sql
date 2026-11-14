-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."BuyerRole" AS ENUM ('ADMIN', 'BUYER', 'REVIEWER', 'COMPLIANCE', 'AUDITOR');

-- CreateEnum
CREATE TYPE "public"."CaseStatus" AS ENUM ('INVITED', 'DRAFT', 'SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."TaxForm" AS ENUM ('W9', 'W8BEN_E', 'OTHER_REVIEW');

-- CreateEnum
CREATE TYPE "public"."DocumentKind" AS ENUM ('REGISTRATION', 'TAX', 'BANK', 'CERTIFICATE', 'OWNERSHIP');

-- CreateEnum
CREATE TYPE "public"."DocumentStatus" AS ENUM ('RESERVED', 'UPLOADED', 'CLEAN', 'REJECTED', 'DELETED');

-- CreateEnum
CREATE TYPE "public"."CheckResult" AS ENUM ('PASS', 'FAIL', 'REVIEW', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "public"."SourceMode" AS ENUM ('LIVE', 'MANUAL', 'FIXTURE');

-- CreateEnum
CREATE TYPE "public"."DecisionOutcome" AS ENUM ('APPROVE', 'REJECT', 'REQUEST_CHANGES', 'CLEAR_HOLD');

-- CreateEnum
CREATE TYPE "public"."WorkKind" AS ENUM ('SCAN', 'EXTRACT', 'VERIFY', 'NOTIFY');

-- CreateEnum
CREATE TYPE "public"."WorkState" AS ENUM ('READY', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Session" (
    "id" TEXT NOT NULL,
    "authChannel" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Membership" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "public"."BuyerRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BuyerEnrollment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "emailKey" TEXT NOT NULL,
    "role" "public"."BuyerRole" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "BuyerEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PolicyVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "country" CHAR(2) NOT NULL,
    "definition" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OnboardingCase" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" "public"."CaseStatus" NOT NULL DEFAULT 'INVITED',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "currentNumber" INTEGER,
    "category" TEXT NOT NULL,
    "country" CHAR(2) NOT NULL,
    "requestedSite" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "policyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "OnboardingCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Invitation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recipientCiphertext" BYTEA NOT NULL,
    "emailKey" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "redeemedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "caseId" TEXT NOT NULL,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CaseAccess" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "caseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "CaseAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Submission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "draftRevision" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3),
    "attestedAt" TIMESTAMP(3),
    "caseId" TEXT NOT NULL,
    "submittedById" TEXT,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CompanyProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "registryId" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "country" CHAR(2) NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "postalCode" TEXT,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,

    CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TaxProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "formType" "public"."TaxForm" NOT NULL,
    "taxIdCiphertext" BYTEA,
    "vatRegistered" BOOLEAN NOT NULL,
    "vatTrnCiphertext" BYTEA,
    "keyVersion" TEXT,

    CONSTRAINT "TaxProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BankProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "beneficiary" TEXT NOT NULL,
    "country" CHAR(2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "accountCiphertext" BYTEA NOT NULL,
    "routingCiphertext" BYTEA,
    "accountLast4" VARCHAR(4) NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "keyVersion" TEXT NOT NULL,

    CONSTRAINT "BankProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Qualification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "activity" TEXT NOT NULL,
    "site" TEXT NOT NULL,
    "standard" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,

    CONSTRAINT "Qualification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OwnershipEntity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityKey" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "registryId" TEXT,
    "country" CHAR(2) NOT NULL,
    "isVendor" BOOLEAN NOT NULL DEFAULT false,
    "submissionId" TEXT NOT NULL,

    CONSTRAINT "OwnershipEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OwnershipEdge" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownedEntityKey" TEXT NOT NULL,
    "ownerEntityKey" TEXT NOT NULL,
    "percentage" DECIMAL(7,4) NOT NULL,
    "evidenceDocumentId" TEXT,
    "submissionId" TEXT NOT NULL,

    CONSTRAINT "OwnershipEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Document" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "public"."DocumentKind" NOT NULL,
    "objectKey" TEXT NOT NULL,
    "cleanGeneration" TEXT,
    "cleanKey" TEXT,
    "generation" TEXT,
    "sha256" TEXT,
    "sizeBytes" INTEGER,
    "status" "public"."DocumentStatus" NOT NULL DEFAULT 'RESERVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submissionId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Extraction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "extractorVersion" TEXT NOT NULL,
    "modelVersion" TEXT,
    "outputRef" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Extraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CheckRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "result" "public"."CheckResult" NOT NULL,
    "sourceMode" "public"."SourceMode" NOT NULL,
    "sourceRef" TEXT,
    "evidenceJson" JSONB,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "reasonCode" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,

    CONSTRAINT "CheckRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CheckEvidence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "page" INTEGER,
    "fieldPath" TEXT NOT NULL,
    "excerptRef" TEXT,
    "checkRunId" TEXT NOT NULL,
    "documentId" TEXT,

    CONSTRAINT "CheckEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Issue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "ownerRole" "public"."BuyerRole" NOT NULL,
    "supplierMessage" TEXT,
    "originIssueId" TEXT,
    "checkRule" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "submissionId" TEXT NOT NULL,

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Decision" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "outcome" "public"."DecisionOutcome" NOT NULL,
    "rationale" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submissionId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Supplier" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "approvedSubmissionId" TEXT NOT NULL,
    "registryKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "public"."WorkKind" NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "state" "public"."WorkState" NOT NULL DEFAULT 'READY',
    "payload" JSONB NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "leaseOwner" TEXT,
    "leaseEpoch" INTEGER NOT NULL DEFAULT 0,
    "leaseUntil" TIMESTAMP(3),
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submissionId" TEXT,

    CONSTRAINT "WorkItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OutboxEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workItemId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "leaseUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Notification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "recipientCiphertext" BYTEA NOT NULL,
    "payloadCiphertext" BYTEA,
    "keyVersion" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "deliveryState" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workItemId" TEXT NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorType" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "safeMetadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "public"."Session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Account_providerId_accountId_key" ON "public"."Account"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "Verification_identifier_idx" ON "public"."Verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_tenantId_userId_key" ON "public"."Membership"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_tenantId_id_key" ON "public"."Membership"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "BuyerEnrollment_tenantId_emailKey_key" ON "public"."BuyerEnrollment"("tenantId", "emailKey");

-- CreateIndex
CREATE UNIQUE INDEX "BuyerEnrollment_tenantId_id_key" ON "public"."BuyerEnrollment"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyVersion_tenantId_category_country_version_key" ON "public"."PolicyVersion"("tenantId", "category", "country", "version");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyVersion_tenantId_id_key" ON "public"."PolicyVersion"("tenantId", "id");

-- CreateIndex
CREATE INDEX "OnboardingCase_tenantId_status_createdAt_id_idx" ON "public"."OnboardingCase"("tenantId", "status", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingCase_tenantId_id_key" ON "public"."OnboardingCase"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "public"."Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_tenantId_caseId_createdAt_idx" ON "public"."Invitation"("tenantId", "caseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tenantId_id_key" ON "public"."Invitation"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CaseAccess_tenantId_caseId_userId_key" ON "public"."CaseAccess"("tenantId", "caseId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CaseAccess_tenantId_id_key" ON "public"."CaseAccess"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_tenantId_caseId_number_key" ON "public"."Submission"("tenantId", "caseId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_tenantId_id_key" ON "public"."Submission"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyProfile_submissionId_key" ON "public"."CompanyProfile"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyProfile_tenantId_submissionId_key" ON "public"."CompanyProfile"("tenantId", "submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyProfile_tenantId_id_key" ON "public"."CompanyProfile"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TaxProfile_submissionId_key" ON "public"."TaxProfile"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "TaxProfile_tenantId_submissionId_key" ON "public"."TaxProfile"("tenantId", "submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "TaxProfile_tenantId_id_key" ON "public"."TaxProfile"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "BankProfile_submissionId_key" ON "public"."BankProfile"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "BankProfile_tenantId_submissionId_key" ON "public"."BankProfile"("tenantId", "submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "BankProfile_tenantId_id_key" ON "public"."BankProfile"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Qualification_tenantId_id_key" ON "public"."Qualification"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "OwnershipEntity_tenantId_submissionId_entityKey_key" ON "public"."OwnershipEntity"("tenantId", "submissionId", "entityKey");

-- CreateIndex
CREATE UNIQUE INDEX "OwnershipEntity_tenantId_id_key" ON "public"."OwnershipEntity"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "OwnershipEdge_tenantId_submissionId_ownerEntityKey_ownedEnt_key" ON "public"."OwnershipEdge"("tenantId", "submissionId", "ownerEntityKey", "ownedEntityKey");

-- CreateIndex
CREATE UNIQUE INDEX "OwnershipEdge_tenantId_id_key" ON "public"."OwnershipEdge"("tenantId", "id");

-- CreateIndex
CREATE INDEX "Document_tenantId_submissionId_status_idx" ON "public"."Document"("tenantId", "submissionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Document_tenantId_id_key" ON "public"."Document"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Document_tenantId_submissionId_id_key" ON "public"."Document"("tenantId", "submissionId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Extraction_tenantId_documentId_extractorVersion_key" ON "public"."Extraction"("tenantId", "documentId", "extractorVersion");

-- CreateIndex
CREATE UNIQUE INDEX "Extraction_tenantId_id_key" ON "public"."Extraction"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CheckRun_tenantId_submissionId_ruleKey_attempt_key" ON "public"."CheckRun"("tenantId", "submissionId", "ruleKey", "attempt");

-- CreateIndex
CREATE UNIQUE INDEX "CheckRun_tenantId_id_key" ON "public"."CheckRun"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CheckEvidence_tenantId_id_key" ON "public"."CheckEvidence"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Issue_tenantId_id_key" ON "public"."Issue"("tenantId", "id");

-- CreateIndex
CREATE INDEX "Decision_tenantId_submissionId_createdAt_idx" ON "public"."Decision"("tenantId", "submissionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Decision_tenantId_id_key" ON "public"."Decision"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_approvedSubmissionId_key" ON "public"."Supplier"("approvedSubmissionId");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_tenantId_registryKey_key" ON "public"."Supplier"("tenantId", "registryKey");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_tenantId_approvedSubmissionId_key" ON "public"."Supplier"("tenantId", "approvedSubmissionId");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_tenantId_id_key" ON "public"."Supplier"("tenantId", "id");

-- CreateIndex
CREATE INDEX "WorkItem_state_availableAt_leaseUntil_idx" ON "public"."WorkItem"("state", "availableAt", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "WorkItem_tenantId_dedupeKey_key" ON "public"."WorkItem"("tenantId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "WorkItem_tenantId_id_key" ON "public"."WorkItem"("tenantId", "id");

-- CreateIndex
CREATE INDEX "OutboxEvent_publishedAt_leaseUntil_createdAt_idx" ON "public"."OutboxEvent"("publishedAt", "leaseUntil", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxEvent_tenantId_id_key" ON "public"."OutboxEvent"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_tenantId_workItemId_key" ON "public"."Notification"("tenantId", "workItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_tenantId_id_key" ON "public"."Notification"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_tenantId_actorId_operation_key_key" ON "public"."IdempotencyRecord"("tenantId", "actorId", "operation", "key");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_tenantId_id_key" ON "public"."IdempotencyRecord"("tenantId", "id");

-- CreateIndex
CREATE INDEX "AuditEvent_tenantId_entityType_entityId_createdAt_idx" ON "public"."AuditEvent"("tenantId", "entityType", "entityId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_tenantId_id_key" ON "public"."AuditEvent"("tenantId", "id");

-- AddForeignKey
ALTER TABLE "public"."Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Membership" ADD CONSTRAINT "Membership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BuyerEnrollment" ADD CONSTRAINT "BuyerEnrollment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PolicyVersion" ADD CONSTRAINT "PolicyVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OnboardingCase" ADD CONSTRAINT "OnboardingCase_tenantId_policyId_fkey" FOREIGN KEY ("tenantId", "policyId") REFERENCES "public"."PolicyVersion"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OnboardingCase" ADD CONSTRAINT "OnboardingCase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OnboardingCase" ADD CONSTRAINT "OnboardingCase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Invitation" ADD CONSTRAINT "Invitation_tenantId_caseId_fkey" FOREIGN KEY ("tenantId", "caseId") REFERENCES "public"."OnboardingCase"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Invitation" ADD CONSTRAINT "Invitation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CaseAccess" ADD CONSTRAINT "CaseAccess_tenantId_caseId_fkey" FOREIGN KEY ("tenantId", "caseId") REFERENCES "public"."OnboardingCase"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CaseAccess" ADD CONSTRAINT "CaseAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CaseAccess" ADD CONSTRAINT "CaseAccess_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Submission" ADD CONSTRAINT "Submission_tenantId_caseId_fkey" FOREIGN KEY ("tenantId", "caseId") REFERENCES "public"."OnboardingCase"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Submission" ADD CONSTRAINT "Submission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Submission" ADD CONSTRAINT "Submission_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CompanyProfile" ADD CONSTRAINT "CompanyProfile_tenantId_submissionId_fkey" FOREIGN KEY ("tenantId", "submissionId") REFERENCES "public"."Submission"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CompanyProfile" ADD CONSTRAINT "CompanyProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaxProfile" ADD CONSTRAINT "TaxProfile_tenantId_submissionId_fkey" FOREIGN KEY ("tenantId", "submissionId") REFERENCES "public"."Submission"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaxProfile" ADD CONSTRAINT "TaxProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BankProfile" ADD CONSTRAINT "BankProfile_tenantId_submissionId_fkey" FOREIGN KEY ("tenantId", "submissionId") REFERENCES "public"."Submission"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BankProfile" ADD CONSTRAINT "BankProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Qualification" ADD CONSTRAINT "Qualification_tenantId_submissionId_fkey" FOREIGN KEY ("tenantId", "submissionId") REFERENCES "public"."Submission"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Qualification" ADD CONSTRAINT "Qualification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OwnershipEntity" ADD CONSTRAINT "OwnershipEntity_tenantId_submissionId_fkey" FOREIGN KEY ("tenantId", "submissionId") REFERENCES "public"."Submission"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OwnershipEntity" ADD CONSTRAINT "OwnershipEntity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OwnershipEdge" ADD CONSTRAINT "OwnershipEdge_tenantId_submissionId_ownerEntityKey_fkey" FOREIGN KEY ("tenantId", "submissionId", "ownerEntityKey") REFERENCES "public"."OwnershipEntity"("tenantId", "submissionId", "entityKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OwnershipEdge" ADD CONSTRAINT "OwnershipEdge_tenantId_submissionId_ownedEntityKey_fkey" FOREIGN KEY ("tenantId", "submissionId", "ownedEntityKey") REFERENCES "public"."OwnershipEntity"("tenantId", "submissionId", "entityKey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OwnershipEdge" ADD CONSTRAINT "OwnershipEdge_tenantId_submissionId_fkey" FOREIGN KEY ("tenantId", "submissionId") REFERENCES "public"."Submission"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OwnershipEdge" ADD CONSTRAINT "OwnershipEdge_tenantId_submissionId_evidenceDocumentId_fkey" FOREIGN KEY ("tenantId", "submissionId", "evidenceDocumentId") REFERENCES "public"."Document"("tenantId", "submissionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OwnershipEdge" ADD CONSTRAINT "OwnershipEdge_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Document" ADD CONSTRAINT "Document_tenantId_submissionId_fkey" FOREIGN KEY ("tenantId", "submissionId") REFERENCES "public"."Submission"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Document" ADD CONSTRAINT "Document_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Extraction" ADD CONSTRAINT "Extraction_tenantId_documentId_fkey" FOREIGN KEY ("tenantId", "documentId") REFERENCES "public"."Document"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Extraction" ADD CONSTRAINT "Extraction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CheckRun" ADD CONSTRAINT "CheckRun_tenantId_submissionId_fkey" FOREIGN KEY ("tenantId", "submissionId") REFERENCES "public"."Submission"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CheckRun" ADD CONSTRAINT "CheckRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CheckEvidence" ADD CONSTRAINT "CheckEvidence_tenantId_checkRunId_fkey" FOREIGN KEY ("tenantId", "checkRunId") REFERENCES "public"."CheckRun"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CheckEvidence" ADD CONSTRAINT "CheckEvidence_tenantId_documentId_fkey" FOREIGN KEY ("tenantId", "documentId") REFERENCES "public"."Document"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CheckEvidence" ADD CONSTRAINT "CheckEvidence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Issue" ADD CONSTRAINT "Issue_tenantId_submissionId_fkey" FOREIGN KEY ("tenantId", "submissionId") REFERENCES "public"."Submission"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Issue" ADD CONSTRAINT "Issue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Decision" ADD CONSTRAINT "Decision_tenantId_submissionId_fkey" FOREIGN KEY ("tenantId", "submissionId") REFERENCES "public"."Submission"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Decision" ADD CONSTRAINT "Decision_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Decision" ADD CONSTRAINT "Decision_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Supplier" ADD CONSTRAINT "Supplier_tenantId_approvedSubmissionId_fkey" FOREIGN KEY ("tenantId", "approvedSubmissionId") REFERENCES "public"."Submission"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Supplier" ADD CONSTRAINT "Supplier_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkItem" ADD CONSTRAINT "WorkItem_tenantId_submissionId_fkey" FOREIGN KEY ("tenantId", "submissionId") REFERENCES "public"."Submission"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkItem" ADD CONSTRAINT "WorkItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OutboxEvent" ADD CONSTRAINT "OutboxEvent_tenantId_workItemId_fkey" FOREIGN KEY ("tenantId", "workItemId") REFERENCES "public"."WorkItem"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OutboxEvent" ADD CONSTRAINT "OutboxEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_tenantId_workItemId_fkey" FOREIGN KEY ("tenantId", "workItemId") REFERENCES "public"."WorkItem"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditEvent" ADD CONSTRAINT "AuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
