'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

const PAGE_SIZES = [20, 50, 100] as const;
const ACCOUNT_SORT_FIELDS = ['updatedAt', 'totalBalance', 'packageBalance', 'purchasedBalance', 'bonusBalance'] as const;
const LEDGER_SORT_FIELDS = ['createdAt', 'amount', 'balanceBefore', 'balanceAfter', 'type', 'featureType'] as const;

type PageSize = (typeof PAGE_SIZES)[number];
type AccountSortBy = (typeof ACCOUNT_SORT_FIELDS)[number];
type LedgerSortBy = (typeof LEDGER_SORT_FIELDS)[number];
type SortOrder = 'asc' | 'desc';
type NegativeFilter = '' | 'true' | 'false';
type CreditsView = 'accounts' | 'ledgers';

type CreditFilters = {
  page: number; pageSize: PageSize; search: string; companyId: string; hasNegativeBalance: NegativeFilter;
  minBalance: string; maxBalance: string; sortBy: AccountSortBy; sortOrder: SortOrder;
};

type LedgerFilters = {
  page: number; pageSize: PageSize; search: string; companyId: string; userId: string; grantId: string;
  type: string; featureType: string; minAmount: string; maxAmount: string; createdFrom: string; createdTo: string;
  sortBy: LedgerSortBy; sortOrder: SortOrder;
};

type CreditAccountItem = {
  creditAccountId: string; totalBalance: number | null; packageBalance: number | null; purchasedBalance: number | null; bonusBalance: number | null; updatedAt: string | null;
  company: { id: string; name: string; industry: string | null } | null;
  subscription: { id: string; status: string; billingCycle: string; expiresAt: string | null } | null;
  plan: { id: string; code: string; name: string; monthlyCredits: number | null; enabled: boolean | null } | null;
  ledgerSummary: { ledgerCount: number | null; lifetimeCreditsGranted: number | null; lifetimeCreditsUsed: number | null; currentMonthCreditsGranted: number | null; currentMonthCreditsUsed: number | null; lastLedgerAt: string | null };
  ledgerCalculatedBalance: number | null; balanceMismatch: boolean | null; dataIntegrityWarning: boolean;
};

type CreditAccountsResponse = {
  items: CreditAccountItem[]; page: number; pageSize: number; total: number; totalPages: number;
  summary: { accountCount: number | null; totalBalance: number | null; negativeAccountCount: number | null };
};

type LedgerItem = {
  ledgerId: string; type: string; featureType: string | null; amount: number | null; balanceBefore: number | null; balanceAfter: number | null; createdAt: string | null;
  company: { id: string; name: string; industry: string | null } | null;
  user: { id: string; name: string; maskedEmail: string | null; maskedPhone: string | null; accountStatus: string | null } | null;
  grant: { id: string; sourceType: string | null; originalAmount: number | null; remainingAmount: number | null; expiresAt: string | null } | null;
  integrity: { hasWarning: boolean; signMismatch: boolean; balanceEquationMismatch: boolean; companyMissing: boolean; userMissing: boolean; grantMissing: boolean };
};

type CreditLedgersResponse = {
  items: LedgerItem[]; page: number; pageSize: number; total: number; totalPages: number;
  summary: { ledgerCount: number | null; creditCount: number | null; debitCount: number | null; creditsGranted: number | null; creditsUsed: number | null; netBalanceChange: number | null; integrityWarningCount: number | null };
  filters: { types: string[]; featureTypes: string[]; grantSourceTypes: string[] };
  timeRangeSemantics: { createdFromInclusive: boolean; createdToExclusive: boolean };
};

const DEFAULT_FILTERS: CreditFilters = { page: 1, pageSize: 20, search: '', companyId: '', hasNegativeBalance: '', minBalance: '', maxBalance: '', sortBy: 'updatedAt', sortOrder: 'desc' };
const DEFAULT_LEDGER_FILTERS: LedgerFilters = { page: 1, pageSize: 20, search: '', companyId: '', userId: '', grantId: '', type: '', featureType: '', minAmount: '', maxAmount: '', createdFrom: '', createdTo: '', sortBy: 'createdAt', sortOrder: 'desc' };

function isSafeNumber(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value); }
function getPage(value: string | null) { const page = Number(value); return Number.isInteger(page) && page >= 1 ? page : 1; }
function getPageSize(value: string | null): PageSize { const pageSize = Number(value); return PAGE_SIZES.includes(pageSize as PageSize) ? (pageSize as PageSize) : 20; }
function getText(value: string | null, maxLength = 100) { return value && value.length <= maxLength ? value.trim() : ''; }
function getIntegerText(value: string | null) { const normalized = (value || '').trim(); return normalized && /^-?\d+$/.test(normalized) && Number.isSafeInteger(Number(normalized)) ? normalized : ''; }
function getNegativeFilter(value: string | null): NegativeFilter { return value === 'true' || value === 'false' ? value : ''; }
function getSortOrder(value: string | null): SortOrder { return value === 'asc' || value === 'desc' ? value : 'desc'; }
function getAccountSortBy(value: string | null): AccountSortBy { return ACCOUNT_SORT_FIELDS.includes(value as AccountSortBy) ? (value as AccountSortBy) : 'updatedAt'; }
function getLedgerSortBy(value: string | null): LedgerSortBy { return LEDGER_SORT_FIELDS.includes(value as LedgerSortBy) ? (value as LedgerSortBy) : 'createdAt'; }
function getIsoText(value: string | null) { const raw = (value || '').trim(); if (!raw || raw.length > 100) return ''; const date = new Date(raw); return Number.isNaN(date.getTime()) ? '' : date.toISOString(); }
function getView(value: string | null): CreditsView { return value === 'ledgers' ? 'ledgers' : 'accounts'; }

function getFiltersFromUrl(params: URLSearchParams): CreditFilters {
  return { page: getPage(params.get('page')), pageSize: getPageSize(params.get('pageSize')), search: getText(params.get('search')), companyId: getText(params.get('companyId')), hasNegativeBalance: getNegativeFilter(params.get('hasNegativeBalance')), minBalance: getIntegerText(params.get('minBalance')), maxBalance: getIntegerText(params.get('maxBalance')), sortBy: getAccountSortBy(params.get('sortBy')), sortOrder: getSortOrder(params.get('sortOrder')) };
}

