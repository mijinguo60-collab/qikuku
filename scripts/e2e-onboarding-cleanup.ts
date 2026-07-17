import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const TEST_RUN_ID = "1720000000000";
const testData = {
  userId: "e854792e-ceaa-49e5-9eaf-9184396ead92",
  email: "onboarding-e2e-1720000000000@qikuku.test",
  companyId: "3daed28c-e3bb-4898-ba7b-2c4e99b660cd",
  holdingCompanyId: "a1e136bb-830e-458a-b82e-665067a626be",
  sessionId: "a2d4e36d71e8e9f51ed35d3bb1c6f740",
  membershipId: "948bb240-694d-4bfc-bfba-9a7b4ff63684",
  subscriptionId: "ce645f04-d8be-43bf-a16b-0616d27816a4",
  creditAccountId: "ec7dacd8-e6d8-4107-8006-109f75da05b0",
  creditLedgerId: "46da180f-a051-4a10-b3fe-93fbd88975ea",
} as const;

type Db = {
  prepare(sql: string): {
    all(...params: unknown[]): Promise<Array<{ id: string }>>;
    run(...params: unknown[]): Promise<{ changes: number }>;
  };
  transactionAsync<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
};

type ErrorLike = {
  message?: unknown;
  code?: unknown;
  detail?: unknown;
  hint?: unknown;
  constraint?: unknown;
  table?: unknown;
  column?: unknown;
  schema?: unknown;
  stack?: unknown;
  cause?: unknown;
  errors?: unknown;
};

function printError(error: unknown, label = "Cleanup Error"): void {
  const value = (error && typeof error === "object" ? error : {}) as ErrorLike;
  console.error(`[${label}]`);
  console.error(`type: ${error instanceof Error ? error.constructor.name : typeof error}`);
  console.error(`message: ${String(value.message ?? error)}`);
  console.error(`code: ${String(value.code ?? "")}`);
  console.error(`detail: ${String(value.detail ?? "")}`);
  console.error(`hint: ${String(value.hint ?? "")}`);
  console.error(`constraint: ${String(value.constraint ?? "")}`);
  console.error(`table: ${String(value.table ?? "")}`);
  console.error(`column: ${String(value.column ?? "")}`);
  console.error(`schema: ${String(value.schema ?? "")}`);
  if (process.env.NODE_ENV !== "production" && value.stack) console.error(String(value.stack));
  if (Array.isArray(value.errors)) value.errors.forEach((child, index) => printError(child, `Cleanup Error ${index + 1}`));
  if (value.cause) printError(value.cause, `${label} cause`);
}

function ids(rows: Array<{ id: string }>): string[] {
  return rows.map((row) => row.id).sort();
}

function assertIds(name: string, actualRows: Array<{ id: string }>, expected: readonly string[]): void {
  const actual = ids(actualRows);
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((id, index) => id !== wanted[index])) {
    throw new Error(`${name} 预检不匹配：期望 [${wanted.join(", ")}], 实际 [${actual.join(", ")}]`);
  }
}

function lockSuffix(lock: boolean): string {
  return lock ? " FOR UPDATE" : "";
}

function checksFor(db: Db, lock = false) {
  const suffix = lockSuffix(lock);
  // Each query is delayed inside run. runChecks awaits one before starting the next.
  return [
    { name: "User", expected: [testData.userId], run: async () => db.prepare(`SELECT id FROM "User" WHERE id=? AND email=?${suffix}`).all(testData.userId, testData.email) },
    { name: "UserSession", expected: [testData.sessionId], run: async () => db.prepare(`SELECT id FROM "UserSession" WHERE id=? AND "userId"=?${suffix}`).all(testData.sessionId, testData.userId) },
    { name: "AuthIdentity", expected: [], run: async () => db.prepare(`SELECT id FROM "AuthIdentity" WHERE "userId"=?${suffix}`).all(testData.userId) },
    { name: "CompanyMembership", expected: [testData.membershipId], run: async () => db.prepare(`SELECT id FROM "CompanyMembership" WHERE id=? AND "userId"=?${suffix}`).all(testData.membershipId, testData.userId) },
    { name: "Subscription", expected: [testData.subscriptionId], run: async () => db.prepare(`SELECT id FROM "Subscription" WHERE id=? AND "companyId"=?${suffix}`).all(testData.subscriptionId, testData.companyId) },
    { name: "CreditAccount", expected: [testData.creditAccountId], run: async () => db.prepare(`SELECT id FROM "CreditAccount" WHERE id=? AND "companyId"=?${suffix}`).all(testData.creditAccountId, testData.companyId) },
    { name: "CreditLedger", expected: [testData.creditLedgerId], run: async () => db.prepare(`SELECT id FROM "CreditLedger" WHERE id=? AND "companyId"=?${suffix}`).all(testData.creditLedgerId, testData.companyId) },
    { name: "RechargeOrder", expected: [], run: async () => db.prepare(`SELECT id FROM "RechargeOrder" WHERE "companyId"=?${suffix}`).all(testData.companyId) },
    { name: "PaymentOrder", expected: [], run: async () => db.prepare(`SELECT id FROM "PaymentOrder" WHERE "companyId"=?${suffix}`).all(testData.companyId) },
    { name: "正式测试 Company", expected: [testData.companyId], run: async () => db.prepare(`SELECT id FROM "Company" WHERE id=?${suffix}`).all(testData.companyId) },
    { name: "占位 Company", expected: [testData.holdingCompanyId], run: async () => db.prepare(`SELECT id FROM "Company" WHERE id=?${suffix}`).all(testData.holdingCompanyId) },
    { name: "seed User", expected: ["seed-admin-zhucheng", "seed-employee-zhucheng"], run: async () => db.prepare(`SELECT id FROM "User" WHERE id IN ('seed-admin-zhucheng', 'seed-employee-zhucheng')`).all() },
    { name: "seed Company", expected: ["seed-company-zhucheng"], run: async () => db.prepare(`SELECT id FROM "Company" WHERE id='seed-company-zhucheng'`).all() },
  ] as const;
}

