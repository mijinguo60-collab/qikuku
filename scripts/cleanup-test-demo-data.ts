import assert from 'node:assert/strict';
import { loadEnvConfig } from '@next/env';
import { Client } from 'pg';

loadEnvConfig(process.cwd());

const TEST_ENDPOINT = 'ep-snowy-tooth-ata0virv.c-9.us-east-1.aws.neon.tech';
const COMPANY_ID = 'seed-company-zhucheng';
const USER_IDS = ['seed-admin-zhucheng', 'seed-employee-zhucheng'];
const APPLY_CONFIRMATION = COMPANY_ID;
const ROLLBACK_CONFIRMATION = COMPANY_ID;

type IdRow = { id: string };
type MembershipRow = IdRow & { userId: string; companyId: string };
type InvitationRow = IdRow & { companyId: string; inviterId: string };
type CompanyUserRow = IdRow & { companyId: string; userId: string };
type PlatformAuditRow = IdRow & { companyId: string | null; adminUserId: string; targetId: string | null };
type Summary = Record<string, { count: number; ids: string[] }>;
type SqlValues = Array<string | string[]>;

const namedDependencies = [
  'ChatMessage', 'ChatSession', 'ImageGeneration', 'AiCallLog', 'RechargeOrder', 'UsageRecord', 'PlatformAuditLog',
  'UserSession', 'AuthIdentity', 'CompanyMembership', 'CompanyInvitation',
  'Subscription', 'CreditAccount', 'CreditGrant', 'CreditLedger',
  'KnowledgeSpace', 'Document', 'Skill', 'AuditLog', 'User', 'Company',
] as const;

function parseMode(args: readonly string[]) {
  if (args.length === 0 || (args.length === 1 && args[0] === '--dry-run')) return 'dry-run' as const;
  if (args.length === 1 && args[0] === '--verify-rollback') return 'verify-rollback' as const;
  if (args.length === 1 && args[0] === '--apply') return 'apply' as const;
  throw new Error('仅支持 --dry-run（默认）、--verify-rollback 或 --apply；不支持其他参数');
}

function databaseUrl() {
  const value = process.env.DATABASE_DIRECT_URL;
  if (!value) throw new Error('DATABASE_DIRECT_URL 未配置');
  const parsed = new URL(value);
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') throw new Error('DATABASE_DIRECT_URL 必须是 PostgreSQL 连接串');
  if (parsed.hostname.toLowerCase() !== TEST_ENDPOINT || parsed.hostname.toLowerCase().includes('pooler')) {
    throw new Error(`拒绝连接非测试直连 Endpoint：仅允许 ${TEST_ENDPOINT}`);
  }
  return value;
}

function ids(rows: IdRow[]) {
  return rows.map((row) => row.id).sort();
}

function equalIds(actual: readonly string[], expected: readonly string[], label: string) {
  assert.deepEqual([...actual].sort(), [...expected].sort(), `${label} 精确 ID 不匹配`);
}

async function selectIds(client: Client, sql: string, values: SqlValues) {
  return ids((await client.query<IdRow>(sql, values)).rows);
}

function assertCompanyUserOwnership(rows: CompanyUserRow[], label: string) {
  for (const row of rows) {
    assert.equal(row.companyId, COMPANY_ID, `${label} ${row.id} 指向白名单外企业`);
    assert.ok(USER_IDS.includes(row.userId), `${label} ${row.id} 包含白名单外用户`);
  }
}

function assertPlatformAuditOwnership(rows: PlatformAuditRow[]) {
  for (const row of rows) {
    assert.ok(USER_IDS.includes(row.adminUserId), `PlatformAuditLog ${row.id} 包含白名单外管理员`);
    assert.ok(row.companyId === COMPANY_ID || row.companyId === null, `PlatformAuditLog ${row.id} 指向白名单外企业`);
    if (row.companyId === null) {
      assert.ok(row.targetId !== null && USER_IDS.includes(row.targetId), `PlatformAuditLog ${row.id} 的无企业范围目标不属于白名单用户`);
    }
  }
}

