'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

const PAGE_SIZES = [20, 50, 100] as const;
const PLAN_SORT_FIELDS = ['createdAt', 'updatedAt', 'name', 'code', 'monthlyPrice', 'yearlyPrice'] as const;
const SUBSCRIPTION_SORT_FIELDS = ['createdAt', 'updatedAt', 'startedAt', 'expiresAt', 'status', 'billingCycle'] as const;
const KNOWN_SUBSCRIPTION_STATUSES = [
  ['trialing', 'trialingSubscriptionCount', '试用中'],
  ['active', 'activeSubscriptionCount', '正常订阅'],
  ['past_due', 'pastDueSubscriptionCount', '已逾期'],
  ['canceled', 'canceledSubscriptionCount', '已取消'],
] as const;

type PageSize = (typeof PAGE_SIZES)[number];
type PlanSortBy = (typeof PLAN_SORT_FIELDS)[number];
type SubscriptionSortBy = (typeof SUBSCRIPTION_SORT_FIELDS)[number];
type SortOrder = 'asc' | 'desc';
type View = 'plans' | 'subscriptions';
type SubscriptionStatisticKey = (typeof KNOWN_SUBSCRIPTION_STATUSES)[number][1];

type PlanFilters = {
  page: number;
  pageSize: PageSize;
  search: string;
  sortBy: PlanSortBy;
  sortOrder: SortOrder;
};

type SubscriptionFilters = {
  page: number;
  pageSize: PageSize;
  search: string;
  companyId: string;
  planId: string;
  status: string;
  billingCycle: string;
  sortBy: SubscriptionSortBy;
  sortOrder: SortOrder;
};

type PlanItem = {
  id: string;
  code: string;
  name: string;
  monthlyPrice: number | null;
  yearlyPrice: number | null;
  monthlyCredits: number | null;
  maxMembers: number | null;
  maxKnowledgeSpaces: number | null;
  storageLimitBytes: number | null;
  enabled: boolean | null;
  createdAt: string | null;
  updatedAt: string | null;
  subscriptionCount: number | null;
  companyCount: number | null;
  activeSubscriptionCount: number | null;
  trialingSubscriptionCount: number | null;
  pastDueSubscriptionCount: number | null;
  canceledSubscriptionCount: number | null;
};

type PlansResponse = {
  items: PlanItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  currency: string;
  priceUnit: string;
  filters: { subscriptionStatuses: string[] };
};

type SubscriptionItem = {
  subscriptionId: string;
  status: string;
  billingCycle: string;
  startedAt: string | null;
  expiresAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  autoRenew?: boolean | null;
  company: { id: string; name: string; industry: string | null } | null;
  plan: {
    id: string;
    code: string;
    name: string;
    monthlyPrice: number | null;
    yearlyPrice: number | null;
    monthlyCredits: number | null;
    enabled: boolean | null;
  } | null;
  dataIntegrityWarning: boolean;
};

type SubscriptionsResponse = {
  items: SubscriptionItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  currency: string;
  priceUnit: string;
  filters: {
    statuses: string[];
    billingCycles: string[];
    plans: Array<{ id: string; code: string; name: string; enabled: boolean | null }>;
  };
};

const DEFAULT_PLAN_FILTERS: PlanFilters = {
  page: 1,
  pageSize: 20,
  search: '',
  sortBy: 'createdAt',
  sortOrder: 'asc',
};

const DEFAULT_SUBSCRIPTION_FILTERS: SubscriptionFilters = {
  page: 1,
  pageSize: 20,
  search: '',
  companyId: '',
  planId: '',
  status: '',
  billingCycle: '',
  sortBy: 'createdAt',
  sortOrder: 'desc',
};

function isSafeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function getPage(value: string | null, fallback = 1) {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 ? page : fallback;
}

function getPageSize(value: string | null): PageSize {
  const pageSize = Number(value);
  return PAGE_SIZES.includes(pageSize as PageSize) ? (pageSize as PageSize) : 20;
}

function getBoundedText(value: string | null, maxLength: number) {
  return value && value.length <= maxLength ? value.trim() : '';
}

function getPlanSortBy(value: string | null): PlanSortBy {
  return PLAN_SORT_FIELDS.includes(value as PlanSortBy) ? (value as PlanSortBy) : DEFAULT_PLAN_FILTERS.sortBy;
}

function getSubscriptionSortBy(value: string | null): SubscriptionSortBy {
  return SUBSCRIPTION_SORT_FIELDS.includes(value as SubscriptionSortBy)
    ? (value as SubscriptionSortBy)
    : DEFAULT_SUBSCRIPTION_FILTERS.sortBy;
}

