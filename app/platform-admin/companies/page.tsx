'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

const PAGE_SIZES = [20, 50, 100] as const;
const SORT_FIELDS = ['createdAt', 'name'] as const;

type PageSize = (typeof PAGE_SIZES)[number];
type SortBy = (typeof SORT_FIELDS)[number];
type SortOrder = 'asc' | 'desc';

type CompanyFilters = {
  page: number;
  pageSize: PageSize;
  search: string;
  sortBy: SortBy;
  sortOrder: SortOrder;
};

type CompanyOwner = {
  id: string;
  name: string;
  maskedPhone: string;
  maskedEmail: string;
};

type CompanySubscription = {
  id: string;
  status: string;
  planCode: string;
  planName: string;
  currentPeriodEnd: string | null;
};

type CompanyListItem = {
  id: string;
  name: string;
  createdAt: string | null;
  owner: CompanyOwner | null;
  memberCount: number | null;
  activeMemberCount: number | null;
  knowledgeSpaceCount: number | null;
  documentCount: number | null;
  skillCount: number | null;
  subscription: CompanySubscription | null;
  creditBalance: number | null;
  currentMonthAiCalls: number | null;
  currentMonthCreditsUsed: number | null;
};

type CompanyListResponse = {
  items: CompanyListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const DEFAULT_FILTERS: CompanyFilters = {
  page: 1,
  pageSize: 20,
  search: '',
  sortBy: 'createdAt',
  sortOrder: 'desc',
};

const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  trialing: '试用中',
  active: '生效中',
  past_due: '已逾期',
  canceled: '已取消',
  expired: '已过期',
};

function getPage(value: string | null) {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 ? page : DEFAULT_FILTERS.page;
}

function getPageSize(value: string | null): PageSize {
  const pageSize = Number(value);
  return PAGE_SIZES.includes(pageSize as PageSize) ? (pageSize as PageSize) : DEFAULT_FILTERS.pageSize;
}

function getSearch(value: string | null) {
  return value && value.length <= 100 ? value : '';
}

function getSortBy(value: string | null): SortBy {
  return SORT_FIELDS.includes(value as SortBy) ? (value as SortBy) : DEFAULT_FILTERS.sortBy;
}

function getSortOrder(value: string | null): SortOrder {
  return value === 'asc' || value === 'desc' ? value : DEFAULT_FILTERS.sortOrder;
}

function getFiltersFromUrl(params: URLSearchParams): CompanyFilters {
  return {
    page: getPage(params.get('page')),
    pageSize: getPageSize(params.get('pageSize')),
    search: getSearch(params.get('search')),
    sortBy: getSortBy(params.get('sortBy')),
    sortOrder: getSortOrder(params.get('sortOrder')),
  };
}

function filtersEqual(first: CompanyFilters, second: CompanyFilters) {
  return (
    first.page === second.page &&
    first.pageSize === second.pageSize &&
    first.search === second.search &&
    first.sortBy === second.sortBy &&
    first.sortOrder === second.sortOrder
  );
}

function toUrlParams(filters: CompanyFilters) {
  const params = new URLSearchParams();
  if (filters.page > DEFAULT_FILTERS.page) params.set('page', String(filters.page));
  if (filters.pageSize !== DEFAULT_FILTERS.pageSize) params.set('pageSize', String(filters.pageSize));
  if (filters.search) params.set('search', filters.search);
  if (filters.sortBy !== DEFAULT_FILTERS.sortBy) params.set('sortBy', filters.sortBy);
  if (filters.sortOrder !== DEFAULT_FILTERS.sortOrder) params.set('sortOrder', filters.sortOrder);
  return params;
}

function toApiParams(filters: CompanyFilters) {
  const params = new URLSearchParams({
    page: String(filters.page),
    pageSize: String(filters.pageSize),
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
  });
  if (filters.search) params.set('search', filters.search);
  return params;
}

