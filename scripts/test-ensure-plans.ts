import assert from 'node:assert/strict';
import { PLAN_CATALOG } from '../lib/billing/pricing';
import { parseEnsurePlansArguments, reconcilePlans, type ExistingPlan } from './ensure-plans';

function asExistingPlan(plan: (typeof PLAN_CATALOG)[number]): ExistingPlan {
  return {
    id: `plan-${plan.code}`,
    code: plan.code,
    name: plan.name,
    monthlyPrice: plan.monthlyPrice,
    yearlyPrice: plan.yearlyPrice,
    monthlyCredits: plan.monthlyCredits,
    maxMembers: plan.maxMembers,
    maxKnowledgeSpaces: plan.maxKnowledgeSpaces,
    storageLimitBytes: plan.storageLimitBytes,
    featuresJson: JSON.stringify(plan.features),
    enabled: true,
  };
}

function countByKind(changes: ReturnType<typeof reconcilePlans>, kind: 'create' | 'update' | 'unchanged') {
  return changes.filter((change) => change.kind === kind).length;
}

function main() {
  assert.equal(PLAN_CATALOG.length, 5, 'the formal plan catalog must contain five plans');
  assert.ok(PLAN_CATALOG.some((plan) => plan.code === 'trial'), 'the formal plan catalog must include trial');

  assert.deepEqual(parseEnsurePlansArguments([]), { mode: 'dry-run', allowProduction: false, writeAllowed: true });
  assert.deepEqual(parseEnsurePlansArguments(['--apply']), { mode: 'apply', allowProduction: false, writeAllowed: false });
  assert.deepEqual(parseEnsurePlansArguments(['--apply', '--allow-production']), { mode: 'apply', allowProduction: true, writeAllowed: true });

  const firstRun = reconcilePlans([]);
  assert.equal(countByKind(firstRun, 'create'), 5, 'an empty Plan table needs five creates');
  assert.equal(countByKind(firstRun, 'update'), 0);
  assert.equal(countByKind(firstRun, 'unchanged'), 0);

  const secondRun = reconcilePlans(PLAN_CATALOG.map(asExistingPlan));
  assert.equal(countByKind(secondRun, 'create'), 0, 'an initialized catalog must not duplicate plans');
  assert.equal(countByKind(secondRun, 'update'), 0, 'identical plans must not receive unconditional updates');
  assert.equal(countByKind(secondRun, 'unchanged'), 5);

  const changed = PLAN_CATALOG.map(asExistingPlan);
  changed[0] = { ...changed[0], name: `${changed[0].name}-outdated` };
  const repairRun = reconcilePlans(changed);
  assert.equal(countByKind(repairRun, 'create'), 0);
  assert.equal(countByKind(repairRun, 'update'), 1, 'only changed plan fields may be updated');
  assert.equal(countByKind(repairRun, 'unchanged'), 4);

  console.log('ensure-plans safety and idempotency tests passed');
}

main();