function getSortOrder(value: string | null, fallback: SortOrder): SortOrder {
  return value === 'asc' || value === 'desc' ? value : fallback;
}

function getView(params: URLSearchParams): View {
  return params.get('view') === 'subscriptions' ? 'subscriptions' : 'plans';
}

function getPlanFilters(params: URLSearchParams): PlanFilters {
  return {
    page: getPage(params.get('page'), DEFAULT_PLAN_FILTERS.page),
    pageSize: getPageSize(params.get('pageSize')),
    search: getBoundedText(params.get('search'), 100),
    sortBy: getPlanSortBy(params.get('sortBy')),
    sortOrder: getSortOrder(params.get('sortOrder'), DEFAULT_PLAN_FILTERS.sortOrder),
  };
}

function getSubscriptionFilters(params: URLSearchParams): SubscriptionFilters {
  return {
    page: getPage(params.get('subPage'), DEFAULT_SUBSCRIPTION_FILTERS.page),
    pageSize: getPageSize(params.get('subPageSize')),
    search: getBoundedText(params.get('subSearch'), 100),
    companyId: getBoundedText(params.get('subCompanyId'), 100),
    planId: getBoundedText(params.get('subPlanId'), 100),
    status: getBoundedText(params.get('subStatus'), 50),
    billingCycle: getBoundedText(params.get('subBillingCycle'), 50),
    sortBy: getSubscriptionSortBy(params.get('subSortBy')),
    sortOrder: getSortOrder(params.get('subSortOrder'), DEFAULT_SUBSCRIPTION_FILTERS.sortOrder),
  };
}

function planFiltersEqual(first: PlanFilters, second: PlanFilters) {
  return first.page === second.page && first.pageSize === second.pageSize && first.search === second.search && first.sortBy === second.sortBy && first.sortOrder === second.sortOrder;
}

function subscriptionFiltersEqual(first: SubscriptionFilters, second: SubscriptionFilters) {
  return first.page === second.page && first.pageSize === second.pageSize && first.search === second.search && first.companyId === second.companyId && first.planId === second.planId && first.status === second.status && first.billingCycle === second.billingCycle && first.sortBy === second.sortBy && first.sortOrder === second.sortOrder;
}

function setOptionalParam(params: URLSearchParams, key: string, value: string) {
  params.delete(key);
  if (value) params.set(key, value);
}

function buildPlanUrl(current: string, filters: PlanFilters) {
  const params = new URLSearchParams(current);
  ['page', 'pageSize', 'search', 'sortBy', 'sortOrder'].forEach((key) => params.delete(key));
  if (filters.page > DEFAULT_PLAN_FILTERS.page) params.set('page', String(filters.page));
  if (filters.pageSize !== DEFAULT_PLAN_FILTERS.pageSize) params.set('pageSize', String(filters.pageSize));
  if (filters.search) params.set('search', filters.search);
  if (filters.sortBy !== DEFAULT_PLAN_FILTERS.sortBy) params.set('sortBy', filters.sortBy);
  if (filters.sortOrder !== DEFAULT_PLAN_FILTERS.sortOrder) params.set('sortOrder', filters.sortOrder);
  const query = params.toString();
  return query ? `/platform-admin/billing?${query}` : '/platform-admin/billing';
}

function buildSubscriptionUrl(current: string, filters: SubscriptionFilters) {
  const params = new URLSearchParams(current);
  ['subPage', 'subPageSize', 'subSearch', 'subCompanyId', 'subPlanId', 'subStatus', 'subBillingCycle', 'subSortBy', 'subSortOrder'].forEach((key) => params.delete(key));
  if (filters.page > DEFAULT_SUBSCRIPTION_FILTERS.page) params.set('subPage', String(filters.page));
  if (filters.pageSize !== DEFAULT_SUBSCRIPTION_FILTERS.pageSize) params.set('subPageSize', String(filters.pageSize));
  setOptionalParam(params, 'subSearch', filters.search);
  setOptionalParam(params, 'subCompanyId', filters.companyId);
  setOptionalParam(params, 'subPlanId', filters.planId);
  setOptionalParam(params, 'subStatus', filters.status);
  setOptionalParam(params, 'subBillingCycle', filters.billingCycle);
  if (filters.sortBy !== DEFAULT_SUBSCRIPTION_FILTERS.sortBy) params.set('subSortBy', filters.sortBy);
  if (filters.sortOrder !== DEFAULT_SUBSCRIPTION_FILTERS.sortOrder) params.set('subSortOrder', filters.sortOrder);
  const query = params.toString();
  return query ? `/platform-admin/billing?${query}` : '/platform-admin/billing';
}

