import type { Prisma, PrismaClient } from '@prisma/client';

type AssertTrue<T extends true> = T;
type HasKey<T, K extends PropertyKey> = K extends keyof T ? true : false;

type Client = PrismaClient;

const _checkMembershipBillingPeriodDelegate: AssertTrue<HasKey<Client, 'membershipBillingPeriod'>> = true;
const _checkCompanyEntitlementGrantDelegate: AssertTrue<HasKey<Client, 'companyEntitlementGrant'>> = true;
const _checkMembershipPointGrantRunDelegate: AssertTrue<HasKey<Client, 'membershipPointGrantRun'>> = true;
const _checkCreditLedgerAllocationDelegate: AssertTrue<HasKey<Client, 'creditLedgerAllocation'>> = true;

// Force compile-time resolution of the generated Prisma types without
// referencing non-existent declared variables at runtime.
type PrismaBillingV2TypeChecks = [
  Prisma.MembershipBillingPeriodCreateInput,
  Prisma.MembershipBillingPeriodWhereUniqueInput,
  Prisma.CompanyEntitlementGrantCreateInput,
  Prisma.CompanyEntitlementGrantWhereUniqueInput,
  Prisma.MembershipPointGrantRunCreateInput,
  Prisma.MembershipPointGrantRunWhereUniqueInput,
  Prisma.CreditLedgerAllocationCreateInput,
  Prisma.CreditLedgerAllocationWhereUniqueInput,
];

const _prismaBillingV2TypeChecks: PrismaBillingV2TypeChecks | null = null;

void [
  _checkMembershipBillingPeriodDelegate,
  _checkCompanyEntitlementGrantDelegate,
  _checkMembershipPointGrantRunDelegate,
  _checkCreditLedgerAllocationDelegate,
  _prismaBillingV2TypeChecks,
];

console.log(JSON.stringify({ ok: true }));