function getLedgerFiltersFromUrl(params: URLSearchParams): LedgerFilters {
  return { page: getPage(params.get('ledgerPage')), pageSize: getPageSize(params.get('ledgerPageSize')), search: getText(params.get('ledgerSearch')), companyId: getText(params.get('ledgerCompanyId')), userId: getText(params.get('ledgerUserId')), grantId: getText(params.get('ledgerGrantId')), type: getText(params.get('ledgerType')), featureType: getText(params.get('ledgerFeatureType')), minAmount: getIntegerText(params.get('ledgerMinAmount')), maxAmount: getIntegerText(params.get('ledgerMaxAmount')), createdFrom: getIsoText(params.get('ledgerCreatedFrom')), createdTo: getIsoText(params.get('ledgerCreatedTo')), sortBy: getLedgerSortBy(params.get('ledgerSortBy')), sortOrder: getSortOrder(params.get('ledgerSortOrder')) };
}

function filtersEqual(first: CreditFilters, second: CreditFilters) { return first.page === second.page && first.pageSize === second.pageSize && first.search === second.search && first.companyId === second.companyId && first.hasNegativeBalance === second.hasNegativeBalance && first.minBalance === second.minBalance && first.maxBalance === second.maxBalance && first.sortBy === second.sortBy && first.sortOrder === second.sortOrder; }
function ledgerFiltersEqual(first: LedgerFilters, second: LedgerFilters) { return first.page === second.page && first.pageSize === second.pageSize && first.search === second.search && first.companyId === second.companyId && first.userId === second.userId && first.grantId === second.grantId && first.type === second.type && first.featureType === second.featureType && first.minAmount === second.minAmount && first.maxAmount === second.maxAmount && first.createdFrom === second.createdFrom && first.createdTo === second.createdTo && first.sortBy === second.sortBy && first.sortOrder === second.sortOrder; }
function setOrDelete(params: URLSearchParams, key: string, value: string, defaultValue = '') { if (!value || value === defaultValue) params.delete(key); else params.set(key, value); }
function writeAccountParams(params: URLSearchParams, filters: CreditFilters) {
  setOrDelete(params, 'page', filters.page > 1 ? String(filters.page) : ''); setOrDelete(params, 'pageSize', filters.pageSize === 20 ? '' : String(filters.pageSize)); setOrDelete(params, 'search', filters.search); setOrDelete(params, 'companyId', filters.companyId); setOrDelete(params, 'hasNegativeBalance', filters.hasNegativeBalance); setOrDelete(params, 'minBalance', filters.minBalance); setOrDelete(params, 'maxBalance', filters.maxBalance); setOrDelete(params, 'sortBy', filters.sortBy, 'updatedAt'); setOrDelete(params, 'sortOrder', filters.sortOrder, 'desc');
}
function writeLedgerParams(params: URLSearchParams, filters: LedgerFilters) {
  setOrDelete(params, 'ledgerPage', filters.page > 1 ? String(filters.page) : ''); setOrDelete(params, 'ledgerPageSize', filters.pageSize === 20 ? '' : String(filters.pageSize)); setOrDelete(params, 'ledgerSearch', filters.search); setOrDelete(params, 'ledgerCompanyId', filters.companyId); setOrDelete(params, 'ledgerUserId', filters.userId); setOrDelete(params, 'ledgerGrantId', filters.grantId); setOrDelete(params, 'ledgerType', filters.type); setOrDelete(params, 'ledgerFeatureType', filters.featureType); setOrDelete(params, 'ledgerMinAmount', filters.minAmount); setOrDelete(params, 'ledgerMaxAmount', filters.maxAmount); setOrDelete(params, 'ledgerCreatedFrom', filters.createdFrom); setOrDelete(params, 'ledgerCreatedTo', filters.createdTo); setOrDelete(params, 'ledgerSortBy', filters.sortBy, 'createdAt'); setOrDelete(params, 'ledgerSortOrder', filters.sortOrder, 'desc');
}
function toPageUrl(params: URLSearchParams) { const query = params.toString(); return query ? `/platform-admin/credits?${query}` : '/platform-admin/credits'; }
function toApiParams(filters: CreditFilters) { const params = new URLSearchParams({ page: String(filters.page), pageSize: String(filters.pageSize), sortBy: filters.sortBy, sortOrder: filters.sortOrder }); if (filters.search) params.set('search', filters.search); if (filters.companyId) params.set('companyId', filters.companyId); if (filters.hasNegativeBalance) params.set('hasNegativeBalance', filters.hasNegativeBalance); if (filters.minBalance) params.set('minBalance', filters.minBalance); if (filters.maxBalance) params.set('maxBalance', filters.maxBalance); return params; }
function toLedgerApiParams(filters: LedgerFilters) { const params = new URLSearchParams({ page: String(filters.page), pageSize: String(filters.pageSize), sortBy: filters.sortBy, sortOrder: filters.sortOrder }); if (filters.search) params.set('search', filters.search); if (filters.companyId) params.set('companyId', filters.companyId); if (filters.userId) params.set('userId', filters.userId); if (filters.grantId) params.set('grantId', filters.grantId); if (filters.type) params.set('type', filters.type); if (filters.featureType) params.set('featureType', filters.featureType); if (filters.minAmount) params.set('minAmount', filters.minAmount); if (filters.maxAmount) params.set('maxAmount', filters.maxAmount); if (filters.createdFrom) params.set('createdFrom', filters.createdFrom); if (filters.createdTo) params.set('createdTo', filters.createdTo); return params; }
function isCreditAccountsResponse(value: unknown): value is CreditAccountsResponse { if (!value || typeof value !== 'object') return false; const candidate = value as { items?: unknown; summary?: unknown }; return Array.isArray(candidate.items) && Boolean(candidate.summary) && typeof candidate.summary === 'object'; }
function isCreditLedgersResponse(value: unknown): value is CreditLedgersResponse { if (!value || typeof value !== 'object') return false; const candidate = value as { items?: unknown; summary?: unknown; filters?: unknown }; return Array.isArray(candidate.items) && Boolean(candidate.summary) && Boolean(candidate.filters); }
function getSafeApiError(value: unknown, fallback: string) { if (typeof value !== 'string') return fallback; const message = value.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 200); return message || fallback; }
function formatCredits(value: number | null | undefined, empty = '暂无可靠数据') { return isSafeNumber(value) ? `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(value)} 积分` : empty; }
function formatMonthlyCredits(value: number | null | undefined) { return isSafeNumber(value) ? `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(value)} 积分/月` : '暂无可靠数据'; }
function formatDate(value: string | null | undefined, empty = '—') { if (!value) return empty; const date = new Date(value); return Number.isNaN(date.getTime()) ? '时间数据异常' : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date); }
function toDateTimeLocal(value: string) { if (!value) return ''; const date = new Date(value); if (Number.isNaN(date.getTime())) return ''; const pad = (number: number) => String(number).padStart(2, '0'); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`; }
function fromDateTimeLocal(value: string) { if (!value) return ''; const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toISOString(); }
function getStatusLabel(value: string) { return ({ trialing: '试用中', active: '正常订阅', past_due: '已逾期', canceled: '已取消' } as Record<string, string>)[value] || value || '未知'; }
function getCycleLabel(value: string) { return ({ trial: '试用', monthly: '月付', yearly: '年付' } as Record<string, string>)[value] || value || '未知'; }
function getLedgerTypeLabel(value: string) { return ({ credit: '增加', debit: '消耗' } as Record<string, string>)[value] || value || '未知'; }
function getFeatureTypeLabel(value: string | null) { return ({ skill_chat: 'Skill 问答' } as Record<string, string>)[value || ''] || value || '未标记功能'; }
function getGrantSourceLabel(value: string | null) { return ({ trial: '试用积分', recharge: '充值积分', package: '套餐积分', bonus: '赠送积分' } as Record<string, string>)[value || ''] || value || '未知'; }
function MetricCard({ label, value, detail, warning = false }: { label: string; value: string; detail?: string; warning?: boolean }) { return <div className={`rounded-xl border p-3 ${warning ? 'border-amber-300/20 bg-amber-300/10' : 'border-white/10 bg-slate-950/30'}`}><p className="text-xs text-slate-500">{label}</p><p className={`mt-1 text-xl font-semibold ${warning ? 'text-amber-100' : 'text-slate-100'}`}>{value}</p>{detail ? <p className="mt-1 text-xs leading-5 text-slate-400">{detail}</p> : null}</div>; }
function BalanceValue({ value }: { value: number | null }) { const warning = isSafeNumber(value) && value < 0; return <span className={warning ? 'rounded-full bg-amber-300/10 px-2 py-0.5 text-amber-100' : 'text-slate-100'}>{formatCredits(value)}</span>; }

function LedgerPanel({ active, urlKey }: { active: boolean; urlKey: string }) {
  const router = useRouter();
  const initial = getLedgerFiltersFromUrl(new URLSearchParams(urlKey));
  const [filters, setFilters] = useState<LedgerFilters>(initial);
  const [query, setQuery] = useState(initial.search);
  const [minAmountInput, setMinAmountInput] = useState(initial.minAmount);
  const [maxAmountInput, setMaxAmountInput] = useState(initial.maxAmount);
  const [fromInput, setFromInput] = useState(toDateTimeLocal(initial.createdFrom));
  const [toInput, setToInput] = useState(toDateTimeLocal(initial.createdTo));
  const [rangeError, setRangeError] = useState('');
  const [data, setData] = useState<CreditLedgersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestSequence = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const hasHandledInitialSearch = useRef(false);

  const commit = useCallback((next: LedgerFilters) => {
    const params = new URLSearchParams(urlKey);
    writeLedgerParams(params, next);
    params.set('view', 'ledgers');
    router.push(toPageUrl(params));
  }, [router, urlKey]);

  useEffect(() => {
    const next = getLedgerFiltersFromUrl(new URLSearchParams(urlKey));
    setFilters((current) => ledgerFiltersEqual(current, next) ? current : next);
    setQuery((current) => current === next.search ? current : next.search);
    setMinAmountInput(next.minAmount); setMaxAmountInput(next.maxAmount);
    setFromInput(toDateTimeLocal(next.createdFrom)); setToInput(toDateTimeLocal(next.createdTo)); setRangeError('');
  }, [urlKey]);

  const validateRanges = useCallback((minValue: string, maxValue: string, fromValue: string, toValue: string) => {
    const min = minValue.trim(); const max = maxValue.trim();
    if ((min && (!/^-?\d+$/.test(min) || !Number.isSafeInteger(Number(min)))) || (max && (!/^-?\d+$/.test(max) || !Number.isSafeInteger(Number(max))))) return '变动积分筛选仅允许安全整数';
    if (min && max && Number(min) > Number(max)) return '最低变动积分不能高于最高变动积分';
    const from = fromDateTimeLocal(fromValue); const to = fromDateTimeLocal(toValue);
    if ((fromValue && !from) || (toValue && !to) || (from && to && new Date(from).getTime() >= new Date(to).getTime())) return '时间范围无效';
    return '';
  }, []);

  const applyRanges = useCallback(() => {
    const validation = validateRanges(minAmountInput, maxAmountInput, fromInput, toInput);
    setRangeError(validation);
    if (validation) return false;
    const next = { ...filters, page: 1, minAmount: minAmountInput.trim(), maxAmount: maxAmountInput.trim(), createdFrom: fromDateTimeLocal(fromInput), createdTo: fromDateTimeLocal(toInput) };
    if (!ledgerFiltersEqual(filters, next)) commit(next);
    return true;
  }, [commit, filters, fromInput, maxAmountInput, minAmountInput, toInput, validateRanges]);

  useEffect(() => {
    if (!active || !hasHandledInitialSearch.current) { hasHandledInitialSearch.current = true; return; }
    const timer = window.setTimeout(() => { const search = query.slice(0, 100); if (search !== filters.search) commit({ ...filters, page: 1, search }); }, 400);
    return () => window.clearTimeout(timer);
  }, [active, commit, filters, query]);

  const load = useCallback(async () => {
    const fetchCycle = ++requestSequence.current;
    controllerRef.current?.abort();
    const controller = new AbortController(); controllerRef.current = controller;
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/platform-admin/credit-ledgers?${toLedgerApiParams(filters).toString()}`, { signal: controller.signal });
      const payload = await response.json().catch(() => null);
      if (fetchCycle !== requestSequence.current) return;
      if (response.status === 401) { setData(null); window.location.assign('/auth/login'); return; }
      if (response.status === 403) { setData(null); setError('无平台运营权限'); return; }
      if (response.status === 400) { setError(getSafeApiError((payload as { error?: unknown } | null)?.error, '积分流水查询参数无效')); return; }
      if (!response.ok || !isCreditLedgersResponse(payload)) { setError('积分流水加载失败，请稍后重试'); return; }
      setData(payload);
    } catch (requestError: unknown) {
      if (controller.signal.aborted || (requestError instanceof DOMException && requestError.name === 'AbortError')) return;
      if (fetchCycle === requestSequence.current) setError('积分流水加载失败，请稍后重试');
    } finally { if (fetchCycle === requestSequence.current && !controller.signal.aborted) { setLoading(false); controllerRef.current = null; } }
  }, [filters]);

  useEffect(() => { if (!active) return; void load(); return () => controllerRef.current?.abort(); }, [active, load]);
  useEffect(() => { if (!active || !data || data.total <= 0 || data.totalPages < 1 || data.page <= data.totalPages || filters.page === data.totalPages) return; commit({ ...filters, page: data.totalPages }); }, [active, commit, data, filters]);

  const update = <Key extends keyof LedgerFilters>(key: Key, value: LedgerFilters[Key]) => commit({ ...filters, page: 1, [key]: value });
  const currentPage = data && data.total > 0 ? Math.min(Math.max(data.page, 1), Math.max(data.totalPages, 1)) : 1;
  const totalPages = Math.max(data?.totalPages || 1, 1);
  const summary = data?.summary;
  const net = summary?.netBalanceChange;
  const netLabel = !isSafeNumber(net) ? '暂无可靠数据' : net > 0 ? `净增加 ${formatCredits(net)}` : net < 0 ? `净减少 ${formatCredits(Math.abs(net))}` : '净变化 0 积分';
  const hasFilter = Boolean(filters.search || filters.companyId || filters.userId || filters.grantId || filters.type || filters.featureType || filters.minAmount || filters.maxAmount || filters.createdFrom || filters.createdTo);

  return <div className={active ? '' : 'hidden'}>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-medium text-sky-200">真实数据 · 当前为只读管理页面</p><h3 className="mt-1 text-xl font-bold text-slate-100">全平台积分流水</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">查看企业积分的安全流水摘要、关联状态及当前筛选范围内的统计结果。</p></div>
      <button className="rounded-lg bg-white/10 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/15 disabled:opacity-50" disabled={loading || Boolean(rangeError)} onClick={() => { if (applyRanges()) void load(); }} type="button">{loading && data ? '正在刷新…' : '刷新'}</button>
    </div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="流水总数" value={summary?.ledgerCount === null || summary?.ledgerCount === undefined ? '暂无可靠数据' : new Intl.NumberFormat('zh-CN').format(summary.ledgerCount)} detail="基于当前全部筛选结果。" />
      <MetricCard label="积分增加" value={formatCredits(summary?.creditsGranted)} detail={summary?.creditCount === null || summary?.creditCount === undefined ? '暂无可靠统计' : `${summary.creditCount} 条发放流水`} />
      <MetricCard label="积分消耗" value={formatCredits(summary?.creditsUsed)} detail={summary?.debitCount === null || summary?.debitCount === undefined ? '暂无可靠统计' : `${summary.debitCount} 条消耗流水`} />
      <MetricCard label="净余额变化" value={netLabel} detail="基于当前全部筛选结果。" />
      <MetricCard label="完整性异常" value={summary?.integrityWarningCount === null || summary?.integrityWarningCount === undefined ? '暂无可靠数据' : `${summary.integrityWarningCount} 条`} detail="仅标记真实返回的结构异常。" warning={Boolean(summary?.integrityWarningCount && summary.integrityWarningCount > 0)} />
    </div>
    <div className="mt-6 rounded-2xl border border-white/10 bg-white/10 p-4">
      <p className="mb-3 text-xs text-slate-400">可搜索流水 ID、企业、用户、Grant 及功能类型。开始时间包含，结束时间不包含。</p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <input className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-400" maxLength={100} onChange={(event) => setQuery(event.target.value.slice(0, 100))} placeholder="搜索流水、企业、用户或 Grant" value={query} />
        <input className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-400" maxLength={100} onChange={(event) => update('companyId', event.target.value.slice(0, 100).trim())} placeholder="企业 ID" value={filters.companyId} />
        <input className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-400" maxLength={100} onChange={(event) => update('userId', event.target.value.slice(0, 100).trim())} placeholder="用户 ID" value={filters.userId} />
        <input className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-400" maxLength={100} onChange={(event) => update('grantId', event.target.value.slice(0, 100).trim())} placeholder="Grant ID" value={filters.grantId} />
        <select className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100" onChange={(event) => update('type', event.target.value)} value={filters.type}><option value="">全部流水类型</option>{(data?.filters.types || []).map((value) => <option key={value} value={value}>{getLedgerTypeLabel(value)}</option>)}</select>
        <select className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100" onChange={(event) => update('featureType', event.target.value)} value={filters.featureType}><option value="">全部功能类型</option>{(data?.filters.featureTypes || []).map((value) => <option key={value} value={value}>{getFeatureTypeLabel(value)}</option>)}</select>
        <input className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-400" inputMode="numeric" onBlur={applyRanges} onChange={(event) => { setMinAmountInput(event.target.value); setRangeError(validateRanges(event.target.value, maxAmountInput, fromInput, toInput)); }} placeholder="最低变动积分（整数）" value={minAmountInput} />
        <input className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-400" inputMode="numeric" onBlur={applyRanges} onChange={(event) => { setMaxAmountInput(event.target.value); setRangeError(validateRanges(minAmountInput, event.target.value, fromInput, toInput)); }} placeholder="最高变动积分（整数）" value={maxAmountInput} />
        <input className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100" onBlur={applyRanges} onChange={(event) => { setFromInput(event.target.value); setRangeError(validateRanges(minAmountInput, maxAmountInput, event.target.value, toInput)); }} type="datetime-local" value={fromInput} />
        <input className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100" onBlur={applyRanges} onChange={(event) => { setToInput(event.target.value); setRangeError(validateRanges(minAmountInput, maxAmountInput, fromInput, event.target.value)); }} type="datetime-local" value={toInput} />
        <select className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100" onChange={(event) => update('sortBy', getLedgerSortBy(event.target.value))} value={filters.sortBy}><option value="createdAt">创建时间</option><option value="amount">积分变化</option><option value="balanceBefore">变动前余额</option><option value="balanceAfter">变动后余额</option><option value="type">流水类型</option><option value="featureType">功能类型</option></select>
        <select className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100" onChange={(event) => update('sortOrder', getSortOrder(event.target.value))} value={filters.sortOrder}><option value="asc">升序</option><option value="desc">降序</option></select>
        <select className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100" onChange={(event) => update('pageSize', getPageSize(event.target.value))} value={filters.pageSize}>{PAGE_SIZES.map((size) => <option key={size} value={size}>每页 {size} 条</option>)}</select>
      </div>
      {rangeError ? <p className="mt-3 text-sm text-amber-200">{rangeError}</p> : null}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-400">Grant 来源：{data?.filters.grantSourceTypes?.length ? data.filters.grantSourceTypes.map(getGrantSourceLabel).join('、') : '暂无可靠数据'}</p><button className="rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-white/10" onClick={() => { setQuery(''); setMinAmountInput(''); setMaxAmountInput(''); setFromInput(''); setToInput(''); setRangeError(''); commit(DEFAULT_LEDGER_FILTERS); }} type="button">重置筛选</button></div>
    </div>
    {error ? <div className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100"><p>{error}</p><button className="mt-3 underline underline-offset-4" onClick={() => void load()} type="button">重新加载</button></div> : null}
    {!data && loading ? <div className="mt-5 rounded-2xl border border-white/10 bg-white/10 p-8 text-sm text-slate-400">正在加载积分流水…</div> : null}
    {data ? <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10 bg-white/10">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-xs text-slate-400"><span>统计基于当前全部筛选结果，不仅是当前页。</span>{loading ? <span>正在按当前条件刷新…</span> : null}</div>
      <table className="w-full min-w-[2180px] text-left text-sm"><thead className="bg-slate-950/30 text-slate-400"><tr>{['流水', '企业', '用户', '流水类型', '功能类型', '积分变化', '余额变化', 'Grant', '数据完整性'].map((title) => <th className="p-3 font-medium" key={title}>{title}</th>)}</tr></thead><tbody>{data.items.map((ledger) => {
        const amountClass = isSafeNumber(ledger.amount) && ledger.amount > 0 ? 'text-emerald-200' : isSafeNumber(ledger.amount) && ledger.amount < 0 ? 'text-amber-100' : 'text-slate-200';
        const signedAmount = isSafeNumber(ledger.amount) ? `${ledger.amount > 0 ? '+' : ''}${formatCredits(ledger.amount)}` : '暂无可靠数据';
        const messages = [ledger.integrity.signMismatch ? '积分符号异常' : '', ledger.integrity.balanceEquationMismatch ? '余额等式异常' : '', ledger.integrity.companyMissing ? '企业关联缺失' : '', ledger.integrity.userMissing ? '用户关联缺失' : '', ledger.integrity.grantMissing ? 'Grant 关联缺失' : '', ledger.integrity.hasWarning && !['credit', 'debit'].includes(ledger.type) ? '未知流水类型' : ''].filter(Boolean);
        return <tr className="border-t border-white/10 align-top" key={ledger.ledgerId}>
          <td className="p-3"><p className="max-w-52 break-all font-medium text-slate-100">{ledger.ledgerId}</p><p className="mt-2 text-xs text-slate-400">创建：{formatDate(ledger.createdAt)}</p></td>
          <td className="p-3">{ledger.company ? <><p className="font-medium text-slate-100">{ledger.company.name || '未命名企业'}</p><p className="mt-1 max-w-48 break-all text-xs text-slate-400">{ledger.company.id}</p><p className="mt-1 text-xs text-slate-500">{ledger.company.industry || '未填写行业'}</p></> : <span className="text-amber-100">企业关联缺失</span>}</td>
          <td className="p-3">{ledger.user ? <><p className="font-medium text-slate-100">{ledger.user.name || '未命名用户'}</p><p className="mt-1 max-w-48 break-all text-xs text-slate-400">{ledger.user.id}</p>{ledger.user.maskedEmail ? <p className="mt-1 text-xs text-slate-400">{ledger.user.maskedEmail}</p> : null}{ledger.user.maskedPhone ? <p className="mt-1 text-xs text-slate-400">{ledger.user.maskedPhone}</p> : null}<p className="mt-1 text-xs text-slate-500">{ledger.user.accountStatus || '未知'}</p></> : <span className="text-slate-400">{ledger.integrity.userMissing ? '用户关联缺失' : '系统级流水'}</span>}</td>
          <td className="whitespace-nowrap p-3 text-slate-100">{getLedgerTypeLabel(ledger.type)}</td><td className="p-3 text-slate-200">{getFeatureTypeLabel(ledger.featureType)}</td>
          <td className={`whitespace-nowrap p-3 font-medium ${amountClass}`}>{signedAmount}</td><td className="whitespace-nowrap p-3 text-slate-200">{formatCredits(ledger.balanceBefore)} → {formatCredits(ledger.balanceAfter)}</td>
          <td className="p-3">{ledger.grant ? <><p className="max-w-48 break-all text-slate-100">{ledger.grant.id}</p><p className="mt-1 text-xs text-sky-200">{getGrantSourceLabel(ledger.grant.sourceType)}</p><p className="mt-1 text-xs text-slate-400">原始：{formatCredits(ledger.grant.originalAmount)}</p><p className="mt-1 text-xs text-slate-400">剩余：{formatCredits(ledger.grant.remainingAmount)}</p><p className="mt-1 text-xs text-slate-500">到期：{formatDate(ledger.grant.expiresAt, '未设置到期时间')}</p></> : <span className={ledger.integrity.grantMissing ? 'text-amber-100' : 'text-slate-400'}>{ledger.integrity.grantMissing ? 'Grant 关联缺失' : '没有关联 Grant'}</span>}</td>
          <td className="p-3">{ledger.integrity.hasWarning ? <><span className="rounded-full bg-amber-300/10 px-2 py-0.5 text-xs text-amber-100">数据结构异常</span><p className="mt-2 max-w-48 text-xs leading-5 text-amber-100">{messages.join('、') || '关联数据异常'}</p></> : <span className="text-slate-400">数据结构正常</span>}</td>
        </tr>;
      })}</tbody></table>
      {!loading && data.items.length === 0 ? <div className="p-8 text-center text-sm text-slate-400">{hasFilter ? '没有找到符合条件的积分流水' : '当前暂无积分流水'}{!hasFilter ? <p className="mt-2">只读页面不会自动创建积分流水或调整账户余额。</p> : null}</div> : null}
    </div> : null}
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm"><button className="rounded-lg bg-white/10 px-3 py-2 text-slate-200 transition hover:bg-white/15 disabled:opacity-40" disabled={!data || currentPage <= 1 || loading || Boolean(rangeError)} onClick={() => commit({ ...filters, page: currentPage - 1 })} type="button">上一页</button><span className="text-slate-300">第 {currentPage} / {totalPages} 页 · 共 {data?.total ?? 0} 条流水</span><button className="rounded-lg bg-white/10 px-3 py-2 text-slate-200 transition hover:bg-white/15 disabled:opacity-40" disabled={!data || currentPage >= totalPages || loading || Boolean(rangeError)} onClick={() => commit({ ...filters, page: currentPage + 1 })} type="button">下一页</button></div>
  </div>;
}