async function snapshot(client: Client, lock = false): Promise<Summary> {
  const suffix = lock ? ' FOR UPDATE' : '';
  const userRows = await client.query<IdRow & { companyId: string | null }>(
    `SELECT id,"companyId" FROM "User" WHERE id = ANY($1::text[]) ORDER BY id${suffix}`,
    [USER_IDS],
  );
  const companyRows = await client.query<IdRow>(`SELECT id FROM "Company" WHERE id=$1${suffix}`, [COMPANY_ID]);
  equalIds(ids(userRows.rows), USER_IDS, 'User');
  equalIds(ids(companyRows.rows), [COMPANY_ID], 'Company');
  for (const user of userRows.rows) assert.equal(user.companyId, COMPANY_ID, `User ${user.id} 不得关联白名单外企业`);

  const companyUserIds = await selectIds(
    client,
    `SELECT id FROM "User" WHERE "companyId"=$1 ORDER BY id${suffix}`,
    [COMPANY_ID],
  );
  try {
    equalIds(companyUserIds, USER_IDS, 'Company 归属 User');
  } catch (error) {
    console.log(JSON.stringify({
      unexpectedCompanyUsers: {
        companyId: COMPANY_ID,
        expectedUserIds: USER_IDS,
        actualUserIds: companyUserIds,
        extraUserIds: companyUserIds.filter((id) => !USER_IDS.includes(id)),
      },
    }, null, 2));
    throw error;
  }

  const memberships = await client.query<MembershipRow>(
    `SELECT id,"userId","companyId" FROM "CompanyMembership" WHERE "companyId"=$1 OR "userId" = ANY($2::text[]) ORDER BY id${suffix}`,
    [COMPANY_ID, USER_IDS],
  );
  for (const membership of memberships.rows) {
    assert.equal(membership.companyId, COMPANY_ID, `Membership ${membership.id} 指向白名单外企业`);
    assert.ok(USER_IDS.includes(membership.userId), `Membership ${membership.id} 包含白名单外用户`);
  }

  const invitations = await client.query<InvitationRow>(
    `SELECT id,"companyId","inviterId" FROM "CompanyInvitation" WHERE "companyId"=$1 OR "inviterId" = ANY($2::text[]) ORDER BY id${suffix}`,
    [COMPANY_ID, USER_IDS],
  );
  for (const invitation of invitations.rows) {
    assert.equal(invitation.companyId, COMPANY_ID, `Invitation ${invitation.id} 指向白名单外企业`);
    assert.ok(USER_IDS.includes(invitation.inviterId), `Invitation ${invitation.id} 包含白名单外邀请人`);
  }

  const chatSessions = await client.query<CompanyUserRow>(
    `SELECT id,"companyId","userId" FROM "ChatSession" WHERE "companyId"=$1 OR "userId" = ANY($2::text[]) ORDER BY id${suffix}`,
    [COMPANY_ID, USER_IDS],
  );
  assertCompanyUserOwnership(chatSessions.rows, 'ChatSession');
  const chatSessionIds = ids(chatSessions.rows);
  const chatMessageIds = await selectIds(
    client,
    `SELECT id FROM "ChatMessage" WHERE "sessionId" = ANY($1::text[]) ORDER BY id${suffix}`,
    [chatSessionIds],
  );

  const imageGenerations = await client.query<CompanyUserRow>(
    `SELECT id,"companyId","userId" FROM "ImageGeneration" WHERE "companyId"=$1 OR "userId" = ANY($2::text[]) ORDER BY id${suffix}`,
    [COMPANY_ID, USER_IDS],
  );
  assertCompanyUserOwnership(imageGenerations.rows, 'ImageGeneration');

  const aiCallLogs = await client.query<CompanyUserRow>(
    `SELECT id,"companyId","userId" FROM "AiCallLog" WHERE "companyId"=$1 OR "userId" = ANY($2::text[]) ORDER BY id${suffix}`,
    [COMPANY_ID, USER_IDS],
  );
  assertCompanyUserOwnership(aiCallLogs.rows, 'AiCallLog');

  const rechargeOrders = await client.query<CompanyUserRow>(
    `SELECT id,"companyId","userId" FROM "RechargeOrder" WHERE "companyId"=$1 OR "userId" = ANY($2::text[]) ORDER BY id${suffix}`,
    [COMPANY_ID, USER_IDS],
  );
  assertCompanyUserOwnership(rechargeOrders.rows, 'RechargeOrder');

  const usageRecords = await client.query<CompanyUserRow>(
    `SELECT id,"companyId","userId" FROM "UsageRecord" WHERE "companyId"=$1 OR "userId" = ANY($2::text[]) ORDER BY id${suffix}`,
    [COMPANY_ID, USER_IDS],
  );
  assertCompanyUserOwnership(usageRecords.rows, 'UsageRecord');

  const platformAuditLogs = await client.query<PlatformAuditRow>(
    `SELECT id,"companyId","adminUserId","targetId" FROM "PlatformAuditLog" WHERE "companyId"=$1 OR "adminUserId" = ANY($2::text[]) ORDER BY id${suffix}`,
    [COMPANY_ID, USER_IDS],
  );
  assertPlatformAuditOwnership(platformAuditLogs.rows);

  const summary: Summary = {
    ChatMessage: { count: 0, ids: chatMessageIds },
    ChatSession: { count: 0, ids: chatSessionIds },
    ImageGeneration: { count: 0, ids: ids(imageGenerations.rows) },
    AiCallLog: { count: 0, ids: ids(aiCallLogs.rows) },
    RechargeOrder: { count: 0, ids: ids(rechargeOrders.rows) },
    UsageRecord: { count: 0, ids: ids(usageRecords.rows) },
    PlatformAuditLog: { count: 0, ids: ids(platformAuditLogs.rows) },
    UserSession: { count: 0, ids: await selectIds(client, `SELECT id FROM "UserSession" WHERE "userId" = ANY($1::text[]) ORDER BY id${suffix}`, [USER_IDS]) },
    AuthIdentity: { count: 0, ids: await selectIds(client, `SELECT id FROM "AuthIdentity" WHERE "userId" = ANY($1::text[]) ORDER BY id${suffix}`, [USER_IDS]) },
    CompanyMembership: { count: 0, ids: ids(memberships.rows) },
    CompanyInvitation: { count: 0, ids: ids(invitations.rows) },
    Subscription: { count: 0, ids: await selectIds(client, `SELECT id FROM "Subscription" WHERE "companyId"=$1 ORDER BY id${suffix}`, [COMPANY_ID]) },
    CreditAccount: { count: 0, ids: await selectIds(client, `SELECT id FROM "CreditAccount" WHERE "companyId"=$1 ORDER BY id${suffix}`, [COMPANY_ID]) },
    CreditGrant: { count: 0, ids: await selectIds(client, `SELECT id FROM "CreditGrant" WHERE "companyId"=$1 ORDER BY id${suffix}`, [COMPANY_ID]) },
    CreditLedger: { count: 0, ids: await selectIds(client, `SELECT id FROM "CreditLedger" WHERE "companyId"=$1 ORDER BY id${suffix}`, [COMPANY_ID]) },
    KnowledgeSpace: { count: 0, ids: await selectIds(client, `SELECT id FROM "KnowledgeSpace" WHERE "companyId"=$1 ORDER BY id${suffix}`, [COMPANY_ID]) },
    Document: { count: 0, ids: await selectIds(client, `SELECT id FROM "Document" WHERE "companyId"=$1 ORDER BY id${suffix}`, [COMPANY_ID]) },
    Skill: { count: 0, ids: await selectIds(client, `SELECT id FROM "Skill" WHERE "companyId"=$1 ORDER BY id${suffix}`, [COMPANY_ID]) },
    AuditLog: { count: 0, ids: await selectIds(client, `SELECT id FROM "AuditLog" WHERE "companyId"=$1 ORDER BY id${suffix}`, [COMPANY_ID]) },
    User: { count: 0, ids: ids(userRows.rows) },
    Company: { count: 0, ids: ids(companyRows.rows) },
  };
  for (const dependency of namedDependencies) summary[dependency].count = summary[dependency].ids.length;
  return summary;
}