function planApiParams(filters: PlanFilters) {
  const params = new URLSearchParams({ page: String(filters.page), pageSize: String(filters.pageSize), sortBy: filters.sortBy, sortOrder: filters.sortOrder });
  if (filters.search) params.set('search', filters.search);
  return params;
}

function subscriptionApiParams(filters: SubscriptionFilters) {
  const params = new URLSearchParams({ page: String(filters.page), pageSize: String(filters.pageSize), sortBy: filters.sortBy, sortOrder: filters.sortOrder });
  if (filters.search) params.set('search', filters.search);
  if (filters.companyId) params.set('companyId', filters.companyId);
  if (filters.planId) params.set('planId', filters.planId);
  if (filters.status) params.set('status', filters.status);
  if (filters.billingCycle) params.set('billingCycle', filters.billingCycle);
  return params;
}

function isPlansResponse(value: unknown): value is PlansResponse {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { items?: unknown; filters?: unknown };
  return Array.isArray(candidate.items) && Boolean(candidate.filters) && typeof candidate.filters === 'object';
}

function isSubscriptionsResponse(value: unknown): value is SubscriptionsResponse {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { items?: unknown; filters?: unknown };
  return Array.isArray(candidate.items) && Boolean(candidate.filters) && typeof candidate.filters === 'object';
}

function getSafeApiError(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback;
  const message = value.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 200);
  return message || fallback;
}

function formatNumber(value: number | null | undefined, empty = '暂无可靠数据') {
  return isSafeNumber(value) ? new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value) : empty;
}

