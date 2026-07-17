import { loadEnvConfig } from '@next/env';
import { Client } from 'pg';
import { maskEmail, serializeSanitizedAuditDetail } from '../lib/audit/sanitize';

const EXPECTED_TARGET_COUNT = 43;
const AUTHORIZED_REMAINING_COUNTS = new Set([43, 23, 3, 0]);
const BATCH_SIZE = 5;
const LOGIN_SUCCESS_ACTION = 'login_success';
const AUTHENTICATION_ACTIONS = new Set(['login_success', 'login_failed']);
const FULL_EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

function installSafeWarningHandler() {
  process.removeAllListeners('warning');
  process.on('warning', (warning) => {
    if (warning.message.startsWith("SECURITY WARNING: The SSL modes 'prefer', 'require', and 'verify-ca'")) {
      return;
    }
    console.error(JSON.stringify({ phase: 'runtime_warning', errorCode: 'RUNTIME_WARNING', timedOut: false }));
  });
}

installSafeWarningHandler();

type AuditRecord = {
  id: string;
  action: string;
  result: string | null;
  createdAt: Date;
};

type ScriptOptions = {
  mode: 'dry-run' | 'apply';
  auditId: string | null;
};

function parseOptions(args: string[]): ScriptOptions {
  const hasApply = args.includes('--apply');
  const hasDryRun = args.includes('--dry-run');
  const auditIdArgument = args.find((arg) => arg.startsWith('--audit-id='));
  const auditId = auditIdArgument ? auditIdArgument.slice('--audit-id='.length).trim() : null;

  if (hasApply && hasDryRun) {
    throw new Error('只能使用 --dry-run 或 --apply 其中之一');
  }

  if (args.some((arg) => arg !== '--apply' && arg !== '--dry-run' && arg !== auditIdArgument)) {
    throw new Error('不支持的参数');
  }

  if (auditId !== null && (!auditId || auditId.length > 100 || !/^[A-Za-z0-9_-]+$/.test(auditId))) {
    throw new Error('AuditLog ID 参数无效');
  }

  return { mode: hasApply ? 'apply' : 'dry-run', auditId };
}