async function assertNoUnhandledDependencies(client: Client, summary: Summary) {
  const checks: Array<[string, string, SqlValues]> = [
    ['KnowledgeChunk', `SELECT id FROM "KnowledgeChunk" WHERE "companyId"=$1 OR "documentId" = ANY($2::text[]) ORDER BY id`, [COMPANY_ID, summary.Document.ids]],
    ['Asset', `SELECT id FROM "Asset" WHERE "companyId"=$1 OR "userId" = ANY($2::text[]) ORDER BY id`, [COMPANY_ID, USER_IDS]],
    ['ApiCredential', `SELECT id FROM "ApiCredential" WHERE "companyId"=$1 ORDER BY id`, [COMPANY_ID]],
    ['PaymentOrder', `SELECT id FROM "PaymentOrder" WHERE "companyId"=$1 OR "userId" = ANY($2::text[]) ORDER BY id`, [COMPANY_ID, USER_IDS]],
    ['MembershipBillingPeriod', `SELECT id FROM "MembershipBillingPeriod" WHERE "companyId"=$1 OR "subscriptionId" = ANY($2::text[]) ORDER BY id`, [COMPANY_ID, summary.Subscription.ids]],
    ['CompanyEntitlementGrant', `SELECT id FROM "CompanyEntitlementGrant" WHERE "companyId"=$1 ORDER BY id`, [COMPANY_ID]],
    ['MembershipPointGrantRun', `SELECT id FROM "MembershipPointGrantRun" WHERE "companyId"=$1 OR "subscriptionId" = ANY($2::text[]) OR "creditGrantId" = ANY($3::text[]) ORDER BY id`, [COMPANY_ID, summary.Subscription.ids, summary.CreditGrant.ids]],
    ['CreditLedgerAllocation', `SELECT id FROM "CreditLedgerAllocation" WHERE "ledgerId" = ANY($1::text[]) OR "creditGrantId" = ANY($2::text[]) ORDER BY id`, [summary.CreditLedger.ids, summary.CreditGrant.ids]],
    ['ExternalUserAuditLog', `SELECT id FROM "AuditLog" WHERE "userId" = ANY($1::text[]) AND "companyId" IS DISTINCT FROM $2 ORDER BY id`, [USER_IDS, COMPANY_ID]],
    ['ExternalUserCreditLedger', `SELECT id FROM "CreditLedger" WHERE "userId" = ANY($1::text[]) AND "companyId" IS DISTINCT FROM $2 ORDER BY id`, [USER_IDS, COMPANY_ID]],
    ['DocumentUploadedByWhitelistedUserElsewhere', `SELECT id FROM "Document" WHERE "uploadedBy" = ANY($1::text[]) AND "companyId" IS DISTINCT FROM $2 ORDER BY id`, [USER_IDS, COMPANY_ID]],
    ['DocumentUploadedByExternalUser', `SELECT id FROM "Document" WHERE "companyId"=$1 AND "uploadedBy" IS NOT NULL AND "uploadedBy" <> ALL($2::text[]) ORDER BY id`, [COMPANY_ID, USER_IDS]],
  ];
  const blockers: Summary = {};
  for (const [name, sql, values] of checks) {
    const dependencyIds = await selectIds(client, sql, values);
    blockers[name] = { count: dependencyIds.length, ids: dependencyIds };
  }
  if (Object.values(blockers).some((entry) => entry.count > 0)) {
    console.log(JSON.stringify({ unhandledDependencies: blockers }, null, 2));
    throw new Error('发现未列入本脚本白名单的关联记录；为避免扩大删除范围，已停止');
  }
}

