import { loadEnvConfig } from '@next/env';
import { Pool } from 'pg';

const POOL_MAX = 5;
const CONNECTION_TIMEOUT_MS = 10_000;
const IDLE_TIMEOUT_MS = 30_000;

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

type Measurement = {
  phase: string;
  durationMs: number;
  ok: boolean;
  errorCode?: string;
};

function safeErrorCode(error: unknown) {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : 'UNKNOWN';
  }
  return 'UNKNOWN';
}

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

async function main() {
  const databaseUrl = getDirectDatabaseUrl();
  if (!databaseUrl) {
    process.exitCode = 1;
    return;
  }

  console.log('数据库连接模式：Direct');
  console.log('连接池地址：否');

  const pool = new Pool({
    connectionString: databaseUrl,
    max: POOL_MAX,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    keepAlive: true,
  });
  const measurements: Measurement[] = [];

  async function measure(phase: string, task: () => Promise<void>) {
    const startedAt = Date.now();
    try {
      await task();
      measurements.push({ phase, durationMs: Date.now() - startedAt, ok: true });
      return true;
    } catch (error) {
      measurements.push({ phase, durationMs: Date.now() - startedAt, ok: false, errorCode: safeErrorCode(error) });
      return false;
    }
  }

  try {
    for (let index = 0; index < 20; index += 1) {
      await measure(`select_one_${index + 1}`, async () => {
        await pool.query('SELECT 1');
      });
    }
    for (let index = 0; index < 10; index += 1) {
      await measure(`user_count_${index + 1}`, async () => {
        await pool.query('SELECT COUNT(*)::int AS count FROM "User"');
      });
    }
    for (let index = 0; index < 10; index += 1) {
      await measure(`audit_log_count_${index + 1}`, async () => {
        await pool.query('SELECT COUNT(*)::int AS count FROM "AuditLog"');
      });
    }
    for (let group = 0; group < 5; group += 1) {
      const startedAt = Date.now();
      const results = await Promise.all(
        Array.from({ length: POOL_MAX }, () => pool.query('SELECT 1').then(() => true).catch(() => false)),
      );
      const ok = results.every(Boolean);
      measurements.push({ phase: `concurrent_select_group_${group + 1}`, durationMs: Date.now() - startedAt, ok, ...(ok ? {} : { errorCode: 'QUERY_FAILED' }) });
    }
    for (let index = 0; index < 5; index += 1) {
      await measure(`read_only_transaction_${index + 1}`, async () => {
        const client = await pool.connect();
        let releaseError: Error | undefined;
        try {
          await client.query('BEGIN READ ONLY');
          await client.query('SELECT 1');
          await client.query('ROLLBACK');
        } catch (error) {
          releaseError = error instanceof Error ? error : new Error('transaction_failed');
          await client.query('ROLLBACK').catch(() => {});
          throw error;
        } finally {
          client.release(releaseError);
        }
      });
    }

    const durations = measurements.map((measurement) => measurement.durationMs);
    const failed = measurements.filter((measurement) => !measurement.ok);
    const summary = {
      stable: failed.length === 0 && pool.waitingCount === 0,
      successCount: measurements.length - failed.length,
      failureCount: failed.length,
      minDurationMs: Math.min(...durations),
      maxDurationMs: Math.max(...durations),
      averageDurationMs: Math.round(durations.reduce((total, duration) => total + duration, 0) / durations.length),
      pool: { totalCount: pool.totalCount, idleCount: pool.idleCount, waitingCount: pool.waitingCount },
      measurements,
    };
    console.log(JSON.stringify(summary));
    if (!summary.stable) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch(() => {
  console.log(JSON.stringify({ phase: 'stability_script', errorCode: 'STABILITY_SCRIPT_FAILED', timedOut: false }));
  process.exitCode = 1;
});