function toDetailHref(companyId: string, filters: CompanyFilters) {
  const returnParams = new URLSearchParams({
    returnPage: String(filters.page),
    returnPageSize: String(filters.pageSize),
    returnSortBy: filters.sortBy,
    returnSortOrder: filters.sortOrder,
  });

  if (filters.search) {
    returnParams.set('returnSearch', filters.search);
  }

  return `/platform-admin/companies/${encodeURIComponent(companyId)}?${returnParams.toString()}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatCount(value: number | null) {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(value ?? 0);
}

function formatCredits(value: number | null, empty: string) {
  return value === null ? empty : `${formatCount(value)} 积分`;
}

function formatCalls(value: number | null) {
  return value === null ? '暂无可靠数据' : `${formatCount(value)} 次`;
}

function getSubscriptionStatusLabel(status: string) {
  return SUBSCRIPTION_STATUS_LABELS[status] || status || '—';
}

export default function CompaniesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlKey = searchParams.toString();
  const initialFilters = getFiltersFromUrl(new URLSearchParams(urlKey));
  const [filters, setFilters] = useState<CompanyFilters>(initialFilters);
  const [query, setQuery] = useState(initialFilters.search);
  const [data, setData] = useState<CompanyListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestSequence = useRef(0);
  const hasHandledInitialSearch = useRef(false);
  const incomingUrlSync = useRef<string | null>(null);
  const pendingSearchFromUrl = useRef<string | null>(null);
  const filtersUrlKey = toUrlParams(filters).toString();

  useEffect(() => {
    const nextFilters = getFiltersFromUrl(new URLSearchParams(urlKey));
    incomingUrlSync.current = toUrlParams(nextFilters).toString();
    setFilters((current) => (filtersEqual(current, nextFilters) ? current : nextFilters));
    setQuery((current) => {
      if (current === nextFilters.search) return current;
      pendingSearchFromUrl.current = nextFilters.search;
      return nextFilters.search;
    });
  }, [urlKey]);

  useEffect(() => {
    if (incomingUrlSync.current !== null) {
      const syncedKey = incomingUrlSync.current;
      if (syncedKey === filtersUrlKey) {
        incomingUrlSync.current = null;
        if (urlKey !== filtersUrlKey) {
          router.replace(
            filtersUrlKey ? `/platform-admin/companies?${filtersUrlKey}` : '/platform-admin/companies',
          );
        }
      }
      return;
    }

    if (urlKey !== filtersUrlKey) {
      router.push(filtersUrlKey ? `/platform-admin/companies?${filtersUrlKey}` : '/platform-admin/companies');
    }
  }, [filtersUrlKey, router, urlKey]);

  useEffect(() => {
    if (!hasHandledInitialSearch.current) {
      hasHandledInitialSearch.current = true;
      return;
    }

    if (pendingSearchFromUrl.current === query) {
      pendingSearchFromUrl.current = null;
      return;
    }

    const timer = window.setTimeout(() => {
      const search = query.slice(0, 100);
      setFilters((current) => {
        const next = { ...current, page: 1, search };
        return filtersEqual(current, next) ? current : next;
      });
    }, 400);

    return () => window.clearTimeout(timer);
  }, [query]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const requestId = ++requestSequence.current;
      setLoading(true);
      setError('');

      try {
        const response = await fetch(`/api/platform-admin/companies?${toApiParams(filters).toString()}`, {
          signal,
        });
        const payload = (await response.json().catch(() => null)) as
          | CompanyListResponse
          | { error?: string }
          | null;

        if (response.status === 401) {
          if (requestId === requestSequence.current) {
            setData(null);
            window.location.assign('/auth/login');
          }
          return;
        }

        if (response.status === 403) {
          if (requestId === requestSequence.current) {
            setData(null);
            setError('无平台运营权限');
          }
          return;
        }

        if (!response.ok || !payload || !Array.isArray((payload as CompanyListResponse).items)) {
          const apiError = typeof (payload as { error?: unknown } | null)?.error === 'string'
            ? (payload as { error: string }).error.slice(0, 200)
            : '企业列表加载失败，请稍后重试';
          throw new Error(apiError);
        }

        if (requestId === requestSequence.current) {
          setData(payload as CompanyListResponse);
        }
      } catch (requestError: unknown) {
        if (signal?.aborted || (requestError instanceof DOMException && requestError.name === 'AbortError')) {
          return;
        }
        if (requestId === requestSequence.current) {
          setError(requestError instanceof Error ? requestError.message : '企业列表加载失败，请稍后重试');
        }
      } finally {
        if (requestId === requestSequence.current && !signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [filters],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (!data || data.total <= 0 || data.totalPages < 1 || data.page <= data.totalPages) {
      return;
    }

    setFilters((current) => {
      const next = { ...current, page: data.totalPages };
      return filtersEqual(current, next) ? current : next;
    });
  }, [data]);

  const updateFilter = <Key extends keyof CompanyFilters>(key: Key, value: CompanyFilters[Key]) => {
    setFilters((current) => {
      const next = { ...current, page: 1, [key]: value };
      return filtersEqual(current, next) ? current : next;
    });
  };

  const resetFilters = () => {
    setQuery('');
    setFilters(DEFAULT_FILTERS);
  };

  const currentPage = data && data.total > 0 ? Math.min(Math.max(data.page, 1), Math.max(data.totalPages, 1)) : 1;
  const totalPages = Math.max(data?.totalPages || 1, 1);

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-sky-200">真实数据 · 只读</p>
          <h2 className="mt-1 text-2xl font-bold">企业管理</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            查看企库库平台中的企业、成员、订阅、积分和使用情况。
          </p>
        </div>
        <button
          className="rounded-lg bg-white/10 px-3 py-2 text-sm transition hover:bg-white/15 disabled:opacity-50"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading && data ? '正在刷新…' : '刷新'}
        </button>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/10 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input
            className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm outline-none placeholder:text-slate-500 focus:border-sky-400"
            maxLength={100}
            onChange={(event) => setQuery(event.target.value.slice(0, 100))}
            placeholder="搜索企业、Owner 或手机号后四位"
            value={query}
          />
          <select
            className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm"
            onChange={(event) => updateFilter('sortBy', getSortBy(event.target.value))}
            value={filters.sortBy}
          >
            <option value="createdAt">创建时间</option>
            <option value="name">企业名称</option>
          </select>
          <select
            className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm"
            onChange={(event) => updateFilter('sortOrder', getSortOrder(event.target.value))}
            value={filters.sortOrder}
          >
            <option value="desc">降序</option>
            <option value="asc">升序</option>
          </select>
          <select
            className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm"
            onChange={(event) => updateFilter('pageSize', getPageSize(event.target.value))}
            value={filters.pageSize}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                每页 {size} 条
              </option>
            ))}
          </select>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-400">企业总数：{data?.total ?? 0}</p>
          <button className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/10" onClick={resetFilters}>
            重置筛选
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">
          <p>{error}</p>
          <button className="mt-3 underline underline-offset-4" onClick={() => void load()}>
            重新加载
          </button>
        </div>
      ) : null}

      {!data && loading ? (
        <div className="mt-5 rounded-2xl border border-white/10 bg-white/10 p-8 text-sm text-slate-400">
          正在加载真实企业数据…
        </div>
      ) : null}

      {data ? (
        <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10 bg-white/10">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-xs text-slate-400">
            <span>企业状态与更新时间当前未在数据模型中配置</span>
            {loading ? <span>正在按当前条件刷新…</span> : null}
          </div>
          <table className="w-full min-w-[1740px] text-left text-sm">
            <thead className="bg-slate-950/30 text-slate-400">
              <tr>
                {[
                  '企业',
                  'Owner',
                  '成员',
                  '企业资源',
                  '当前套餐',
                  '积分余额',
                  '本月 AI 调用',
                  '本月积分消耗',
                  '创建时间',
                  '操作',
                ].map((title) => (
                  <th className="p-3 font-medium" key={title}>
                    {title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((company) => (
                <tr className="border-t border-white/10 align-top" key={company.id}>
                  <td className="p-3">
                    <p className="font-medium text-slate-100">{company.name || '未命名企业'}</p>
                    <p className="mt-1 max-w-56 break-all text-xs text-slate-500">{company.id}</p>
                  </td>
                  <td className="p-3">
                    {company.owner ? (
                      <div className="space-y-1">
                        <p className="font-medium text-slate-100">{company.owner.name || '未设置姓名'}</p>
                        <p className="text-xs text-slate-400">{company.owner.maskedPhone || '未绑定'}</p>
                        <p className="text-xs text-slate-400">{company.owner.maskedEmail || '未绑定'}</p>
                        <p className="max-w-48 break-all text-xs text-slate-500">{company.owner.id}</p>
                      </div>
                    ) : (
                      <span className="text-slate-400">暂无 Owner</span>
                    )}
                  </td>
                  <td className="p-3 text-slate-200">
                    <p>总成员：{formatCount(company.memberCount)}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      有效成员：{company.activeMemberCount === null ? '暂无可靠数据' : formatCount(company.activeMemberCount)}
                    </p>
                  </td>
                  <td className="p-3 text-slate-200">
                    <p>知识空间：{formatCount(company.knowledgeSpaceCount)}</p>
                    <p className="mt-1">文件：{formatCount(company.documentCount)}</p>
                    <p className="mt-1">Skill：{formatCount(company.skillCount)}</p>
                  </td>
                  <td className="p-3">
                    {company.subscription ? (
                      <div className="space-y-1">
                        <p className="font-medium text-slate-100">{company.subscription.planName || '未命名套餐'}</p>
                        <p className="text-xs text-slate-400">{company.subscription.planCode || '—'}</p>
                        <span className="inline-flex rounded-full bg-sky-300/10 px-2 py-0.5 text-xs text-sky-100">
                          {getSubscriptionStatusLabel(company.subscription.status)}
                        </span>
                        <p className="text-xs text-slate-400">
                          到期：
                          {company.subscription.currentPeriodEnd
                            ? formatDate(company.subscription.currentPeriodEnd)
                            : '暂无到期时间'}
                        </p>
                      </div>
                    ) : (
                      <span className="text-slate-400">暂无有效订阅</span>
                    )}
                  </td>
                  <td className="p-3 text-slate-200">{formatCredits(company.creditBalance, '暂无积分账户')}</td>
                  <td className="p-3 text-slate-200">{formatCalls(company.currentMonthAiCalls)}</td>
                  <td className="p-3 text-slate-200">
                    {formatCredits(company.currentMonthCreditsUsed, '暂无可靠数据')}
                  </td>
                  <td className="whitespace-nowrap p-3 text-slate-300">{formatDate(company.createdAt)}</td>
                  <td className="w-28 p-3">
                    <Link
                      className="inline-flex rounded-lg px-2.5 py-1.5 text-sm text-sky-200 transition hover:bg-sky-300/10 hover:text-sky-100"
                      href={toDetailHref(company.id, filters)}
                    >
                      查看详情
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && data.items.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">当前条件下没有企业数据</div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
        <button
          className="rounded-lg bg-white/10 px-3 py-2 transition hover:bg-white/15 disabled:opacity-40"
          disabled={!data || currentPage <= 1 || loading}
          onClick={() => setFilters((current) => ({ ...current, page: currentPage - 1 }))}
        >
          上一页
        </button>
        <span className="text-slate-300">
          第 {currentPage} / {totalPages} 页 · 共 {data?.total ?? 0} 家企业
        </span>
        <button
          className="rounded-lg bg-white/10 px-3 py-2 transition hover:bg-white/15 disabled:opacity-40"
          disabled={!data || currentPage >= totalPages || loading}
          onClick={() => setFilters((current) => ({ ...current, page: currentPage + 1 }))}
        >
          下一页
        </button>
      </div>
    </section>
  );
}