function formatDate(value: string | null | undefined, empty = '—') {
  if (!value) return empty;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间数据异常';
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function formatPrice(value: number | null, currency: string, priceUnit: string, period: '月' | '年') {
  if (!isSafeNumber(value) || priceUnit !== 'cents' || currency !== 'CNY') return '暂无价格';
  return `${new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 100)} / ${period}`;
}

function formatCredits(value: number | null) {
  return isSafeNumber(value) ? `${formatNumber(value)} 积分/月` : '暂无可靠数据';
}

function formatMemberLimit(value: number | null) {
  return isSafeNumber(value) ? `${formatNumber(value)} 人` : '暂无可靠数据';
}

function formatKnowledgeSpaceLimit(value: number | null) {
  return isSafeNumber(value) ? `${formatNumber(value)} 个` : '暂无可靠数据';
}

function formatStorage(value: number | null) {
  if (!isSafeNumber(value) || value < 0) return '暂无可靠数据';
  if (value < 1024) return `${formatNumber(value)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(size)} ${units[unit]}`;
}

function getSubscriptionLabel(status: string) {
  return KNOWN_SUBSCRIPTION_STATUSES.find(([key]) => key === status)?.[2] || status || '未知';
}

function getBillingCycleLabel(value: string) {
  return ({ trial: '试用', monthly: '月付', yearly: '年付' } as Record<string, string>)[value] || value || '未知';
}

function getExpiryHint(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间数据异常';
  return date.getTime() < Date.now() ? '到期时间已过' : '尚未到期';
}

function StatusTag({ enabled }: { enabled: boolean | null }) {
  if (enabled === null) return <span className="text-slate-400">—</span>;
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${enabled ? 'bg-emerald-300/10 text-emerald-100' : 'bg-slate-300/10 text-slate-300'}`}>{enabled ? '已启用' : '已停用'}</span>;
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className="rounded-xl border border-white/10 bg-slate-950/30 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-semibold text-slate-100">{value}</p>{detail ? <p className="mt-1 text-xs leading-5 text-slate-400">{detail}</p> : null}</div>;
}

function PlanPanel({ urlKey }: { urlKey: string }) {
  const router = useRouter();
  const [filters, setFilters] = useState<PlanFilters>(() => getPlanFilters(new URLSearchParams(urlKey)));
  const [query, setQuery] = useState(filters.search);
  const [data, setData] = useState<PlansResponse | null>(null);
  const [overview, setOverview] = useState<PlansResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestSequence = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const hasHandledSearch = useRef(false);

  useEffect(() => {
    const next = getPlanFilters(new URLSearchParams(urlKey));
    setFilters((current) => (planFiltersEqual(current, next) ? current : next));
    setQuery((current) => (current === next.search ? current : next.search));
  }, [urlKey]);

  const commit = useCallback((next: PlanFilters) => {
    setFilters(next);
    router.push(buildPlanUrl(urlKey, next));
  }, [router, urlKey]);

  useEffect(() => {
    if (!hasHandledSearch.current) {
      hasHandledSearch.current = true;
      return;
    }
    const timer = window.setTimeout(() => {
      const search = query.slice(0, 100);
      if (search === filters.search) return;
      commit({ ...filters, page: 1, search });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [commit, filters, query]);

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError('');
    try {
      const overviewParams = new URLSearchParams({ page: '1', pageSize: '100', sortBy: 'createdAt', sortOrder: 'asc' });
      const [listResponse, overviewResponse] = await Promise.all([
        fetch(`/api/platform-admin/plans?${planApiParams(filters).toString()}`, { signal: controller.signal }),
        fetch(`/api/platform-admin/plans?${overviewParams.toString()}`, { signal: controller.signal }),
      ]);
      const [listPayload, overviewPayload] = await Promise.all([listResponse.json().catch(() => null), overviewResponse.json().catch(() => null)]);
      if (requestId !== requestSequence.current) return;
      if (listResponse.status === 401 || overviewResponse.status === 401) {
        setData(null); setOverview(null); window.location.assign('/auth/login'); return;
      }
      if (listResponse.status === 403 || overviewResponse.status === 403) {
        setData(null); setOverview(null); setError('无平台运营权限'); return;
      }
      if (listResponse.status === 400 || overviewResponse.status === 400) {
        const source = listResponse.status === 400 ? listPayload : overviewPayload;
        setError(getSafeApiError((source as { error?: unknown } | null)?.error, '套餐查询参数无效')); return;
      }
      if (!listResponse.ok || !overviewResponse.ok || !isPlansResponse(listPayload) || !isPlansResponse(overviewPayload)) {
        setError('套餐与订阅数据加载失败，请稍后重试'); return;
      }
      setData(listPayload); setOverview(overviewPayload);
    } catch (requestError: unknown) {
      if (controller.signal.aborted || (requestError instanceof DOMException && requestError.name === 'AbortError')) return;
      if (requestId === requestSequence.current) setError('套餐与订阅数据加载失败，请稍后重试');
    } finally {
      if (requestId === requestSequence.current && !controller.signal.aborted) { setLoading(false); controllerRef.current = null; }
    }
  }, [filters]);

  useEffect(() => { void load(); return () => controllerRef.current?.abort(); }, [load]);

  useEffect(() => {
    if (!data || data.total <= 0 || data.totalPages < 1 || data.page <= data.totalPages) return;
    commit({ ...filters, page: data.totalPages });
  }, [commit, data, filters]);

  const update = <Key extends keyof PlanFilters>(key: Key, value: PlanFilters[Key]) => commit({ ...filters, page: 1, [key]: value });
  const allPlans = overview?.items || [];
  const subscriptionTotal = allPlans.reduce((total, plan) => total + (plan.subscriptionCount || 0), 0);
  const companyAssociationTotal = allPlans.reduce((total, plan) => total + (plan.companyCount || 0), 0);
  const existingStatuses = overview?.filters.subscriptionStatuses || [];
  const currentPage = data && data.total > 0 ? Math.min(Math.max(data.page, 1), Math.max(data.totalPages, 1)) : 1;
  const totalPages = Math.max(data?.totalPages || 1, 1);

  return <>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="套餐总数" value={formatNumber(overview?.total, '—')} />
      <MetricCard label="订阅关系总数" value={formatNumber(subscriptionTotal, '—')} />
      <MetricCard label="套餐关联企业数" value={formatNumber(companyAssociationTotal, '—')} detail="按套餐分别去重后合计，非全平台唯一企业数。" />
      <MetricCard label="当前订阅状态" value={existingStatuses.length ? existingStatuses.map(getSubscriptionLabel).join('、') : '暂无订阅状态'} detail="仅显示数据库当前实际存在的状态。" />
    </div>
    <div className="mt-6 rounded-2xl border border-white/10 bg-white/10 p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <input className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-400" maxLength={100} onChange={(event) => setQuery(event.target.value.slice(0, 100))} placeholder="搜索套餐 ID、代码或名称" value={query} />
        <select className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100" onChange={(event) => update('sortBy', getPlanSortBy(event.target.value))} value={filters.sortBy}>
          <option value="createdAt">创建时间</option><option value="updatedAt">更新时间</option><option value="name">套餐名称</option><option value="code">套餐代码</option><option value="monthlyPrice">月付价格</option><option value="yearlyPrice">年付价格</option>
        </select>
        <select className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100" onChange={(event) => update('sortOrder', getSortOrder(event.target.value, DEFAULT_PLAN_FILTERS.sortOrder))} value={filters.sortOrder}><option value="asc">升序</option><option value="desc">降序</option></select>
        <select className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100" onChange={(event) => update('pageSize', getPageSize(event.target.value))} value={filters.pageSize}>{PAGE_SIZES.map((size) => <option key={size} value={size}>每页 {size} 条</option>)}</select>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-400">套餐总数：{data?.total ?? 0}</p><div className="flex gap-2"><button className="rounded-lg bg-white/10 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/15 disabled:opacity-50" disabled={loading} onClick={() => void load()} type="button">{loading && data ? '正在刷新…' : '刷新'}</button><button className="rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-white/10" onClick={() => { setQuery(''); commit(DEFAULT_PLAN_FILTERS); }} type="button">重置筛选</button></div></div>
    </div>
    {error ? <div className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100"><p>{error}</p><button className="mt-3 underline underline-offset-4" onClick={() => void load()} type="button">重新加载</button></div> : null}
    {!data && loading ? <div className="mt-5 rounded-2xl border border-white/10 bg-white/10 p-8 text-sm text-slate-400">正在加载套餐与订阅数据…</div> : null}
    {data ? <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10 bg-white/10">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-xs text-slate-400"><span>套餐与订阅信息仅供查看，不提供创建、修改、删除或人工续费操作。</span>{loading ? <span>正在按当前条件刷新…</span> : null}</div>
      <table className="w-full min-w-[1740px] text-left text-sm"><thead className="bg-slate-950/30 text-slate-400"><tr>{['套餐', '价格', '月度积分', '成员上限', '知识空间上限', '存储空间', '状态', '订阅情况', '状态分布', '时间'].map((title) => <th className="p-3 font-medium" key={title}>{title}</th>)}</tr></thead>
        <tbody>{data.items.map((plan) => <tr className="border-t border-white/10 align-top" key={plan.id}>
          <td className="p-3"><p className="font-medium text-slate-100">{plan.name || '未命名套餐'}</p><p className="mt-1 text-xs text-sky-200">{plan.code || '—'}</p><p className="mt-1 max-w-52 break-all text-xs text-slate-500">{plan.id}</p></td>
          <td className="whitespace-nowrap p-3 text-slate-200"><p>{formatPrice(plan.monthlyPrice, data.currency, data.priceUnit, '月')}</p><p className="mt-1 text-xs text-slate-400">{formatPrice(plan.yearlyPrice, data.currency, data.priceUnit, '年')}</p></td>
          <td className="whitespace-nowrap p-3 text-slate-200">{formatCredits(plan.monthlyCredits)}</td><td className="whitespace-nowrap p-3 text-slate-200">{formatMemberLimit(plan.maxMembers)}</td><td className="whitespace-nowrap p-3 text-slate-200">{formatKnowledgeSpaceLimit(plan.maxKnowledgeSpaces)}</td><td className="whitespace-nowrap p-3 text-slate-200">{formatStorage(plan.storageLimitBytes)}</td><td className="p-3"><StatusTag enabled={plan.enabled} /></td>
          <td className="whitespace-nowrap p-3 text-slate-200"><p>订阅：{formatNumber(plan.subscriptionCount)}</p><p className="mt-1 text-xs text-slate-400">关联企业：{formatNumber(plan.companyCount)}</p></td>
          <td className="p-3"><div className="flex min-w-44 flex-wrap gap-1.5">{KNOWN_SUBSCRIPTION_STATUSES.map(([status, key, label]) => { const count = plan[key as SubscriptionStatisticKey]; return count === null ? null : <span className="rounded-full bg-sky-300/10 px-2 py-0.5 text-xs text-sky-100" key={status}>{label} {formatNumber(count, '0')}</span>; })}</div></td>
          <td className="whitespace-nowrap p-3 text-xs text-slate-300"><p>创建：{formatDate(plan.createdAt)}</p><p className="mt-1 text-slate-400">更新：{formatDate(plan.updatedAt)}</p></td>
        </tr>)}</tbody>
      </table>
      {!loading && data.items.length === 0 ? <div className="p-8 text-center text-sm text-slate-400">{filters.search ? '没有找到符合条件的套餐' : '当前暂无套餐配置'}{!filters.search ? <p className="mt-2">请通过受控的套餐初始化流程配置套餐。只读页面不会自动创建套餐。</p> : null}</div> : null}
    </div> : null}
    <Pager currentPage={currentPage} disabled={loading || !data} label="套餐" onNext={() => commit({ ...filters, page: currentPage + 1 })} onPrevious={() => commit({ ...filters, page: currentPage - 1 })} total={data?.total || 0} totalPages={totalPages} />
  </>;
}

function SubscriptionPanel({ urlKey }: { urlKey: string }) {
  const router = useRouter();
  const [filters, setFilters] = useState<SubscriptionFilters>(() => getSubscriptionFilters(new URLSearchParams(urlKey)));
  const [query, setQuery] = useState(filters.search);
  const [data, setData] = useState<SubscriptionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestSequence = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const hasHandledSearch = useRef(false);

  useEffect(() => {
    const next = getSubscriptionFilters(new URLSearchParams(urlKey));
    setFilters((current) => (subscriptionFiltersEqual(current, next) ? current : next));
    setQuery((current) => (current === next.search ? current : next.search));
  }, [urlKey]);

  const commit = useCallback((next: SubscriptionFilters) => {
    setFilters(next);
    router.push(buildSubscriptionUrl(urlKey, next));
  }, [router, urlKey]);

  useEffect(() => {
    if (!hasHandledSearch.current) { hasHandledSearch.current = true; return; }
    const timer = window.setTimeout(() => {
      const search = query.slice(0, 100);
      if (search === filters.search) return;
      commit({ ...filters, page: 1, search });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [commit, filters, query]);

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/platform-admin/subscriptions?${subscriptionApiParams(filters).toString()}`, { signal: controller.signal });
      const payload = await response.json().catch(() => null);
      if (requestId !== requestSequence.current) return;
      if (response.status === 401) { setData(null); window.location.assign('/auth/login'); return; }
      if (response.status === 403) { setData(null); setError('无平台运营权限'); return; }
      if (response.status === 400) { setError(getSafeApiError((payload as { error?: unknown } | null)?.error, '订阅查询参数无效')); return; }
      if (!response.ok || !isSubscriptionsResponse(payload)) { setError('企业订阅数据加载失败，请稍后重试'); return; }
      setData(payload);
    } catch (requestError: unknown) {
      if (controller.signal.aborted || (requestError instanceof DOMException && requestError.name === 'AbortError')) return;
      if (requestId === requestSequence.current) setError('企业订阅数据加载失败，请稍后重试');
    } finally {
      if (requestId === requestSequence.current && !controller.signal.aborted) { setLoading(false); controllerRef.current = null; }
    }
  }, [filters]);

  useEffect(() => { void load(); return () => controllerRef.current?.abort(); }, [load]);

  useEffect(() => {
    if (!data || data.total <= 0 || data.totalPages < 1 || data.page <= data.totalPages) return;
    commit({ ...filters, page: data.totalPages });
  }, [commit, data, filters]);

  const update = <Key extends keyof SubscriptionFilters>(key: Key, value: SubscriptionFilters[Key]) => commit({ ...filters, page: 1, [key]: value });
  const currentPage = data && data.total > 0 ? Math.min(Math.max(data.page, 1), Math.max(data.totalPages, 1)) : 1;
  const totalPages = Math.max(data?.totalPages || 1, 1);
  const autoRenewValues = data?.items.map((item) => item.autoRenew).filter((value): value is boolean => typeof value === 'boolean') || [];
  const currentPageAutoRenew = autoRenewValues.length === data?.items.length ? autoRenewValues.filter(Boolean).length : null;
  const integrityWarnings = data?.items.filter((item) => item.dataIntegrityWarning).length || 0;

  return <>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <MetricCard label="订阅关系总数" value={formatNumber(data?.total, '—')} />
      <MetricCard label="当前筛选结果数量" value={formatNumber(data?.items.length, '—')} detail="仅统计当前已加载页。" />
      <MetricCard label="实际订阅状态" value={data?.filters.statuses.length ? data.filters.statuses.map(getSubscriptionLabel).join('、') : '暂无订阅状态'} detail="仅显示 API 返回的真实状态。" />
      <MetricCard label="实际计费周期" value={data?.filters.billingCycles.length ? data.filters.billingCycles.map(getBillingCycleLabel).join('、') : '暂无计费周期'} detail="仅显示 API 返回的真实计费周期。" />
      <MetricCard label="当前页自动续费" value={currentPageAutoRenew === null ? '暂无可靠数据' : formatNumber(currentPageAutoRenew)} detail="现有只读订阅 API 未返回该字段时不推断。" />
      <MetricCard label="当前页关联异常" value={formatNumber(integrityWarnings, '—')} detail="仅统计当前已加载页。" />
    </div>
    <div className="mt-6 rounded-2xl border border-white/10 bg-white/10 p-4">
      <p className="mb-3 text-xs text-slate-400">可搜索订阅 ID、企业 ID/名称、套餐 ID/code/名称</p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <input className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-400" maxLength={100} onChange={(event) => setQuery(event.target.value.slice(0, 100))} placeholder="搜索订阅、企业或套餐" value={query} />
        <input className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-400" maxLength={100} onChange={(event) => update('companyId', event.target.value.slice(0, 100).trim())} placeholder="企业 ID" value={filters.companyId} />
        <select className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100" onChange={(event) => update('planId', event.target.value)} value={filters.planId}><option value="">全部套餐</option>{data?.filters.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name || '未命名套餐'} · {plan.code || '—'} · {plan.id}</option>)}</select>
        <select className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100" onChange={(event) => update('status', event.target.value)} value={filters.status}><option value="">全部订阅状态</option>{data?.filters.statuses.map((status) => <option key={status} value={status}>{getSubscriptionLabel(status)}</option>)}</select>
        <select className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100" onChange={(event) => update('billingCycle', event.target.value)} value={filters.billingCycle}><option value="">全部计费周期</option>{data?.filters.billingCycles.map((cycle) => <option key={cycle} value={cycle}>{getBillingCycleLabel(cycle)}</option>)}</select>
        <select className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100" onChange={(event) => update('sortBy', getSubscriptionSortBy(event.target.value))} value={filters.sortBy}><option value="createdAt">创建时间</option><option value="updatedAt">更新时间</option><option value="startedAt">开始时间</option><option value="expiresAt">到期时间</option><option value="status">订阅状态</option><option value="billingCycle">计费周期</option></select>
        <select className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100" onChange={(event) => update('sortOrder', getSortOrder(event.target.value, DEFAULT_SUBSCRIPTION_FILTERS.sortOrder))} value={filters.sortOrder}><option value="asc">升序</option><option value="desc">降序</option></select>
        <select className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100" onChange={(event) => update('pageSize', getPageSize(event.target.value))} value={filters.pageSize}>{PAGE_SIZES.map((size) => <option key={size} value={size}>每页 {size} 条</option>)}</select>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-400">订阅总数：{data?.total ?? 0}</p><div className="flex gap-2"><button className="rounded-lg bg-white/10 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/15 disabled:opacity-50" disabled={loading} onClick={() => void load()} type="button">{loading && data ? '正在刷新…' : '刷新'}</button><button className="rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-white/10" onClick={() => { setQuery(''); commit(DEFAULT_SUBSCRIPTION_FILTERS); }} type="button">重置筛选</button></div></div>
    </div>
    {error ? <div className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100"><p>{error}</p><button className="mt-3 underline underline-offset-4" onClick={() => void load()} type="button">重新加载</button></div> : null}
    {!data && loading ? <div className="mt-5 rounded-2xl border border-white/10 bg-white/10 p-8 text-sm text-slate-400">正在加载企业订阅数据…</div> : null}
    {data ? <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10 bg-white/10">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-xs text-slate-400"><span>企业订阅信息仅供查看，不提供创建、续期、取消或自动补建订阅操作。</span>{loading ? <span>正在按当前条件刷新…</span> : null}</div>
      <table className="w-full min-w-[1900px] text-left text-sm"><thead className="bg-slate-950/30 text-slate-400"><tr>{['订阅', '企业', '套餐', '价格与额度', '订阅状态', '计费周期', '开始时间', '到期时间', '自动续费', '数据完整性'].map((title) => <th className="p-3 font-medium" key={title}>{title}</th>)}</tr></thead>
        <tbody>{data.items.map((subscription) => { const expiryHint = getExpiryHint(subscription.expiresAt); return <tr className="border-t border-white/10 align-top" key={subscription.subscriptionId}>
          <td className="p-3"><p className="max-w-52 break-all font-medium text-slate-100">{subscription.subscriptionId}</p><p className="mt-2 text-xs text-slate-400">创建：{formatDate(subscription.createdAt)}</p><p className="mt-1 text-xs text-slate-500">更新：{formatDate(subscription.updatedAt)}</p></td>
          <td className="p-3">{subscription.company ? <><p className="font-medium text-slate-100">{subscription.company.name || '未命名企业'}</p><p className="mt-1 max-w-48 break-all text-xs text-slate-400">{subscription.company.id}</p><p className="mt-1 text-xs text-slate-500">{subscription.company.industry || '未填写行业'}</p></> : <span className="text-amber-100">企业关联缺失</span>}</td>
          <td className="p-3">{subscription.plan ? <><p className="font-medium text-slate-100">{subscription.plan.name || '未命名套餐'}</p><p className="mt-1 text-xs text-sky-200">{subscription.plan.code || '—'}</p><p className="mt-1 max-w-48 break-all text-xs text-slate-500">{subscription.plan.id}</p><p className="mt-2"><StatusTag enabled={subscription.plan.enabled} /></p></> : <span className="text-amber-100">套餐关联缺失</span>}</td>
          <td className="whitespace-nowrap p-3 text-slate-200">{subscription.plan ? <><p>{formatPrice(subscription.plan.monthlyPrice, data.currency, data.priceUnit, '月')}</p><p className="mt-1 text-xs text-slate-400">{formatPrice(subscription.plan.yearlyPrice, data.currency, data.priceUnit, '年')}</p><p className="mt-2 text-xs text-slate-300">{formatCredits(subscription.plan.monthlyCredits)}</p></> : '暂无价格'}</td>
          <td className="whitespace-nowrap p-3"><span className="rounded-full bg-sky-300/10 px-2 py-0.5 text-xs text-sky-100">{getSubscriptionLabel(subscription.status)}</span></td>
          <td className="whitespace-nowrap p-3 text-slate-200">{getBillingCycleLabel(subscription.billingCycle)}</td>
          <td className="whitespace-nowrap p-3 text-slate-200">{formatDate(subscription.startedAt, '未设置')}</td>
          <td className="whitespace-nowrap p-3 text-slate-200"><p>{formatDate(subscription.expiresAt, '未设置到期时间')}</p>{expiryHint ? <p className={`mt-1 text-xs ${expiryHint === '到期时间已过' ? 'text-amber-200' : 'text-slate-400'}`}>{expiryHint}</p> : null}</td>
          <td className="whitespace-nowrap p-3 text-slate-200">{subscription.autoRenew === true ? '已开启' : subscription.autoRenew === false ? '未开启' : '未知'}</td>
          <td className="whitespace-nowrap p-3">{subscription.dataIntegrityWarning ? <span className="rounded-full bg-amber-300/10 px-2 py-0.5 text-xs text-amber-100">关联数据异常</span> : <span className="text-slate-400">正常</span>}</td>
        </tr>; })}</tbody>
      </table>
      {!loading && data.items.length === 0 ? <div className="p-8 text-center text-sm text-slate-400">{filters.search || filters.companyId || filters.planId || filters.status || filters.billingCycle ? '没有找到符合条件的企业订阅' : '当前暂无企业订阅记录'}{!(filters.search || filters.companyId || filters.planId || filters.status || filters.billingCycle) ? <p className="mt-2">只读页面不会自动创建试用订阅或套餐。</p> : null}</div> : null}
    </div> : null}
    <Pager currentPage={currentPage} disabled={loading || !data} label="订阅" onNext={() => commit({ ...filters, page: currentPage + 1 })} onPrevious={() => commit({ ...filters, page: currentPage - 1 })} total={data?.total || 0} totalPages={totalPages} />
  </>;
}

