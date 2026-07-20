-- CreateEnum
CREATE TYPE "MembershipBillingPeriodStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED', 'INVALIDATED');

-- CreateEnum
CREATE TYPE "CompanyEntitlementType" AS ENUM ('ALL_MODELS_PERMANENT');

-- CreateEnum
CREATE TYPE "CompanyEntitlementSourceType" AS ENUM ('MONTHLY_MILESTONE', 'ANNUAL_PURCHASE', 'SUPER_AGENT_SELF_COMPANY', 'ADMIN_GRANT', 'LEGACY_MIGRATION');

-- CreateEnum
CREATE TYPE "MembershipPointGrantRunStatus" AS ENUM ('PENDING', 'PROCESSING', 'GRANTED', 'FAILED', 'SKIPPED', 'REVERSED');

-- CreateEnum
CREATE TYPE "CreditGrantType" AS ENUM ('WELCOME', 'MEMBERSHIP', 'RECHARGE_BASE', 'RECHARGE_BONUS', 'AGENT_DEMO', 'AGENT_LEAD', 'MANUAL_ADJUSTMENT', 'LEGACY_UNKNOWN');

-- CreateEnum
CREATE TYPE "MembershipBillingCycle" AS ENUM ('MONTHLY', 'YEARLY');

ALTER TABLE "CreditGrant" ADD COLUMN     "grantType" "CreditGrantType";

-- CreateTable
CREATE TABLE "MembershipBillingPeriod" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "paymentOrderId" TEXT,
    "provider" TEXT NOT NULL,
    "externalPeriodKey" TEXT NOT NULL,
    "planCode" TEXT NOT NULL,
    "billingCycle" "MembershipBillingCycle" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "MembershipBillingPeriodStatus" NOT NULL DEFAULT 'PENDING',
    "paymentCompletedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "invalidatedAt" TIMESTAMP(3),
    "invalidationReason" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipBillingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyEntitlementGrant" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entitlementType" "CompanyEntitlementType" NOT NULL,
    "sourceType" "CompanyEntitlementSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceOrderId" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revocationReason" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyEntitlementGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipPointGrantRun" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "billingPeriodId" TEXT,
    "planCode" TEXT NOT NULL,
    "grantPeriodKey" TEXT NOT NULL,
    "grantPeriodStart" TIMESTAMP(3) NOT NULL,
    "grantPeriodEnd" TIMESTAMP(3) NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "grantedAt" TIMESTAMP(3),
    "points" INTEGER NOT NULL,
    "status" "MembershipPointGrantRunStatus" NOT NULL DEFAULT 'PENDING',
    "creditGrantId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipPointGrantRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditLedgerAllocation" (
    "id" TEXT NOT NULL,
    "ledgerId" TEXT NOT NULL,
    "creditGrantId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLedgerAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MembershipBillingPeriod_companyId_periodStart_periodEnd_idx" ON "MembershipBillingPeriod"("companyId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "MembershipBillingPeriod_companyId_billingCycle_status_idx" ON "MembershipBillingPeriod"("companyId", "billingCycle", "status");

-- CreateIndex
CREATE INDEX "MembershipBillingPeriod_subscriptionId_periodStart_idx" ON "MembershipBillingPeriod"("subscriptionId", "periodStart");

-- CreateIndex
CREATE INDEX "MembershipBillingPeriod_paymentOrderId_idx" ON "MembershipBillingPeriod"("paymentOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipBillingPeriod_provider_externalPeriodKey_key" ON "MembershipBillingPeriod"("provider", "externalPeriodKey");

-- CreateIndex
CREATE INDEX "CompanyEntitlementGrant_companyId_entitlementType_revokedAt_idx" ON "CompanyEntitlementGrant"("companyId", "entitlementType", "revokedAt");

-- CreateIndex
CREATE INDEX "CompanyEntitlementGrant_sourceOrderId_idx" ON "CompanyEntitlementGrant"("sourceOrderId");

-- CreateIndex
CREATE INDEX "CompanyEntitlementGrant_sourceType_sourceId_idx" ON "CompanyEntitlementGrant"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyEntitlementGrant_companyId_entitlementType_sourceTyp_key" ON "CompanyEntitlementGrant"("companyId", "entitlementType", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipPointGrantRun_creditGrantId_key" ON "MembershipPointGrantRun"("creditGrantId");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipPointGrantRun_idempotencyKey_key" ON "MembershipPointGrantRun"("idempotencyKey");

-- CreateIndex
CREATE INDEX "MembershipPointGrantRun_companyId_status_scheduledAt_idx" ON "MembershipPointGrantRun"("companyId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "MembershipPointGrantRun_billingPeriodId_idx" ON "MembershipPointGrantRun"("billingPeriodId");

-- CreateIndex
CREATE INDEX "MembershipPointGrantRun_subscriptionId_grantPeriodStart_idx" ON "MembershipPointGrantRun"("subscriptionId", "grantPeriodStart");

-- CreateIndex
CREATE INDEX "MembershipPointGrantRun_status_scheduledAt_idx" ON "MembershipPointGrantRun"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipPointGrantRun_subscriptionId_grantPeriodKey_key" ON "MembershipPointGrantRun"("subscriptionId", "grantPeriodKey");

-- CreateIndex
CREATE INDEX "CreditLedgerAllocation_ledgerId_idx" ON "CreditLedgerAllocation"("ledgerId");

-- CreateIndex
CREATE INDEX "CreditLedgerAllocation_creditGrantId_idx" ON "CreditLedgerAllocation"("creditGrantId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditLedgerAllocation_ledgerId_creditGrantId_key" ON "CreditLedgerAllocation"("ledgerId", "creditGrantId");

CREATE INDEX "CreditGrant_companyId_grantType_idx" ON "CreditGrant"("companyId", "grantType");

-- AddForeignKey
ALTER TABLE "MembershipBillingPeriod" ADD CONSTRAINT "MembershipBillingPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipBillingPeriod" ADD CONSTRAINT "MembershipBillingPeriod_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipBillingPeriod" ADD CONSTRAINT "MembershipBillingPeriod_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "PaymentOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyEntitlementGrant" ADD CONSTRAINT "CompanyEntitlementGrant_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPointGrantRun" ADD CONSTRAINT "MembershipPointGrantRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPointGrantRun" ADD CONSTRAINT "MembershipPointGrantRun_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPointGrantRun" ADD CONSTRAINT "MembershipPointGrantRun_billingPeriodId_fkey" FOREIGN KEY ("billingPeriodId") REFERENCES "MembershipBillingPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPointGrantRun" ADD CONSTRAINT "MembershipPointGrantRun_creditGrantId_fkey" FOREIGN KEY ("creditGrantId") REFERENCES "CreditGrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedgerAllocation" ADD CONSTRAINT "CreditLedgerAllocation_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "CreditLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedgerAllocation" ADD CONSTRAINT "CreditLedgerAllocation_creditGrantId_fkey" FOREIGN KEY ("creditGrantId") REFERENCES "CreditGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