async function deleteExact(client: Client, label: keyof Summary, sql: string, values: SqlValues, expectedIds: readonly string[]) {
  const deleted = await selectIds(client, sql, values);
  equalIds(deleted, expectedIds, `${label} 删除结果`);
}

async function assertNoRemainingTargetData(client: Client, before: Summary) {
  const checks: Array<[string, string, SqlValues]> = [
    ['ChatSession', `SELECT id FROM "ChatSession" WHERE "companyId"=$1 OR "userId" = ANY($2::text[]) ORDER BY id`, [COMPANY_ID, USER_IDS]],
    ['ChatMessage', `SELECT id FROM "ChatMessage" WHERE "sessionId" = ANY($1::text[]) ORDER BY id`, [before.ChatSession.ids]],
    ['ImageGeneration', `SELECT id FROM "ImageGeneration" WHERE "companyId"=$1 OR "userId" = ANY($2::text[]) ORDER BY id`, [COMPANY_ID, USER_IDS]],
    ['AiCallLog', `SELECT id FROM "AiCallLog" WHERE "companyId"=$1 OR "userId" = ANY($2::text[]) ORDER BY id`, [COMPANY_ID, USER_IDS]],
    ['RechargeOrder', `SELECT id FROM "RechargeOrder" WHERE "companyId"=$1 OR "userId" = ANY($2::text[]) ORDER BY id`, [COMPANY_ID, USER_IDS]],
    ['UsageRecord', `SELECT id FROM "UsageRecord" WHERE "companyId"=$1 OR "userId" = ANY($2::text[]) ORDER BY id`, [COMPANY_ID, USER_IDS]],
    ['PlatformAuditLog', `SELECT id FROM "PlatformAuditLog" WHERE "companyId"=$1 OR "adminUserId" = ANY($2::text[]) OR "targetId" = ANY($2::text[]) ORDER BY id`, [COMPANY_ID, USER_IDS]],
    ['UserSession', `SELECT id FROM "UserSession" WHERE "userId" = ANY($1::text[]) ORDER BY id`, [USER_IDS]],
    ['AuthIdentity', `SELECT id FROM "AuthIdentity" WHERE "userId" = ANY($1::text[]) ORDER BY id`, [USER_IDS]],
    ['CompanyInvitation', `SELECT id FROM "CompanyInvitation" WHERE "companyId"=$1 OR "inviterId" = ANY($2::text[]) ORDER BY id`, [COMPANY_ID, USER_IDS]],
    ['CompanyMembership', `SELECT id FROM "CompanyMembership" WHERE "companyId"=$1 OR "userId" = ANY($2::text[]) ORDER BY id`, [COMPANY_ID, USER_IDS]],
    ['Subscription', `SELECT id FROM "Subscription" WHERE "companyId"=$1 ORDER BY id`, [COMPANY_ID]],
    ['CreditAccount', `SELECT id FROM "CreditAccount" WHERE "companyId"=$1 ORDER BY id`, [COMPANY_ID]],
    ['CreditGrant', `SELECT id FROM "CreditGrant" WHERE "companyId"=$1 ORDER BY id`, [COMPANY_ID]],
    ['CreditLedger', `SELECT id FROM "CreditLedger" WHERE "companyId"=$1 ORDER BY id`, [COMPANY_ID]],
    ['KnowledgeSpace', `SELECT id FROM "KnowledgeSpace" WHERE "companyId"=$1 ORDER BY id`, [COMPANY_ID]],
    ['Document', `SELECT id FROM "Document" WHERE "companyId"=$1 ORDER BY id`, [COMPANY_ID]],
    ['Skill', `SELECT id FROM "Skill" WHERE "companyId"=$1 ORDER BY id`, [COMPANY_ID]],
    ['AuditLog', `SELECT id FROM "AuditLog" WHERE "companyId"=$1 ORDER BY id`, [COMPANY_ID]],
    ['User', `SELECT id FROM "User" WHERE id = ANY($1::text[]) OR "companyId"=$2 ORDER BY id`, [USER_IDS, COMPANY_ID]],
    ['Company', `SELECT id FROM "Company" WHERE id=$1 ORDER BY id`, [COMPANY_ID]],
  ];
  const remaining: Summary = {};
  for (const [name, sql, values] of checks) {
    const remainingIds = await selectIds(client, sql, values);
    remaining[name] = { count: remainingIds.length, ids: remainingIds };
  }
  if (Object.values(remaining).some((entry) => entry.count > 0)) {
    console.log(JSON.stringify({ remainingTargetData: remaining }, null, 2));
    throw new Error('删除后仍存在目标条件匹配记录；已停止并将整体回滚');
  }
}

