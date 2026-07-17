'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

type CompanyDetailResponse = {
  company: {
    id: string;
    name: string;
    industry: string | null;
    description: string | null;
    plan: string | null;
    createdAt: string | null;
  };
  owners: Array<{
    membershipId: string;
    userId: string;
    name: string;
    maskedPhone: string;
    maskedEmail: string;
    role: string;
    membershipStatus: string;
    createdAt: string | null;
  }>;
  memberships: Array<{
    membershipId: string;
    userId: string;
    userName: string;
    maskedPhone: string;
    maskedEmail: string;
    role: string;
    status: string;
    createdAt: string | null;
    updatedAt: string | null;
    lastLoginAt: string | null;
  }>;
  membershipStats: {
    totalMemberCount: number | null;
    activeMemberCount: number | null;
    ownerCount: number | null;
  };
  subscription: {
    id: string;
    status: string;
    planId: string;
    planCode: string;
    planName: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    createdAt: string | null;
  } | null;
  credits: {
    account: {
      id: string;
      totalBalance: number | null;
      packageBalance: number | null;
      purchasedBalance: number | null;
      bonusBalance: number | null;
      updatedAt: string | null;
    } | null;
    currentMonthGranted: number | null;
    currentMonthUsed: number | null;
    ledgerCount: number | null;
  };
  resources: {
    knowledgeSpaceCount: number | null;
    documentCount: number | null;
    skillCount: number | null;
    totalDocumentSize: number | null;
    currentMonthUploadedDocumentCount: number | null;
  };
  usage: {
    aiCallCount: number | null;
    successfulAiCallCount: number | null;
    failedAiCallCount: number | null;
    creditsUsed: number | null;
    imageGenerationCount: number | null;
    averageLatencyMs: number | null;
  };
  orders: {
    rechargeOrderCount: number | null;
    paymentOrderCount: number | null;
    paidOrderCount: number | null;
    currentMonthPaidAmount: number | null;
    currentMonthRechargeAmount: number | null;
  };
};

type ErrorState = 'badRequest' | 'forbidden' | 'notFound' | 'unauthenticated' | 'unknown' | null;

type ModalKind = 'revoke-company-sessions' | null;

type RevokeCompanySessionsOperation = {
  companyId: string;
  companyName: string;
  totalMemberCount: number | null;
  activeMemberCount: number | null;
  ownerCount: number | null;
};

type RevokeCompanySessionsResponse = {
  success?: boolean;
  changed?: boolean;
  revokedSessionCount?: number;
  error?: string;
};

const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  trialing: '试用中',
  active: '生效中',
  past_due: '已逾期',
  canceled: '已取消',
  expired: '已过期',
};

const MEMBERSHIP_ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: '管理员',
  staff: '员工',
  member: '成员',
};

const MEMBERSHIP_STATUS_LABELS: Record<string, string> = {
  active: '有效',
  inactive: '已停用',
  disabled: '已停用',
  pending: '待加入',
};

const RETURN_PAGE_SIZES = [20, 50, 100] as const;
const RETURN_SORT_FIELDS = ['createdAt', 'name'] as const;
const COMPANY_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const REVOKE_CONFIRMATION_TEXT = '退出全部企业会话';

type ReturnPageSize = (typeof RETURN_PAGE_SIZES)[number];
type ReturnSortBy = (typeof RETURN_SORT_FIELDS)[number];
type ReturnSortOrder = 'asc' | 'desc';

function formatDate(value: string | null | undefined, emptyLabel = '—') {
  if (!value) return emptyLabel;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return emptyLabel;

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function isSafeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatNumber(value: number | null | undefined, emptyLabel = '暂无可靠数据') {
  if (!isSafeNumber(value)) return emptyLabel;
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value);
}

function formatCredits(value: number | null | undefined) {
  return isSafeNumber(value) ? `${formatNumber(value)} 积分` : '暂无可靠数据';
}

function formatCount(value: number | null | undefined) {
  return isSafeNumber(value) ? `${formatNumber(value)} 次` : '暂无可靠数据';
}

function formatLatency(value: number | null | undefined) {
  return isSafeNumber(value) ? `${formatNumber(value)} ms` : '暂无可靠数据';
}