export default function CreditAccountsPage() {
  const router = useRouter(); const searchParams = useSearchParams(); const urlKey = searchParams.toString();
  const view = getView(searchParams.get('view'));
  const initialFilters = getFiltersFromUrl(new URLSearchParams(urlKey));
  const [filters, setFilters] = useState<CreditFilters>(initialFilters);
  const [query, setQuery] = useState(initialFilters.search); const [minBalanceInput, setMinBalanceInput] = useState(initialFilters.minBalance); const [maxBalanceInput, setMaxBalanceInput] = useState(initialFilters.maxBalance); const [balanceInputError, setBalanceInputError] = useState('');
  const [data, setData] = useState<CreditAccountsResponse | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const requestSequence = useRef(0); const controllerRef = useRef<AbortController | null>(null); const hasHandledInitialSearch = useRef(false);

  useEffect(() => { const next = getFiltersFromUrl(new URLSearchParams(urlKey)); setFilters((current) => filtersEqual(current, next) ? current : next); setQuery((current) => current === next.search ? current : next.search); setMinBalanceInput(next.minBalance); setMaxBalanceInput(next.maxBalance); setBalanceInputError(''); }, [urlKey]);
  const commit = useCallback((next: CreditFilters) => { setFilters(next); const params = new URLSearchParams(urlKey); writeAccountParams(params, next); if (params.has('view') && params.get('view') !== 'ledgers') params.set('view', 'accounts'); router.push(toPageUrl(params)); }, [router, urlKey]);
  const switchView = useCallback((next: CreditsView) => { const params = new URLSearchParams(urlKey); params.set('view', next); router.push(toPageUrl(params)); }, [router, urlKey]);
  const validateBalanceInputs = useCallback((minValue: string, maxValue: string) => { const min = minValue.trim(); const max = maxValue.trim(); if ((min && (!/^-?\d+$/.test(min) || !Number.isSafeInteger(Number(min)))) || (max && (!/^-?\d+$/.test(max) || !Number.isSafeInteger(Number(max))))) return '余额筛选仅允许安全整数'; if (min && max && Number(min) > Number(max)) return '最低余额不能大于最高余额'; return ''; }, []);
  const applyBalanceInputs = useCallback(() => { const validation = validateBalanceInputs(minBalanceInput, maxBalanceInput); setBalanceInputError(validation); if (validation) return false; const next = { ...filters, page: 1, minBalance: minBalanceInput.trim(), maxBalance: maxBalanceInput.trim() }; if (!filtersEqual(filters, next)) commit(next); return true; }, [commit, filters, maxBalanceInput, minBalanceInput, validateBalanceInputs]);
  useEffect(() => { if (view !== 'accounts' || !hasHandledInitialSearch.current) { hasHandledInitialSearch.current = true; return; } const timer = window.setTimeout(() => { const search = query.slice(0, 100); if (search !== filters.search) commit({ ...filters, page: 1, search }); }, 400); return () => window.clearTimeout(timer); }, [commit, filters, query, view]);
  const load = useCallback(async () => { const fetchCycle = ++requestSequence.current; controllerRef.current?.abort(); const controller = new AbortController(); controllerRef.current = controller; setLoading(true); setError(''); try { const response = await fetch(`/api/platform-admin/credit-accounts?${toApiParams(filters).toString()}`, { signal: controller.signal }); const payload = await response.json().catch(() => null); if (fetchCycle !== requestSequence.current) return; if (response.status === 401) { setData(null); window.location.assign('/auth/login'); return; } if (response.status === 403) { setData(null); setError('无平台运营权限'); return; } if (response.status === 400) { setError(getSafeApiError((payload as { error?: unknown } | null)?.error, '积分账户查询参数无效')); return; } if (!response.ok || !isCreditAccountsResponse(payload)) { setError('企业积分账户加载失败，请稍后重试'); return; } setData(payload); } catch (requestError: unknown) { if (controller.signal.aborted || (requestError instanceof DOMException && requestError.name === 'AbortError')) return; if (fetchCycle === requestSequence.current) setError('企业积分账户加载失败，请稍后重试'); } finally { if (fetchCycle === requestSequence.current && !controller.signal.aborted) { setLoading(false); controllerRef.current = null; } } }, [filters]);
  useEffect(() => { if (view !== 'accounts') return; void load(); return () => controllerRef.current?.abort(); }, [load, view]);
  useEffect(() => { if (view !== 'accounts' || !data || data.total <= 0 || data.totalPages < 1 || data.page <= data.totalPages || filters.page === data.totalPages) return; commit({ ...filters, page: data.totalPages }); }, [commit, data, filters, view]);
  const update = <Key extends keyof CreditFilters>(key: Key, value: CreditFilters[Key]) => commit({ ...filters, page: 1, [key]: value });
  const currentPage = data && data.total > 0 ? Math.min(Math.max(data.page, 1), Math.max(data.totalPages, 1)) : 1; const totalPages = Math.max(data?.totalPages || 1, 1); const negativeCount = data?.summary.negativeAccountCount;

  return <section>
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-medium text-sky-200">真实数据 · 当前为只读管理页面</p><h2 className="mt-1 text-2xl font-bold text-slate-100">企业积分</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">查看企库库平台内各企业的积分余额、积分来源结构及全平台积分流水摘要。</p></div></div>
    <div className="mt-5 inline-flex rounded-xl border border-white/10 bg-slate-950/40 p-1" role="tablist"><button aria-selected={view === 'accounts'} className={`rounded-lg px-4 py-2 text-sm transition ${view === 'accounts' ? 'bg-white/10 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`} onClick={() => switchView('accounts')} role="tab" type="button">积分账户</button><button aria-selected={view === 'ledgers'} className={`rounded-lg px-4 py-2 text-sm transition ${view === 'ledgers' ? 'bg-white/10 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`} onClick={() => switchView('ledgers')} role="tab" type="button">积分流水</button></div>
    <div className={view === 'accounts' ? 'mt-5' : 'hidden'}>
      <div className="flex flex-wrap items-end justify-between gap-4"><div><h3 className="text-xl font-bold text-slate-100">企业积分账户</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">余额、来源结构及历史发放和消耗汇总均为只读数据。</p></div><button className="rounded-lg bg-white/10 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/15 disabled:opacity-50" disabled={loading || Boolean(balanceInputError)} onClick={() => { if (applyBalanceInputs()) void load(); }} type="button">{loading && data ? '正在刷新…' : '刷新'}</button></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><MetricCard label="积分账户数" value={data?.summary.accountCount === null || data?.summary.accountCount === undefined ? '暂无可靠数据' : new Intl.NumberFormat('zh-CN').format(data.summary.accountCount)} detail="基于当前筛选条件。" /><MetricCard label="总积分余额" value={formatCredits(data?.summary.totalBalance)} detail="基于当前筛选条件。" /><MetricCard label="负余额异常账户" value={negativeCount === 0 ? '未发现负余额异常' : negativeCount === null || negativeCount === undefined ? '暂无可靠数据' : `发现 ${negativeCount} 个负余额账户`} detail="异常检测不代表系统允许透支。" warning={Boolean(negativeCount && negativeCount > 0)} /></div>
      <div className="mt-6 rounded-2xl border border-white/10 bg-white/10 p-4"><p className="mb-3 text-xs text-slate-400">可搜索积分账户 ID、企业 ID、企业名称</p><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><input className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-400" maxLength={100} onChange={(event) => setQuery(event.target.value.slice(0, 100))} placeholder="搜索账户或企业" value={query} /><input className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-400" maxLength={100} onChange={(event) => update('companyId', event.target.value.slice(0, 100).trim())} placeholder="企业 ID" value={filters.companyId} /><input className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-400" inputMode="numeric" onBlur={applyBalanceInputs} onChange={(event) => { setMinBalanceInput(event.target.value); setBalanceInputError(validateBalanceInputs(event.target.value, maxBalanceInput)); }} placeholder="最低余额（整数）" value={minBalanceInput} /><input className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-400" inputMode="numeric" onBlur={applyBalanceInputs} onChange={(event) => { setMaxBalanceInput(event.target.value); setBalanceInputError(validateBalanceInputs(minBalanceInput, event.target.value)); }} placeholder="最高余额（整数）" value={maxBalanceInput} /><select className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100" onChange={(event) => update('hasNegativeBalance', getNegativeFilter(event.target.value))} value={filters.hasNegativeBalance}><option value="">全部余额</option><option value="true">仅负余额</option><option value="false">排除负余额</option></select><select className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100" onChange={(event) => update('sortBy', getAccountSortBy(event.target.value))} value={filters.sortBy}><option value="updatedAt">更新时间</option><option value="totalBalance">总余额</option><option value="packageBalance">套餐积分</option><option value="purchasedBalance">购买积分</option><option value="bonusBalance">赠送积分</option></select><select className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100" onChange={(event) => update('sortOrder', getSortOrder(event.target.value))} value={filters.sortOrder}><option value="asc">升序</option><option value="desc">降序</option></select><select className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100" onChange={(event) => update('pageSize', getPageSize(event.target.value))} value={filters.pageSize}>{PAGE_SIZES.map((size) => <option key={size} value={size}>每页 {size} 条</option>)}</select></div>{balanceInputError ? <p className="mt-3 text-sm text-amber-200">{balanceInputError}</p> : null}<div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-400">积分账户总数：{data?.total ?? 0}</p><button className="rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-white/10" onClick={() => { setQuery(''); setMinBalanceInput(''); setMaxBalanceInput(''); setBalanceInputError(''); commit(DEFAULT_FILTERS); }} type="button">重置筛选</button></div></div>
      {error ? <div className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100"><p>{error}</p><button className="mt-3 underline underline-offset-4" onClick={() => void load()} type="button">重新加载</button></div> : null}{!data && loading ? <div className="mt-5 rounded-2xl border border-white/10 bg-white/10 p-8 text-sm text-slate-400">正在加载企业积分账户…</div> : null}
      {data ? <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10 bg-white/10"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-xs text-slate-400"><span>增加统计仅包含有效 credit 正数流水；消耗统计仅包含有效 debit 负数流水，不将退款、冲正、过期或调整标为普通增加/消耗。</span>{loading ? <span>正在按当前条件刷新…</span> : null}</div><table className="w-full min-w-[2180px] text-left text-sm"><thead className="bg-slate-950/30 text-slate-400"><tr>{['积分账户', '企业', '总积分余额', '套餐积分', '购买积分', '赠送积分', '当前订阅', '当前套餐', '历史积分汇总', '本月积分汇总', '数据完整性'].map((title) => <th className="p-3 font-medium" key={title}>{title}</th>)}</tr></thead><tbody>{data.items.map((account) => { const bucketSum = isSafeNumber(account.packageBalance) && isSafeNumber(account.purchasedBalance) && isSafeNumber(account.bonusBalance) ? account.packageBalance + account.purchasedBalance + account.bonusBalance : null; const bucketMismatch = bucketSum !== null && isSafeNumber(account.totalBalance) && bucketSum !== account.totalBalance; return <tr className="border-t border-white/10 align-top" key={account.creditAccountId}><td className="p-3"><p className="max-w-52 break-all font-medium text-slate-100">{account.creditAccountId}</p><p className="mt-2 text-xs text-slate-400">更新：{formatDate(account.updatedAt)}</p></td><td className="p-3">{account.company ? <><p className="font-medium text-slate-100">{account.company.name || '未命名企业'}</p><p className="mt-1 max-w-48 break-all text-xs text-slate-400">{account.company.id}</p><p className="mt-1 text-xs text-slate-500">{account.company.industry || '未填写行业'}</p></> : <span className="text-amber-100">企业关联缺失</span>}</td><td className="whitespace-nowrap p-3"><BalanceValue value={account.totalBalance} /></td><td className="whitespace-nowrap p-3"><BalanceValue value={account.packageBalance} /></td><td className="whitespace-nowrap p-3"><BalanceValue value={account.purchasedBalance} /></td><td className="whitespace-nowrap p-3"><BalanceValue value={account.bonusBalance} />{bucketMismatch ? <p className="mt-2 text-xs text-amber-200">余额分桶合计异常</p> : null}</td><td className="p-3">{account.subscription ? <><p className="max-w-48 break-all text-slate-100">{account.subscription.id}</p><p className="mt-1 text-xs text-sky-200">{getStatusLabel(account.subscription.status)} · {getCycleLabel(account.subscription.billingCycle)}</p><p className="mt-1 text-xs text-slate-400">到期：{formatDate(account.subscription.expiresAt, '未设置到期时间')}</p></> : <span className="text-slate-400">暂无订阅</span>}</td><td className="p-3">{account.plan ? <><p className="font-medium text-slate-100">{account.plan.name || '未命名套餐'}</p><p className="mt-1 text-xs text-sky-200">{account.plan.code || '—'}</p><p className="mt-1 text-xs text-slate-400">{formatMonthlyCredits(account.plan.monthlyCredits)}</p><p className="mt-1 text-xs text-slate-400">{account.plan.enabled === true ? '已启用' : account.plan.enabled === false ? '已停用' : '未知'}</p></> : <span className="text-slate-400">暂无关联套餐</span>}</td><td className="whitespace-nowrap p-3 text-slate-200"><p>{account.ledgerSummary.ledgerCount === null ? '暂无可靠统计' : `${account.ledgerSummary.ledgerCount} 条流水`}</p><p className="mt-1 text-xs text-slate-300">累计增加：{formatCredits(account.ledgerSummary.lifetimeCreditsGranted)}</p><p className="mt-1 text-xs text-slate-400">累计消耗：{formatCredits(account.ledgerSummary.lifetimeCreditsUsed)}</p><p className="mt-2 text-xs text-slate-500">最后流水：{formatDate(account.ledgerSummary.lastLedgerAt, '暂无积分流水')}</p></td><td className="whitespace-nowrap p-3 text-slate-200"><p>本月增加：{formatCredits(account.ledgerSummary.currentMonthCreditsGranted)}</p><p className="mt-1 text-xs text-slate-400">本月消耗：{formatCredits(account.ledgerSummary.currentMonthCreditsUsed)}</p></td><td className="p-3">{account.dataIntegrityWarning ? <div><span className="rounded-full bg-amber-300/10 px-2 py-0.5 text-xs text-amber-100">关联数据异常</span><p className="mt-2 text-xs text-amber-100">{!account.company ? '企业关联缺失' : account.subscription && !account.plan ? 'Plan 关联缺失' : '关联数据异常'}</p></div> : <span className="text-slate-400">关联正常</span>}<p className="mt-3 max-w-48 text-xs leading-5 text-slate-400">{account.ledgerCalculatedBalance === null || account.balanceMismatch === null ? '历史流水不足，无法可靠重算账户余额' : account.balanceMismatch ? '账户余额与流水重算结果不一致' : '余额与流水一致'}</p></td></tr>; })}</tbody></table>{!loading && data.items.length === 0 ? <div className="p-8 text-center text-sm text-slate-400">{filters.search || filters.companyId || filters.hasNegativeBalance || filters.minBalance || filters.maxBalance ? '没有找到符合条件的积分账户' : '当前暂无企业积分账户'}{!(filters.search || filters.companyId || filters.hasNegativeBalance || filters.minBalance || filters.maxBalance) ? <p className="mt-2">只读页面不会自动创建积分账户。</p> : null}</div> : null}</div> : null}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm"><button className="rounded-lg bg-white/10 px-3 py-2 text-slate-200 transition hover:bg-white/15 disabled:opacity-40" disabled={!data || currentPage <= 1 || loading || Boolean(balanceInputError)} onClick={() => commit({ ...filters, page: currentPage - 1 })} type="button">上一页</button><span className="text-slate-300">第 {currentPage} / {totalPages} 页 · 共 {data?.total ?? 0} 个积分账户</span><button className="rounded-lg bg-white/10 px-3 py-2 text-slate-200 transition hover:bg-white/15 disabled:opacity-40" disabled={!data || currentPage >= totalPages || loading || Boolean(balanceInputError)} onClick={() => commit({ ...filters, page: currentPage + 1 })} type="button">下一页</button></div>
    </div>
    <LedgerPanel active={view === 'ledgers'} urlKey={urlKey} />
  </section>;
}