async function beginCleanupTransaction(client: Client) {
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  await client.query(`SET LOCAL lock_timeout = '5s'`);
  await client.query(`SET LOCAL statement_timeout = '60s'`);
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`cleanup:${COMPANY_ID}`]);
}

async function deleteAndVerifyWithinTransaction(client: Client, before: Summary) {
  await deleteExact(client, 'ChatMessage', `DELETE FROM "ChatMessage" WHERE id = ANY($1::text[]) AND "sessionId" = ANY($2::text[]) RETURNING id`, [before.ChatMessage.ids, before.ChatSession.ids], before.ChatMessage.ids);
  await deleteExact(client, 'ChatSession', `DELETE FROM "ChatSession" WHERE id = ANY($1::text[]) RETURNING id`, [before.ChatSession.ids], before.ChatSession.ids);
  await deleteExact(client, 'ImageGeneration', `DELETE FROM "ImageGeneration" WHERE id = ANY($1::text[]) RETURNING id`, [before.ImageGeneration.ids], before.ImageGeneration.ids);
  await deleteExact(client, 'AiCallLog', `DELETE FROM "AiCallLog" WHERE id = ANY($1::text[]) RETURNING id`, [before.AiCallLog.ids], before.AiCallLog.ids);
  await deleteExact(client, 'RechargeOrder', `DELETE FROM "RechargeOrder" WHERE id = ANY($1::text[]) RETURNING id`, [before.RechargeOrder.ids], before.RechargeOrder.ids);
  await deleteExact(client, 'UsageRecord', `DELETE FROM "UsageRecord" WHERE id = ANY($1::text[]) RETURNING id`, [before.UsageRecord.ids], before.UsageRecord.ids);
  await deleteExact(client, 'PlatformAuditLog', `DELETE FROM "PlatformAuditLog" WHERE id = ANY($1::text[]) RETURNING id`, [before.PlatformAuditLog.ids], before.PlatformAuditLog.ids);
  await deleteExact(client, 'UserSession', `DELETE FROM "UserSession" WHERE id = ANY($1::text[]) RETURNING id`, [before.UserSession.ids], before.UserSession.ids);
  await deleteExact(client, 'AuthIdentity', `DELETE FROM "AuthIdentity" WHERE id = ANY($1::text[]) RETURNING id`, [before.AuthIdentity.ids], before.AuthIdentity.ids);
  await deleteExact(client, 'CompanyInvitation', `DELETE FROM "CompanyInvitation" WHERE id = ANY($1::text[]) RETURNING id`, [before.CompanyInvitation.ids], before.CompanyInvitation.ids);
  await deleteExact(client, 'CompanyMembership', `DELETE FROM "CompanyMembership" WHERE id = ANY($1::text[]) RETURNING id`, [before.CompanyMembership.ids], before.CompanyMembership.ids);
  await deleteExact(client, 'CreditLedger', `DELETE FROM "CreditLedger" WHERE id = ANY($1::text[]) RETURNING id`, [before.CreditLedger.ids], before.CreditLedger.ids);
  await deleteExact(client, 'CreditGrant', `DELETE FROM "CreditGrant" WHERE id = ANY($1::text[]) RETURNING id`, [before.CreditGrant.ids], before.CreditGrant.ids);
  await deleteExact(client, 'CreditAccount', `DELETE FROM "CreditAccount" WHERE id = ANY($1::text[]) RETURNING id`, [before.CreditAccount.ids], before.CreditAccount.ids);
  await deleteExact(client, 'Document', `DELETE FROM "Document" WHERE id = ANY($1::text[]) RETURNING id`, [before.Document.ids], before.Document.ids);
  await deleteExact(client, 'KnowledgeSpace', `DELETE FROM "KnowledgeSpace" WHERE id = ANY($1::text[]) RETURNING id`, [before.KnowledgeSpace.ids], before.KnowledgeSpace.ids);
  await deleteExact(client, 'Skill', `DELETE FROM "Skill" WHERE id = ANY($1::text[]) RETURNING id`, [before.Skill.ids], before.Skill.ids);
  await deleteExact(client, 'AuditLog', `DELETE FROM "AuditLog" WHERE id = ANY($1::text[]) RETURNING id`, [before.AuditLog.ids], before.AuditLog.ids);
  await deleteExact(client, 'Subscription', `DELETE FROM "Subscription" WHERE id = ANY($1::text[]) RETURNING id`, [before.Subscription.ids], before.Subscription.ids);
  await deleteExact(client, 'User', `DELETE FROM "User" WHERE id = ANY($1::text[]) RETURNING id`, [before.User.ids], before.User.ids);
  await deleteExact(client, 'Company', `DELETE FROM "Company" WHERE id = ANY($1::text[]) RETURNING id`, [before.Company.ids], before.Company.ids);

  const after = await snapshotDeleted(client, before);
  assert.deepEqual(after, Object.fromEntries(namedDependencies.map((name) => [name, 0])), '删除后白名单对象必须全部为 0');
  await assertNoRemainingTargetData(client, before);
  await assertNoUnhandledDependencies(client, before);
  return after;
}