function formatFileSize(value: number | null | undefined) {
  if (!isSafeNumber(value) || value < 0) return '暂无可靠数据';
  if (value < 1024) return `${formatNumber(value)} B`;

  const units = ['KB', 'MB', 'GB'];
  let size = value / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(size)} ${units[unitIndex]}`;
}

function formatAmountCents(value: number | null | undefined) {
  if (!isSafeNumber(value)) return '暂无可靠数据';
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

function getSubscriptionStatusLabel(value: string) {
  return SUBSCRIPTION_STATUS_LABELS[value] || value || '—';
}

function getMembershipRoleLabel(value: string) {
  return MEMBERSHIP_ROLE_LABELS[value] || value || '—';
}

function getMembershipStatusLabel(value: string) {
  return MEMBERSHIP_STATUS_LABELS[value] || value || '—';
}

function isValidCompanyId(value: string) {
  return value.length > 0 && value.length <= 100 && COMPANY_ID_PATTERN.test(value);
}

function getSafeApiError(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback;
  const message = value.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 200);
  return message || fallback;
}

function getReturnPage(value: string | null) {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 ? page : null;
}

function getReturnPageSize(value: string | null): ReturnPageSize | null {
  const pageSize = Number(value);
  return RETURN_PAGE_SIZES.includes(pageSize as ReturnPageSize) ? (pageSize as ReturnPageSize) : null;
}

function getReturnSearch(value: string | null) {
  if (!value) return null;
  return value.slice(0, 100);
}

function getReturnSortBy(value: string | null): ReturnSortBy | null {
  return RETURN_SORT_FIELDS.includes(value as ReturnSortBy) ? (value as ReturnSortBy) : null;
}

function getReturnSortOrder(value: string | null): ReturnSortOrder | null {
  return value === 'asc' || value === 'desc' ? value : null;
}

function getReturnHref(searchParams: URLSearchParams) {
  const params = new URLSearchParams();
  const page = getReturnPage(searchParams.get('returnPage'));
  const pageSize = getReturnPageSize(searchParams.get('returnPageSize'));
  const search = getReturnSearch(searchParams.get('returnSearch'));
  const sortBy = getReturnSortBy(searchParams.get('returnSortBy'));
  const sortOrder = getReturnSortOrder(searchParams.get('returnSortOrder'));

  if (page !== null) params.set('page', String(page));
  if (pageSize !== null) params.set('pageSize', String(pageSize));
  if (search !== null) params.set('search', search);
  if (sortBy !== null) params.set('sortBy', sortBy);
  if (sortOrder !== null) params.set('sortOrder', sortOrder);

  const query = params.toString();
  return query ? `/platform-admin/companies?${query}` : '/platform-admin/companies';
}

function errorMessage(error: ErrorState) {
  if (error === 'badRequest') return '企业 ID 格式错误';
  if (error === 'forbidden') return '无平台运营权限';
  if (error === 'notFound') return '企业不存在';
  if (error === 'unauthenticated') return '未登录';
  return '企业详情加载失败，请稍后重试';
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/30 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-base font-medium text-slate-100">{value}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-t border-white/10 py-3 first:border-t-0 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-slate-200">{value}</dd>
    </div>
  );
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5 rounded-2xl border border-white/10 bg-white/10 p-5 shadow-sm shadow-slate-950/20">
      <div className="mb-4">
        <h3 className="font-semibold text-slate-100">{title}</h3>
        {description ? <p className="mt-1 text-sm text-slate-400">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function isCompanyDetailResponse(value: unknown): value is CompanyDetailResponse {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { company?: unknown; memberships?: unknown; owners?: unknown };
  return (
    Boolean(candidate.company) &&
    typeof candidate.company === 'object' &&
    Array.isArray(candidate.memberships) &&
    Array.isArray(candidate.owners)
  );
}

export default function CompanyDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const companyId = typeof params.id === 'string' ? params.id : '';
  const returnHref = getReturnHref(new URLSearchParams(searchParams.toString()));
  const [data, setData] = useState<CompanyDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorState>(null);
  const [modalKind, setModalKind] = useState<ModalKind>(null);
  const [revokeOperation, setRevokeOperation] = useState<RevokeCompanySessionsOperation | null>(null);
  const [reason, setReason] = useState('');
  const [confirmationText, setConfirmationText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [operationError, setOperationError] = useState('');
  const [operationSuccess, setOperationSuccess] = useState('');
  const requestSequence = useRef(0);
  const operationSequence = useRef(0);
  const operationControllerRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const requestId = ++requestSequence.current;
      setLoading(true);
      setError(null);

      if (!companyId) {
        if (requestId === requestSequence.current) {
          setError('badRequest');
          setLoading(false);
        }
        return;
      }

      try {
        const response = await fetch(
          `/api/platform-admin/companies/${encodeURIComponent(companyId)}`,
          { signal },
        );
        const payload = (await response.json().catch(() => null)) as unknown;

        if (response.status === 401) {
          if (requestId === requestSequence.current) {
            setData(null);
            setError('unauthenticated');
            window.location.assign('/auth/login');
          }
          return;
        }

        if (response.status === 400 || response.status === 403 || response.status === 404) {
          if (requestId === requestSequence.current) {
            setData(null);
            setError(response.status === 400 ? 'badRequest' : response.status === 403 ? 'forbidden' : 'notFound');
          }
          return;
        }

        if (!response.ok || !isCompanyDetailResponse(payload)) {
          throw new Error('company-detail-request-failed');
        }

        if (requestId === requestSequence.current) {
          setData(payload);
        }
      } catch (requestError: unknown) {
        if (signal?.aborted || (requestError instanceof DOMException && requestError.name === 'AbortError')) {
          return;
        }
        if (requestId === requestSequence.current) {
          setError('unknown');
        }
      } finally {
        if (requestId === requestSequence.current && !signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [companyId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);

    return () => {
      controller.abort();
    };
  }, [load]);

  useEffect(() => () => operationControllerRef.current?.abort(), []);

  useEffect(() => {
    operationSequence.current += 1;
    operationControllerRef.current?.abort();
    operationControllerRef.current = null;
    setModalKind(null);
    setRevokeOperation(null);
    setReason('');
    setConfirmationText('');
    setOperationError('');
    setOperationSuccess('');
    setSubmitting(false);
  }, [companyId]);

  const visibleData = data?.company.id === companyId ? data : null;

  const closeRevokeOperation = useCallback(() => {
    operationSequence.current += 1;
    operationControllerRef.current?.abort();
    operationControllerRef.current = null;
    setModalKind(null);
    setRevokeOperation(null);
    setReason('');
    setConfirmationText('');
    setOperationError('');
    setSubmitting(false);
  }, []);

  const openRevokeOperation = () => {
    if (!visibleData || error || !isValidCompanyId(visibleData.company.id) || modalKind || submitting) return;
    operationControllerRef.current?.abort();
    operationControllerRef.current = null;
    setOperationSuccess('');
    setReason('');
    setConfirmationText('');
    setOperationError('');
    setRevokeOperation({
      companyId: visibleData.company.id,
      companyName: visibleData.company.name || '未命名企业',
      totalMemberCount: visibleData.membershipStats.totalMemberCount,
      activeMemberCount: visibleData.membershipStats.activeMemberCount,
      ownerCount: visibleData.membershipStats.ownerCount,
    });
    setModalKind('revoke-company-sessions');
  };

  const submitRevokeOperation = async () => {
    if (!revokeOperation || submitting || revokeOperation.companyId !== companyId) return;
    const trimmedReason = reason.trim();
    if (
      trimmedReason.length < 2 ||
      trimmedReason.length > 200 ||
      confirmationText.trim() !== REVOKE_CONFIRMATION_TEXT
    ) {
      return;
    }

    const requestId = ++operationSequence.current;
    const controller = new AbortController();
    operationControllerRef.current = controller;
    setSubmitting(true);
    setOperationError('');

    try {
      const response = await fetch(
        `/api/platform-admin/companies/${encodeURIComponent(revokeOperation.companyId)}/sessions`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: trimmedReason }),
          signal: controller.signal,
        },
      );
      const payload = (await response.json().catch(() => null)) as RevokeCompanySessionsResponse | null;

      if (requestId !== operationSequence.current) return;

      if (response.status === 401) {
        window.location.assign('/auth/login');
        return;
      }
      if (response.status === 403) {
        setOperationError('无平台运营权限');
        return;
      }
      if (response.status === 404) {
        setOperationError('企业不存在或已被移除');
        return;
      }
      if (response.status === 400) {
        setOperationError(getSafeApiError(payload?.error, '企业会话退出失败，请检查输入后重试'));
        return;
      }
      if (!response.ok || !payload?.success) {
        setOperationError('企业会话退出失败，请稍后重试');
        return;
      }

      const revokedSessionCount = typeof payload.revokedSessionCount === 'number' && payload.revokedSessionCount > 0
        ? ` 共撤销 ${formatNumber(payload.revokedSessionCount)} 个企业会话。`
        : '';
      setOperationSuccess(
        payload.changed === false
          ? '该企业当前没有需要撤销的会话'
          : `已强制退出该企业的全部当前会话。${revokedSessionCount}`,
      );
      operationControllerRef.current = null;
      setModalKind(null);
      setRevokeOperation(null);
      setReason('');
      setConfirmationText('');
      setOperationError('');
      setSubmitting(false);
      void load();
    } catch (requestError: unknown) {
      if (controller.signal.aborted || (requestError instanceof DOMException && requestError.name === 'AbortError')) {
        return;
      }
      if (requestId === operationSequence.current) {
        setOperationError('企业会话退出失败，请稍后重试');
      }
    } finally {
      if (requestId === operationSequence.current && !controller.signal.aborted) {
        setSubmitting(false);
        operationControllerRef.current = null;
      }
    }
  };

  useEffect(() => {
    if (!modalKind) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRevokeOperation();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeRevokeOperation, modalKind]);

  if (error && !visibleData) {
    const message = errorMessage(error);
    return (
      <section className="max-w-2xl rounded-2xl border border-white/10 bg-white/10 p-6">
        <p className="text-xs font-medium text-sky-200">平台后台 · 只读</p>
        <h2 className="mt-2 text-2xl font-bold text-slate-100">{message}</h2>
        <p className="mt-3 text-sm text-slate-400">
          {error === 'notFound'
            ? '请确认企业 ID 是否正确。'
            : error === 'forbidden'
              ? '此页面只对平台超级管理员开放。'
              : '请稍后重试，或返回企业列表继续查看。'}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15" href={returnHref}>
            返回企业列表
          </Link>
          {error !== 'forbidden' && error !== 'unauthenticated' ? (
            <button
              className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/10"
              onClick={() => void load()}
            >
              重新加载
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  if (!visibleData) {
    return (
      <section className="rounded-2xl border border-white/10 bg-white/10 p-8 text-sm text-slate-400">
        正在加载真实企业详情…
      </section>
    );
  }

  const { company, owners, memberships, membershipStats, subscription, credits, resources, usage, orders } = visibleData;
  const successRate =
    isSafeNumber(usage.aiCallCount) &&
    isSafeNumber(usage.successfulAiCallCount) &&
    usage.aiCallCount > 0
      ? `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(
          (usage.successfulAiCallCount / usage.aiCallCount) * 100,
        )}%`
      : null;
  const trimmedReasonLength = reason.trim().length;
  const canSubmitRevokeOperation = Boolean(
    modalKind === 'revoke-company-sessions' &&
      revokeOperation &&
      revokeOperation.companyId === companyId &&
      !submitting &&
      trimmedReasonLength >= 2 &&
      trimmedReasonLength <= 200 &&
      confirmationText.trim() === REVOKE_CONFIRMATION_TEXT,
  );

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link className="text-sm text-slate-400 transition hover:text-slate-200" href={returnHref}>
            返回企业列表
          </Link>
          <p className="mt-4 text-xs font-medium text-sky-200">真实数据 · 只读企业详情</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-100">企业详情</h2>
          <p className="mt-2 text-sm text-slate-300">{company.name || '未命名企业'}</p>
          <p className="mt-1 max-w-2xl break-all text-xs text-slate-500">企业 ID：{company.id}</p>
        </div>
        <button
          className="rounded-lg bg-white/10 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/15 disabled:opacity-50"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? '正在刷新…' : '刷新'}
        </button>
      </div>

      {error ? (
        <div className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">
          <p>{errorMessage(error)}</p>
          <button className="mt-3 underline underline-offset-4" onClick={() => void load()}>
            重新加载
          </button>
        </div>
      ) : null}

      {operationSuccess ? (
        <div className="mt-5 rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-4 text-sm text-emerald-100">
          {operationSuccess}
        </div>
      ) : null}

      <SectionCard title="基本资料" description="仅展示当前企业模型中可安全读取的字段。">
        <dl>
          <DetailRow label="企业名称" value={company.name || '未命名企业'} />
          <DetailRow label="企业 ID" value={company.id} />
          <DetailRow label="所属行业" value={company.industry || '—'} />
          <DetailRow label="企业简介" value={company.description || '—'} />
          <DetailRow label="当前 plan 字段" value={company.plan || '—'} />
          <DetailRow label="创建时间" value={formatDate(company.createdAt)} />
        </dl>
      </SectionCard>

      <SectionCard title="Owner" description="展示该企业全部有效 Owner Membership。">
        {owners.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {owners.map((owner) => (
              <article className="rounded-xl border border-white/10 bg-slate-950/30 p-4" key={owner.membershipId}>
                <p className="font-medium text-slate-100">{owner.name || '未设置姓名'}</p>
                <p className="mt-1 break-all text-xs text-slate-500">用户 ID：{owner.userId}</p>
                <dl className="mt-3 space-y-2 text-sm text-slate-300">
                  <div className="flex justify-between gap-4"><dt>手机号</dt><dd>{owner.maskedPhone || '未绑定'}</dd></div>
                  <div className="flex justify-between gap-4"><dt>邮箱</dt><dd>{owner.maskedEmail || '未绑定'}</dd></div>
                  <div className="flex justify-between gap-4"><dt>企业角色</dt><dd>{getMembershipRoleLabel(owner.role)}</dd></div>
                  <div className="flex justify-between gap-4"><dt>Membership 状态</dt><dd>{getMembershipStatusLabel(owner.membershipStatus)}</dd></div>
                  <div className="flex justify-between gap-4"><dt>加入时间</dt><dd>{formatDate(owner.createdAt)}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">该企业当前没有有效 Owner</p>
        )}
      </SectionCard>

      <SectionCard title="成员" description="只读展示企业成员及其 Membership 状态。">
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCard label="成员总数" value={formatNumber(membershipStats.totalMemberCount)} />
          <MetricCard label="有效成员数" value={formatNumber(membershipStats.activeMemberCount)} />
          <MetricCard label="有效 Owner 数" value={formatNumber(membershipStats.ownerCount)} />
        </div>
        {memberships.length ? (
          <div className="mt-5 overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[1120px] text-left text-sm">
              <thead className="bg-slate-950/40 text-slate-400">
                <tr>
                  {['用户', '手机号', '邮箱', '企业角色', 'Membership 状态', '加入时间', '更新时间', '最近登录'].map((heading) => (
                    <th className="p-3 font-medium" key={heading}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {memberships.map((membership) => (
                  <tr className="border-t border-white/10 align-top" key={membership.membershipId}>
                    <td className="p-3"><p className="font-medium text-slate-100">{membership.userName || '未设置姓名'}</p><p className="mt-1 max-w-52 break-all text-xs text-slate-500">{membership.userId}</p></td>
                    <td className="p-3 text-slate-300">{membership.maskedPhone || '未绑定'}</td>
                    <td className="p-3 text-slate-300">{membership.maskedEmail || '未绑定'}</td>
                    <td className="p-3 text-slate-300">{getMembershipRoleLabel(membership.role)}</td>
                    <td className="p-3 text-slate-300">{getMembershipStatusLabel(membership.status)}</td>
                    <td className="whitespace-nowrap p-3 text-slate-300">{formatDate(membership.createdAt)}</td>
                    <td className="whitespace-nowrap p-3 text-slate-300">{formatDate(membership.updatedAt)}</td>
                    <td className="whitespace-nowrap p-3 text-slate-300">{formatDate(membership.lastLoginAt, '从未登录')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-400">该企业当前没有成员。</p>
        )}
      </SectionCard>

      <SectionCard title="订阅" description="仅展示当前有效订阅，不提供套餐修改操作。">
        {subscription ? (
          <dl>
            <DetailRow label="套餐名称" value={subscription.planName || '—'} />
            <DetailRow label="套餐代码" value={subscription.planCode || '—'} />
            <DetailRow label="订阅状态" value={getSubscriptionStatusLabel(subscription.status)} />
            <DetailRow label="套餐 ID" value={subscription.planId || '—'} />
            <DetailRow label="订阅 ID" value={subscription.id || '—'} />
            <DetailRow label="当前周期开始时间" value={formatDate(subscription.currentPeriodStart)} />
            <DetailRow label="当前周期结束时间" value={formatDate(subscription.currentPeriodEnd)} />
            <DetailRow label="创建时间" value={formatDate(subscription.createdAt)} />
          </dl>
        ) : (
          <p className="text-sm text-slate-400">该企业当前没有有效订阅</p>
        )}
      </SectionCard>

      <SectionCard title="积分" description="仅展示积分账户和本月汇总，不展示积分流水明细。">
        {credits.account ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="总余额" value={formatCredits(credits.account.totalBalance)} />
              <MetricCard label="发放积分余额" value={formatCredits(credits.account.packageBalance)} />
              <MetricCard label="购买积分余额" value={formatCredits(credits.account.purchasedBalance)} />
              <MetricCard label="更新时间" value={formatDate(credits.account.updatedAt)} />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <MetricCard label="本月发放积分" value={formatCredits(credits.currentMonthGranted)} />
              <MetricCard label="本月消耗积分" value={formatCredits(credits.currentMonthUsed)} />
              <MetricCard label="积分流水数量" value={formatNumber(credits.ledgerCount)} />
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-400">该企业尚未创建积分账户</p>
        )}
      </SectionCard>

      <SectionCard title="企业资源" description="仅汇总资源数量和文件大小，不读取企业内容。">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="知识空间数量" value={formatNumber(resources.knowledgeSpaceCount)} />
          <MetricCard label="文件数量" value={formatNumber(resources.documentCount)} />
          <MetricCard label="Skill 数量" value={formatNumber(resources.skillCount)} />
          <MetricCard label="文件总大小" value={formatFileSize(resources.totalDocumentSize)} />
          <MetricCard label="本月上传文件数量" value={formatNumber(resources.currentMonthUploadedDocumentCount)} />
        </div>
      </SectionCard>

      <SectionCard title="AI 使用" description="当前自然月的调用元数据汇总，不展示 Prompt、输入或模型回答。">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="AI 调用总数" value={formatCount(usage.aiCallCount)} />
          <MetricCard label="成功调用数" value={formatCount(usage.successfulAiCallCount)} />
          <MetricCard label="失败调用数" value={formatCount(usage.failedAiCallCount)} />
          <MetricCard label="本月积分消耗" value={formatCredits(usage.creditsUsed)} />
          <MetricCard label="图片生成数" value={formatCount(usage.imageGenerationCount)} />
          <MetricCard label="平均响应延迟" value={formatLatency(usage.averageLatencyMs)} />
          {successRate ? <MetricCard label="调用成功率" value={successRate} /> : null}
        </div>
      </SectionCard>

      <SectionCard title="订单汇总" description="基于已支付订单汇总，不展示外部交易号或支付回调。">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="充值订单数量" value={formatNumber(orders.rechargeOrderCount)} />
          <MetricCard label="支付订单数量" value={formatNumber(orders.paymentOrderCount)} />
          <MetricCard label="已支付订单数量" value={formatNumber(orders.paidOrderCount)} />
          <MetricCard label="本月已支付金额" value={formatAmountCents(orders.currentMonthPaidAmount)} />
          <MetricCard label="本月充值金额" value={formatAmountCents(orders.currentMonthRechargeAmount)} />
        </div>
      </SectionCard>

      <SectionCard
        title="安全操作"
        description="管理该企业当前登录会话。该操作不会禁用用户、企业或成员关系。"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4">
          <div className="max-w-3xl">
            <p className="text-sm font-medium text-slate-100">强制退出全部企业会话</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              只撤销当前 activeCompanyId 为该企业的会话，不影响用户在其他企业的登录状态。
            </p>
          </div>
          <button
            className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-sm font-medium text-amber-100 transition hover:bg-amber-300/15 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={loading || Boolean(error) || submitting || Boolean(modalKind) || !isValidCompanyId(company.id)}
            onClick={openRevokeOperation}
            type="button"
          >
            {submitting ? '正在退出…' : '强制退出全部企业会话'}
          </button>
        </div>
      </SectionCard>

      {modalKind === 'revoke-company-sessions' && revokeOperation ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
          onClick={closeRevokeOperation}
          role="dialog"
        >
          <div
            className="max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-amber-200">企业会话安全操作</p>
                <h3 className="mt-1 text-xl font-bold text-white">确认强制退出该企业全部会话？</h3>
              </div>
              <button
                aria-label="关闭企业会话撤销弹窗"
                className="rounded-lg px-2 py-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
                onClick={closeRevokeOperation}
                type="button"
              >
                ×
              </button>
            </div>

            <dl className="mt-5 grid gap-3 rounded-xl border border-white/10 bg-white/5 p-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500">企业名称</dt>
                <dd className="mt-1 break-all text-slate-100">{revokeOperation.companyName}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">企业 ID</dt>
                <dd className="mt-1 break-all text-slate-100">{revokeOperation.companyId}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">当前成员总数</dt>
                <dd className="mt-1 text-slate-100">{formatNumber(revokeOperation.totalMemberCount)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">当前活跃成员数</dt>
                <dd className="mt-1 text-slate-100">{formatNumber(revokeOperation.activeMemberCount)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">企业 Owner 数量</dt>
                <dd className="mt-1 text-slate-100">{formatNumber(revokeOperation.ownerCount)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">当前企业会话数量</dt>
                <dd className="mt-1 text-slate-300">当前企业会话数量将在服务端执行时确认</dd>
              </div>
            </dl>

            <p className="mt-5 text-sm leading-6 text-slate-300">
              执行后，所有 activeCompanyId 为该企业的登录会话都会立即失效。用户需要重新登录或重新选择该企业。用户账号、企业成员关系及其他企业会话不受影响。
            </p>
            <p className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-sm leading-6 text-amber-100">
              该操作可能导致企业内所有在线成员立即退出当前企业，请确认已通知相关人员。
            </p>

            <label className="mt-5 block text-sm font-medium text-slate-200" htmlFor="company-session-revoke-reason">
              操作原因
            </label>
            <textarea
              className="mt-2 min-h-24 w-full resize-y rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-amber-300 disabled:opacity-60"
              disabled={submitting}
              id="company-session-revoke-reason"
              maxLength={200}
              onChange={(event) => setReason(event.target.value)}
              placeholder="安全事件处理、企业权限调整、批量退出在线成员等"
              value={reason}
            />
            <div className="mt-1 flex justify-between text-xs">
              <span className={trimmedReasonLength > 0 && trimmedReasonLength < 2 ? 'text-amber-200' : 'text-slate-500'}>
                操作原因需为 2–200 个字符
              </span>
              <span className={reason.length >= 200 ? 'text-amber-200' : 'text-slate-500'}>{reason.length}/200</span>
            </div>

            <label className="mt-5 block text-sm font-medium text-slate-200" htmlFor="company-session-revoke-confirmation">
              请输入确认文字：<span className="select-all text-amber-100">{REVOKE_CONFIRMATION_TEXT}</span>
            </label>
            <input
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-amber-300 disabled:opacity-60"
              disabled={submitting}
              id="company-session-revoke-confirmation"
              onChange={(event) => setConfirmationText(event.target.value)}
              placeholder={REVOKE_CONFIRMATION_TEXT}
              value={confirmationText}
            />
            {confirmationText.length > 0 && confirmationText.trim() !== REVOKE_CONFIRMATION_TEXT ? (
              <p className="mt-1 text-xs text-amber-200">确认文字必须完全匹配</p>
            ) : null}

            {operationError ? (
              <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">
                {operationError}
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                className="rounded-lg px-4 py-2 text-sm text-slate-300 transition hover:bg-white/10"
                onClick={closeRevokeOperation}
                type="button"
              >
                {submitting ? '取消并停止' : '取消'}
              </button>
              <button
                className="rounded-lg bg-amber-500/80 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-45"
                disabled={!canSubmitRevokeOperation}
                onClick={() => void submitRevokeOperation()}
                type="button"
              >
                {submitting ? '正在退出…' : '确认退出全部企业会话'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
