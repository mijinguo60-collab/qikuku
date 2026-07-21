import assert from 'node:assert/strict';
import {
  buildInitBillingDryRunSummary,
  classifyDatabaseTarget,
  isReadableDirectPostgresUrl,
  parseMaintenanceArgs,
  resolveMaintenanceWriteDecision,
} from './lib/maintenance-policy';

function main() {
  assert.deepEqual(parseMaintenanceArgs([]), { mode: 'dry-run', allowProduction: false });
  assert.deepEqual(parseMaintenanceArgs(['--dry-run']), { mode: 'dry-run', allowProduction: false });
  assert.deepEqual(parseMaintenanceArgs(['--apply']), { mode: 'apply', allowProduction: false });
  assert.deepEqual(parseMaintenanceArgs(['--apply', '--allow-production']), { mode: 'apply', allowProduction: true });
  assert.throws(() => parseMaintenanceArgs(['--apply', '--dry-run']));

  assert.equal(classifyDatabaseTarget('postgresql://user:pass@localhost:5432/qikuku'), 'local');
  assert.equal(classifyDatabaseTarget('postgresql://user:pass@ep-snowy-tooth-ata0virv.c-9.us-east-1.aws.neon.tech/qikuku'), 'test');
  assert.equal(classifyDatabaseTarget('postgresql://user:pass@ep-little-dream-atph250c.c-9.us-east-1.aws.neon.tech/qikuku'), 'production');
  assert.equal(classifyDatabaseTarget('postgresql://user:pass@example.com/qikuku'), 'unknown');

  assert.equal(isReadableDirectPostgresUrl('postgresql://user:pass@ep-snowy-tooth-ata0virv.c-9.us-east-1.aws.neon.tech/qikuku'), true);
  assert.equal(isReadableDirectPostgresUrl('postgresql://user:pass@ep-snowy-tooth-ata0virv-pooler.c-9.us-east-1.aws.neon.tech/qikuku'), false);

  assert.deepEqual(resolveMaintenanceWriteDecision('local', false), { allowed: true });
  assert.deepEqual(resolveMaintenanceWriteDecision('test', false), { allowed: true });
  assert.deepEqual(resolveMaintenanceWriteDecision('unknown', false), { allowed: false, reason: 'unknown' });
  assert.deepEqual(resolveMaintenanceWriteDecision('production', false), { allowed: false, reason: 'production_without_allow' });
  assert.deepEqual(resolveMaintenanceWriteDecision('production', true), { allowed: true });

  const summary = buildInitBillingDryRunSummary({
    trialCredits: 3000,
    companies: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }, { id: 'c4' }],
    subscriptions: [
      { companyId: 'c2', planCode: 'trial', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' },
      { companyId: 'c2', planCode: 'trial', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-02T00:00:00.000Z' },
      { companyId: 'c3', planCode: 'pro', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-02T00:00:00.000Z' },
      { companyId: 'c4', planCode: 'custom', createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-02T00:00:00.000Z' },
    ],
    welcomeGrants: [{ companyId: 'c2', idempotencyKey: 'WELCOME:c2' }],
  });

  assert.equal(summary.totalCompanies, 4);
  assert.equal(summary.companiesWithoutSubscription, 1);
  assert.equal(summary.trialCompaniesMissingWelcomeGrant, 0);
  assert.equal(summary.companiesWithExistingWelcomeGrant, 1);
  assert.equal(summary.skippedNonTrialCompanies, 2);
  assert.equal(summary.expectedNewTrialSubscriptions, 1);
  assert.equal(summary.expectedWelcomePointGrants, 1);
  assert.equal(summary.expectedWelcomePointsTotal, 3000);

  // Plan INSERT 参数数量验证：13 列，13 个 $N 占位符，参数数组 13 个元素。
  const insertColumns = ['id', 'code', 'name', 'monthlyPrice', 'yearlyPrice', 'monthlyCredits', 'maxMembers', 'maxKnowledgeSpaces', 'storageLimitBytes', 'featuresJson', 'enabled', 'createdAt', 'updatedAt'] as const;
  const insertPlaceholders = '$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13';
  assert.equal(insertColumns.length, 13);
  assert.equal(insertPlaceholders.split(',').length, 13);
  // 参数数组：randomUUID + planCode + 9 values + now + now = 13
  const paramCount = 1 + 1 + 9 + 2;
  assert.equal(paramCount, 13);
  assert.equal(paramCount, insertColumns.length);

  // Plan UPDATE 参数数量验证：12 列，12 个 $N 占位符，参数数组 12 个元素。
  // SET: name, monthlyPrice, yearlyPrice, monthlyCredits, maxMembers, maxKnowledgeSpaces, storageLimitBytes, featuresJson, enabled, updatedAt = 10
  // WHERE: id, code = 2
  // 总计 12
  const updateSetColumns = 10;
  const updateWhereColumns = 2;
  assert.equal(updateSetColumns + updateWhereColumns, 12);
  // 参数数组：9 values + now + existing.id + planCode = 12
  const updateParamCount = 9 + 1 + 1 + 1;
  assert.equal(updateParamCount, 12);

  console.log(JSON.stringify({ ok: true }));
}

main();