async function apply(client: Client) {
  let transactionOpen = false;
  try {
    await beginCleanupTransaction(client);
    transactionOpen = true;
    const before = await snapshot(client, true);
    await assertNoUnhandledDependencies(client, before);
    const after = await deleteAndVerifyWithinTransaction(client, before);
    await client.query('COMMIT');
    transactionOpen = false;
    console.log(JSON.stringify({
      mode: 'apply',
      deleted: before,
      after,
      remainingTargetDataChecked: true,
      serializableTransaction: true,
    }, null, 2));
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

async function verifyRollback(client: Client) {
  let transactionOpen = false;
  try {
    await beginCleanupTransaction(client);
    transactionOpen = true;
    const before = await snapshot(client, true);
    await assertNoUnhandledDependencies(client, before);
    await deleteAndVerifyWithinTransaction(client, before);

    // This function intentionally contains no COMMIT path: a successful verification always rolls back.
    await client.query('ROLLBACK');
    transactionOpen = false;

    const afterRollback = await snapshot(client);
    await assertNoUnhandledDependencies(client, afterRollback);
    assert.deepEqual(afterRollback, before, '回滚后白名单对象的数量或精确 ID 与事务前不一致');
    console.log(JSON.stringify({
      mode: 'verify-rollback',
      endpoint: TEST_ENDPOINT,
      rollbackVerified: true,
      databaseRestored: true,
      serializableTransaction: true,
      before,
      afterRollback,
    }, null, 2));
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

async function snapshotDeleted(client: Client, before: Summary) {
  const rows = namedDependencies.map((name): [string, string, SqlValues] => [
    name,
    `SELECT COUNT(*)::int AS count FROM "${name}" WHERE id = ANY($1::text[])`,
    [before[name].ids],
  ]);
  const result: Record<string, number> = {};
  for (const [name, sql, values] of rows) result[name] = Number((await client.query<{ count: number }>(sql, values)).rows[0]?.count || 0);
  return result;
}

async function main() {
  const mode = parseMode(process.argv.slice(2));
  if (mode === 'apply' && process.env.CONFIRM_TEST_DEMO_CLEANUP !== APPLY_CONFIRMATION) {
    throw new Error(`--apply 还需要 CONFIRM_TEST_DEMO_CLEANUP=${APPLY_CONFIRMATION}`);
  }
  if (mode === 'verify-rollback' && process.env.CONFIRM_TEST_DEMO_CLEANUP_ROLLBACK !== ROLLBACK_CONFIRMATION) {
    throw new Error(`--verify-rollback 还需要 CONFIRM_TEST_DEMO_CLEANUP_ROLLBACK=${ROLLBACK_CONFIRMATION}`);
  }
  const url = databaseUrl();
  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    if (mode === 'dry-run') {
      const summary = await snapshot(client);
      await assertNoUnhandledDependencies(client, summary);
      console.log(JSON.stringify({
        mode: 'dry-run', endpoint: TEST_ENDPOINT, summary,
        unhandledDependenciesChecked: true,
        safeToApply: true,
        smsVerificationChallenge: '未查询、未删除：该表无 user/company 外键',
      }, null, 2));
      return;
    }
    if (mode === 'verify-rollback') {
      await verifyRollback(client);
      return;
    }
    await apply(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

main().catch((error: unknown) => {
  console.error('cleanup failed:', error);
  process.exitCode = 1;
});