function isJsonObject(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

function sanitizedAuthenticationResult(record: AuditRecord) {
  const result = record.result || '';
  if (isJsonObject(result)) {
    return serializeSanitizedAuditDetail(result) || JSON.stringify({ result: record.action === LOGIN_SUCCESS_ACTION ? 'success' : 'authentication_failed', provider: 'password' });
  }

  return JSON.stringify({
    maskedEmail: maskEmail(result),
    result: record.action === LOGIN_SUCCESS_ACTION ? 'success' : 'authentication_failed',
    provider: 'password',
  });
}

function containsFullEmail(result: string | null) {
  return typeof result === 'string' && FULL_EMAIL_PATTERN.test(result);
}

type Queryable = Pick<Client, 'query'>;

function getDirectDatabaseUrl() {
  loadEnvConfig(process.cwd());
  const databaseUrl = process.env.DATABASE_DIRECT_URL;
  if (!databaseUrl) {
    console.error('DATABASE_DIRECT_URL 未配置，已停止执行');
    return null;
  }

  try {
    if (new URL(databaseUrl).hostname.toLowerCase().includes('-pooler')) {
      console.error('DATABASE_DIRECT_URL 不是 Direct connection，已停止执行');
      return null;
    }
  } catch {
    console.error(JSON.stringify({ phase: 'validate_direct_connection', errorCode: 'INVALID_DATABASE_DIRECT_URL', timedOut: false }));
    return null;
  }

  return databaseUrl;
}

async function findCandidates(client: Queryable) {
  const rows = await client.query<AuditRecord>(
    `SELECT id,action,result,"createdAt" FROM "AuditLog" WHERE action=$1 ORDER BY "createdAt" ASC,id ASC`,
    [LOGIN_SUCCESS_ACTION],
  );
  return rows.rows.filter((record) => containsFullEmail(record.result));
}

async function findCandidateByAuditId(client: Queryable, auditId: string) {
  const rows = await client.query<AuditRecord>(
    `SELECT id,action,result,"createdAt" FROM "AuditLog" WHERE id=$1`,
    [auditId],
  );
  const record = rows.rows[0];
  if (!record || !AUTHENTICATION_ACTIONS.has(record.action) || !containsFullEmail(record.result)) {
    return [];
  }
  return [record];
}

async function main() {
  const { mode, auditId } = parseOptions(process.argv.slice(2));
  const databaseUrl = getDirectDatabaseUrl();
  if (!databaseUrl) {
    process.exitCode = 1;
    return;
  }

  console.log('数据库连接模式：Direct');
  console.log('连接池地址：否');

  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 15_000,
    keepAlive: true,
  });
  let completedBatches = 0;
  let updatedCount = 0;
  let failedBatch: number | null = null;
  try {
    await client.connect();
    const candidates = auditId ? await findCandidateByAuditId(client, auditId) : await findCandidates(client);
    const summary = {
      mode,
      scope: auditId ? 'audit-id' : 'login-success-history',
      expectedTargetCount: EXPECTED_TARGET_COUNT,
      matchedCount: candidates.length,
      actions: Array.from(new Set(candidates.map((candidate) => candidate.action))),
      fieldsToModify: ['result'],
      earliestCreatedAt: candidates[0]?.createdAt.toISOString() || null,
      latestCreatedAt: candidates.at(-1)?.createdAt.toISOString() || null,
    };

    if (mode === 'dry-run') {
      console.log(JSON.stringify({ ...summary, wouldModify: candidates.length }));
      return;
    }

    if (auditId && candidates.length !== 1) {
      throw new Error('精确 AuditLog ID 未命中唯一敏感认证记录，已拒绝执行');
    }

    if (!auditId && !AUTHORIZED_REMAINING_COUNTS.has(candidates.length)) {
      throw new Error('匹配记录数量与授权范围不一致，已拒绝执行');
    }

    if (candidates.length === 0) {
      console.log(JSON.stringify({ ...summary, updatedCount: 0, completedBatches: 0, failedBatch: null, remainingCount: 0 }));
      return;
    }

    for (let offset = 0; offset < candidates.length; offset += BATCH_SIZE) {
      const batch = candidates.slice(offset, offset + BATCH_SIZE);
      try {
        await client.query('BEGIN');
        let batchUpdatedCount = 0;
        for (const record of batch) {
          const nextResult = sanitizedAuthenticationResult(record);
          const update = await client.query(
            `UPDATE "AuditLog" SET result=$1 WHERE id=$2 AND action=$3 AND result=$4`,
            [nextResult, record.id, record.action, record.result],
          );
          if (update.rowCount !== 1) {
            throw new Error('审计记录已变化，已停止本批处理');
          }
          batchUpdatedCount += 1;
        }
        await client.query('COMMIT');
        updatedCount += batchUpdatedCount;
        const verification = await client.query<AuditRecord>(
          `SELECT id,action,result,"createdAt" FROM "AuditLog" WHERE id = ANY($1::text[])`,
          [batch.map((record) => record.id)],
        );
        if (verification.rows.length !== batch.length || verification.rows.some((record) => record.action !== batch.find((candidate) => candidate.id === record.id)?.action || containsFullEmail(record.result))) {
          throw new Error('已提交批次验证失败');
        }
        completedBatches += 1;
      } catch {
        await client.query('ROLLBACK').catch(() => {});
        failedBatch = completedBatches + 1;
        throw new Error('历史认证审计净化批处理失败');
      }
    }

    const remaining = auditId ? await findCandidateByAuditId(client, auditId) : await findCandidates(client);
    if (remaining.length !== 0) {
      throw new Error('净化后仍存在未脱敏认证审计');
    }

    console.log(JSON.stringify({ ...summary, updatedCount, completedBatches, failedBatch, remainingCount: 0 }));
  } catch {
    console.error(JSON.stringify({
      success: false,
      completedBatches,
      updatedCount,
      failedBatch,
      error: '历史认证审计净化失败',
    }));
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch(() => {
  console.error(JSON.stringify({ success: false, error: '历史认证审计净化失败' }));
  process.exitCode = 1;
});