async function runChecks(db: Db, options: { lock?: boolean; label: string }): Promise<Record<string, string[]>> {
  const results: Record<string, string[]> = {};
  for (const check of checksFor(db, options.lock)) {
    console.log(`[E2E CLEANUP] ${options.label} checking ${check.name}`);
    try {
      const rows = await check.run();
      assertIds(check.name, rows, check.expected);
      results[check.name] = ids(rows);
      console.log(`[E2E CLEANUP] ${options.label} completed ${check.name}: ${results[check.name].join(", ") || "0"}`);
    } catch (error) {
      console.error(`[E2E CLEANUP] failed table=${check.name}`);
      printError(error);
      throw error;
    }
  }
  return results;
}

async function deleteExactlyOne(tx: Db, name: string, sql: string, id: string): Promise<void> {
  const result = await tx.prepare(sql).run(id);
  if (result.changes !== 1) throw new Error(`${name} 删除行数不匹配：期望 1，实际 ${result.changes}`);
}

async function assertDeleted(db: Db): Promise<void> {
  const deletedChecks = [
    { name: "User", table: "User", id: testData.userId },
    { name: "UserSession", table: "UserSession", id: testData.sessionId },
    { name: "CompanyMembership", table: "CompanyMembership", id: testData.membershipId },
    { name: "Subscription", table: "Subscription", id: testData.subscriptionId },
    { name: "CreditAccount", table: "CreditAccount", id: testData.creditAccountId },
    { name: "CreditLedger", table: "CreditLedger", id: testData.creditLedgerId },
    { name: "正式测试 Company", table: "Company", id: testData.companyId },
    { name: "占位 Company", table: "Company", id: testData.holdingCompanyId },
  ] as const;

  for (const check of deletedChecks) {
    const rows = await db.prepare(`SELECT id FROM "${check.table}" WHERE id=?`).all(check.id);
    assertIds(`${check.name} 删除后复查`, rows, []);
  }
  assertIds("seed User 删除后复查", await db.prepare(`SELECT id FROM "User" WHERE id IN ('seed-admin-zhucheng', 'seed-employee-zhucheng')`).all(), ["seed-admin-zhucheng", "seed-employee-zhucheng"]);
  assertIds("seed Company 删除后复查", await db.prepare(`SELECT id FROM "Company" WHERE id='seed-company-zhucheng'`).all(), ["seed-company-zhucheng"]);
}

function parseMode(): "dry-run" | "confirm" {
  const args = process.argv.slice(2);
  if (args.length !== 1 || (args[0] !== "--dry-run" && args[0] !== "--confirm")) {
    throw new Error("必须且只能传入 --dry-run 或 --confirm 其中之一");
  }
  const dryRun = args[0] === "--dry-run";
  const confirm = args[0] === "--confirm";
  if (dryRun === confirm) throw new Error("必须且只能传入 --dry-run 或 --confirm 其中之一");
  if (confirm && process.env.CONFIRM_ONBOARDING_E2E_CLEANUP !== TEST_RUN_ID) {
    throw new Error("--confirm 需要 CONFIRM_ONBOARDING_E2E_CLEANUP 与本次 testRunId 完全一致");
  }
  return confirm ? "confirm" : "dry-run";
}

async function main(): Promise<void> {
  const mode = parseMode();
  if (!/^postgres(?:ql)?:\/\//.test(process.env.DATABASE_URL || "")) {
    throw new Error("E2E cleanup 未连接 PostgreSQL，已停止");
  }
  process.env.DATABASE_REQUIRE_POSTGRES = "true";
  const { getDb } = await import("../lib/db");
  const db = getDb() as Db;

  const preflight = await runChecks(db, { label: "preflight" });
  console.log("[E2E CLEANUP] SmsVerification: status=not_applicable count=0");
  console.log(JSON.stringify({ ...preflight, SmsVerification: { status: "not_applicable", count: 0 } }, null, 2));
  if (mode === "dry-run") return;

  await db.transactionAsync(async (tx) => {
    await runChecks(tx, { lock: true, label: "transaction lock" });
    await deleteExactlyOne(tx, "UserSession", 'DELETE FROM "UserSession" WHERE id=?', testData.sessionId);
    await deleteExactlyOne(tx, "CompanyMembership", 'DELETE FROM "CompanyMembership" WHERE id=?', testData.membershipId);
    await deleteExactlyOne(tx, "CreditLedger", 'DELETE FROM "CreditLedger" WHERE id=?', testData.creditLedgerId);
    await deleteExactlyOne(tx, "CreditAccount", 'DELETE FROM "CreditAccount" WHERE id=?', testData.creditAccountId);
    await deleteExactlyOne(tx, "Subscription", 'DELETE FROM "Subscription" WHERE id=?', testData.subscriptionId);
    await deleteExactlyOne(tx, "User", 'DELETE FROM "User" WHERE id=?', testData.userId);
    await deleteExactlyOne(tx, "正式测试 Company", 'DELETE FROM "Company" WHERE id=?', testData.companyId);
    await deleteExactlyOne(tx, "占位 Company", 'DELETE FROM "Company" WHERE id=?', testData.holdingCompanyId);
  });

  await assertDeleted(db);
  console.log("[E2E CLEANUP] confirm cleanup completed and post-delete verification passed");
}

main().catch((error) => {
  printError(error, "E2E cleanup stopped");
  process.exitCode = 1;
});