function Pager({ currentPage, totalPages, total, label, disabled, onPrevious, onNext }: { currentPage: number; totalPages: number; total: number; label: string; disabled: boolean; onPrevious: () => void; onNext: () => void }) {
  return <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm"><button className="rounded-lg bg-white/10 px-3 py-2 text-slate-200 transition hover:bg-white/15 disabled:opacity-40" disabled={disabled || currentPage <= 1} onClick={onPrevious} type="button">上一页</button><span className="text-slate-300">第 {currentPage} / {totalPages} 页 · 共 {total} 个{label}</span><button className="rounded-lg bg-white/10 px-3 py-2 text-slate-200 transition hover:bg-white/15 disabled:opacity-40" disabled={disabled || currentPage >= totalPages} onClick={onNext} type="button">下一页</button></div>;
}

export default function PlatformBillingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlKey = searchParams.toString();
  const view = getView(new URLSearchParams(urlKey));

  useEffect(() => {
    const params = new URLSearchParams(urlKey);
    const rawView = params.get('view');
    if (rawView && rawView !== 'plans' && rawView !== 'subscriptions') {
      params.set('view', 'plans');
      router.replace(`/platform-admin/billing?${params.toString()}`);
    }
  }, [router, urlKey]);

  const switchView = (nextView: View) => {
    const params = new URLSearchParams(urlKey);
    params.set('view', nextView);
    router.push(`/platform-admin/billing?${params.toString()}`);
  };

  return <section>
    <div>
      <p className="text-xs font-medium text-sky-200">真实数据 · 只读管理页面</p>
      <h2 className="mt-1 text-2xl font-bold text-slate-100">套餐与订阅</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">查看企库库平台的套餐配置、价格、资源额度及企业订阅使用情况。</p>
    </div>
    <div className="mt-5 inline-flex rounded-xl border border-white/10 bg-slate-950/30 p-1">
      <button className={`rounded-lg px-4 py-2 text-sm transition ${view === 'plans' ? 'bg-white/15 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`} onClick={() => switchView('plans')} type="button">套餐配置</button>
      <button className={`rounded-lg px-4 py-2 text-sm transition ${view === 'subscriptions' ? 'bg-white/15 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`} onClick={() => switchView('subscriptions')} type="button">企业订阅</button>
    </div>
    {view === 'plans' ? <PlanPanel urlKey={urlKey} /> : <SubscriptionPanel urlKey={urlKey} />}
  </section>;
}
