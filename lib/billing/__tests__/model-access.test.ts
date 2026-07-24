/**
 * Model-level access guard tests.
 * Pure logic tests against resolveCompanyModelAccess and canCompanyUseModel.
 * assertCompanyModelAccess (DB-backed) is tested via integration.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveCompanyModelAccess,
  canCompanyUseModel,
} from '../model-access';

describe('resolveCompanyModelAccess', () => {
  it('trial plan grants DEEPSEEK_ONLY', () => {
    const result = resolveCompanyModelAccess({
      companyId: 'test-trial',
      activePlanCode: 'trial',
    });
    expect(result.accessScope).toBe('DEEPSEEK_ONLY');
    expect(result.allowedModels).not.toBe('ALL');
  });

  it('pro active membership grants ALL_MODELS', () => {
    const result = resolveCompanyModelAccess({
      companyId: 'test-pro',
      activePlanCode: 'pro',
    });
    expect(result.accessScope).toBe('ALL_MODELS');
    expect(result.allowedModels).toBe('ALL');
  });

  it('enterprise active membership grants ALL_MODELS', () => {
    const result = resolveCompanyModelAccess({
      companyId: 'test-ent',
      activePlanCode: 'enterprise',
    });
    expect(result.accessScope).toBe('ALL_MODELS');
  });

  it('unknown plan falls back to DEEPSEEK_ONLY', () => {
    const result = resolveCompanyModelAccess({
      companyId: 'test-unknown',
      activePlanCode: null,
    });
    expect(result.accessScope).toBe('DEEPSEEK_ONLY');
  });

  it('super agent self company unlocks all models permanently', () => {
    const result = resolveCompanyModelAccess({
      companyId: 'test-sa',
      activePlanCode: 'trial',
      isSuperAgentSelfCompany: true,
    });
    expect(result.accessScope).toBe('ALL_MODELS');
    expect(result.isPermanent).toBe(true);
    expect(result.source).toBe('SUPER_AGENT_SELF_COMPANY');
  });

  it('permanent entitlement unlocks all models', () => {
    const result = resolveCompanyModelAccess({
      companyId: 'test-perm',
      activePlanCode: 'trial',
      permanentEntitlements: [
        { type: 'ALL_MODELS_PERMANENT', effectiveAt: new Date().toISOString(), revokedAt: null, source: 'ADMIN_GRANT' },
      ],
    });
    expect(result.accessScope).toBe('ALL_MODELS');
    expect(result.isPermanent).toBe(true);
  });
});

describe('canCompanyUseModel', () => {
  it('trial allows DeepSeek models', () => {
    const access = resolveCompanyModelAccess({ companyId: 't', activePlanCode: 'trial' });
    expect(canCompanyUseModel(access, 'deepseek-v4-flash')).toBe(true);
  });

  it('trial denies GPT models', () => {
    const access = resolveCompanyModelAccess({ companyId: 't', activePlanCode: 'trial' });
    expect(canCompanyUseModel(access, 'gpt-54')).toBe(false);
  });

  it('trial denies Gemini models', () => {
    const access = resolveCompanyModelAccess({ companyId: 't', activePlanCode: 'trial' });
    expect(canCompanyUseModel(access, 'gemini-3-flash-preview')).toBe(false);
  });

  it('trial denies GLM models', () => {
    const access = resolveCompanyModelAccess({ companyId: 't', activePlanCode: 'trial' });
    expect(canCompanyUseModel(access, 'glm-52')).toBe(false);
  });

  it('trial denies Claude models', () => {
    const access = resolveCompanyModelAccess({ companyId: 't', activePlanCode: 'trial' });
    expect(canCompanyUseModel(access, 'claude-sonnet-46')).toBe(false);
  });

  it('pro allows GPT', () => {
    const access = resolveCompanyModelAccess({ companyId: 'p', activePlanCode: 'pro' });
    expect(canCompanyUseModel(access, 'gpt-54')).toBe(true);
  });

  it('enterprise allows Claude', () => {
    const access = resolveCompanyModelAccess({ companyId: 'e', activePlanCode: 'enterprise' });
    expect(canCompanyUseModel(access, 'claude-opus-46')).toBe(true);
  });

  it('unknown model ID with ALL access returns true (catalog layer handles existence)', () => {
    // canCompanyUseModel only checks plan coverage; catalog-level
    // getEnabledModel rejects truly unknown IDs before this point.
    const access = resolveCompanyModelAccess({ companyId: 'p', activePlanCode: 'pro' });
    expect(canCompanyUseModel(access, 'nonexistent-model-xyz')).toBe(true);
  });

  it('super agent can use any model', () => {
    const access = resolveCompanyModelAccess({ companyId: 'sa', activePlanCode: 'trial', isSuperAgentSelfCompany: true });
    expect(canCompanyUseModel(access, 'gpt-54')).toBe(true);
  });

  it('monthly milestone 3 periods grants permanent ALL_MODELS', () => {
    const result = resolveCompanyModelAccess({
      companyId: 'm3',
      activePlanCode: null,
      paidMembershipPeriods: [
        { planCode: 'pro', billingCycle: 'monthly', periodStart: '2025-01-01', periodEnd: '2025-02-01', paymentStatus: 'paid', paymentCompletedAt: '2025-01-01', refundedAt: null, orderId: 'o1', billingPeriodId: 'b1' },
        { planCode: 'pro', billingCycle: 'monthly', periodStart: '2025-02-01', periodEnd: '2025-03-01', paymentStatus: 'paid', paymentCompletedAt: '2025-02-01', refundedAt: null, orderId: 'o2', billingPeriodId: 'b2' },
        { planCode: 'pro', billingCycle: 'monthly', periodStart: '2025-03-01', periodEnd: '2025-04-01', paymentStatus: 'paid', paymentCompletedAt: '2025-03-01', refundedAt: null, orderId: 'o3', billingPeriodId: 'b3' },
      ],
    });
    expect(result.accessScope).toBe('ALL_MODELS');
    expect(result.isPermanent).toBe(true);
    expect(result.source).toBe('MONTHLY_PURCHASE_MILESTONE');
  });

  it('refunded periods do not count toward milestone', () => {
    const result = resolveCompanyModelAccess({
      companyId: 'ref',
      activePlanCode: 'pro',
      paidMembershipPeriods: [
        { planCode: 'pro', billingCycle: 'monthly', periodStart: '2025-01-01', periodEnd: '2025-02-01', paymentStatus: 'paid', paymentCompletedAt: '2025-01-01', refundedAt: null, orderId: 'o1', billingPeriodId: 'b1' },
        { planCode: 'pro', billingCycle: 'monthly', periodStart: '2025-02-01', periodEnd: '2025-03-01', paymentStatus: 'refunded', paymentCompletedAt: '2025-02-01', refundedAt: '2025-02-15', orderId: 'o2', billingPeriodId: 'b2' },
        { planCode: 'pro', billingCycle: 'monthly', periodStart: '2025-03-01', periodEnd: '2025-04-01', paymentStatus: 'paid', paymentCompletedAt: '2025-03-01', refundedAt: null, orderId: 'o3', billingPeriodId: 'b3' },
      ],
    });
    // 2 valid months (o1, o3) + active pro membership = ALL_MODELS but non-permanent
    expect(result.accessScope).toBe('ALL_MODELS');
    expect(result.isPermanent).toBe(false);
  });
});
