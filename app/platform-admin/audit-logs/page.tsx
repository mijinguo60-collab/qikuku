'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

const PAGE_SIZES = [20, 50, 100] as const;

const ACTION_LABELS: Record<string, string> = {
  'user.disable': '禁用用户',
  'user.restore': '恢复用户',
  'user.sessions.revoke_all': '强制退出全部会话',
  'user.platform_admin.grant': '授予平台管理员',
  'user.platform_admin.revoke': '撤销平台管理员',
};

const TARGET_TYPE_LABELS: Record<string, string> = {
  User: '用户',
};

type SortOrder = 'asc' | 'desc';

type AuditFilters = {
  page: number;
  pageSize: (typeof PAGE_SIZES)[number];
  search: string;
  action: string;
  targetType: string;
  adminUserId: string;
  companyId: string;
  dateFrom: string;
  dateTo: string;
  sortOrder: SortOrder;
};

type AuditLogItem = {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  companyId: string | null;
  reason: string | null;
  beforeData: unknown;
  afterData: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  admin: {
    id: string | null;
    name: string;
    maskedEmail: string;
    role: string | null;
  };
};

type AuditLogResponse = {
  items: AuditLogItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  filters: {
    actions: string[];
    targetTypes: string[];
  };
};

const DEFAULT_FILTERS: AuditFilters = {
  page: 1,
  pageSize: 20,
  search: '',
  action: '',
  targetType: '',
  adminUserId: '',
  companyId: '',
  dateFrom: '',
  dateTo: '',
  sortOrder: 'desc',
};

function getPage(value: string | null) {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 ? page : DEFAULT_FILTERS.page;
}

function getPageSize(value: string | null): (typeof PAGE_SIZES)[number] {
  const pageSize = Number(value);
  return PAGE_SIZES.includes(pageSize as (typeof PAGE_SIZES)[number])
    ? (pageSize as (typeof PAGE_SIZES)[number])
    : DEFAULT_FILTERS.pageSize;
}

function getText(value: string | null) {
  return value ? value.slice(0, 100) : '';
}

function getDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
}

function getFiltersFromUrl(params: URLSearchParams): AuditFilters {
  return {
    page: getPage(params.get('page')),
    pageSize: getPageSize(params.get('pageSize')),
    search: getText(params.get('search')),
    action: getText(params.get('action')),
    targetType: getText(params.get('targetType')),
    adminUserId: getText(params.get('adminUserId')),
    companyId: getText(params.get('companyId')),
    dateFrom: getDate(params.get('dateFrom')),
    dateTo: getDate(params.get('dateTo')),
    sortOrder: params.get('sortOrder') === 'asc' ? 'asc' : 'desc',
  };
}

function filtersEqual(first: AuditFilters, second: AuditFilters) {
  return (
    first.page === second.page &&
    first.pageSize === second.pageSize &&
    first.search === second.search &&
    first.action === second.action &&
    first.targetType === second.targetType &&
    first.adminUserId === second.adminUserId &&
    first.companyId === second.companyId &&
    first.dateFrom === second.dateFrom &&
    first.dateTo === second.dateTo &&
    first.sortOrder === second.sortOrder
  );
}

function toUrlParams(filters: AuditFilters) {
  const params = new URLSearchParams();
  if (filters.page > 1) params.set('page', String(filters.page));
  if (filters.pageSize !== DEFAULT_FILTERS.pageSize) params.set('pageSize', String(filters.pageSize));
  if (filters.search) params.set('search', filters.search);
  if (filters.action) params.set('action', filters.action);
  if (filters.targetType) params.set('targetType', filters.targetType);
  if (filters.adminUserId) params.set('adminUserId', filters.adminUserId);
  if (filters.companyId) params.set('companyId', filters.companyId);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.sortOrder !== DEFAULT_FILTERS.sortOrder) params.set('sortOrder', filters.sortOrder);
  return params;
}

function toApiParams(filters: AuditFilters) {
  const params = new URLSearchParams({
    page: String(filters.page),
    pageSize: String(filters.pageSize),
    sortOrder: filters.sortOrder,
  });

  if (filters.search) params.set('search', filters.search);
  if (filters.action) params.set('action', filters.action);
  if (filters.targetType) params.set('targetType', filters.targetType);
  if (filters.adminUserId) params.set('adminUserId', filters.adminUserId);
  if (filters.companyId) params.set('companyId', filters.companyId);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  return params;
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

function getActionLabel(action: string) {
  return ACTION_LABELS[action] || action;
}

function getTargetTypeLabel(targetType: string) {
  return TARGET_TYPE_LABELS[targetType] || targetType;
}

function getRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getString(record: Record<string, unknown> | null, key: string) {
  return record && typeof record[key] === 'string' ? record[key] : null;
}

function getNumber(record: Record<string, unknown> | null, key: string) {
  return record && typeof record[key] === 'number' && Number.isFinite(record[key])
    ? record[key]
    : null;
}

function getStatusLabel(value: string | null) {
  if (value === 'active') return '正常';
  if (value === 'disabled') return '已禁用';
  if (value === 'deleted') return '已删除';
  return value;
}

function getRoleLabel(value: string | null) {
  if (value === 'platform_super_admin') return '平台超级管理员';
  return value ? '普通用户' : null;
}

function getResultSummary(item: AuditLogItem) {
  const before = getRecord(item.beforeData);
  const after = getRecord(item.afterData);
  const beforeStatus = getStatusLabel(getString(before, 'status'));
  const afterStatus = getStatusLabel(getString(after, 'status'));
  const beforeRole = getRoleLabel(getString(before, 'role'));
  const afterRole = getRoleLabel(getString(after, 'role'));
  const revokedSessionCount = getNumber(after, 'revokedSessionCount');

  if (item.action === 'user.disable' && beforeStatus && afterStatus) {
    return `${beforeStatus} → ${afterStatus}${revokedSessionCount !== null ? `，撤销 ${revokedSessionCount} 个会话` : ''}`;
  }
  if (item.action === 'user.restore' && beforeStatus && afterStatus) {
    return `${beforeStatus} → ${afterStatus}`;
  }
  if (item.action === 'user.sessions.revoke_all' && revokedSessionCount !== null) {
    return `撤销 ${revokedSessionCount} 个会话`;
  }
  if (
    (item.action === 'user.platform_admin.grant' || item.action === 'user.platform_admin.revoke') &&
    beforeRole &&
    afterRole
  ) {
    return `${beforeRole} → ${afterRole}`;
  }
  return '查看详情';
}

function formatAuditData(value: unknown) {
  if (value === null || value === undefined) return '—';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '—';
  }
}

function AuditDataBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div>
      <h4 className="text-sm font-medium text-slate-200">{title}</h4>
      <pre className="mt-2 max-h-64 overflow-auto select-none rounded-xl border border-white/10 bg-slate-950/70 p-3 text-xs leading-5 text-slate-300">
        {formatAuditData(value)}
      </pre>
    </div>
  );
}

function AuditDetailModal({ item, onClose }: { item: AuditLogItem; onClose: () => void }) {
  const detailRows = [
    ['审计 ID', item.id],
    ['创建时间', formatDate(item.createdAt)],
    ['操作管理员', `${item.admin.name || '未知管理员'} · ${item.admin.maskedEmail || '未绑定'}`],
    ['管理员 ID', item.admin.id || '—'],
    ['操作 action', item.action],
    ['目标类型', getTargetTypeLabel(item.targetType)],
    ['目标 ID', item.targetId || '—'],
    ['企业 ID', item.companyId || '—'],
    ['原因', item.reason || '—'],
    ['脱敏 IP', item.ip || '—'],
    ['安全 User-Agent', item.userAgent || '—'],
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <section
        aria-labelledby="audit-log-detail-title"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-sky-200">只读审计记录</p>
            <h3 className="mt-1 text-xl font-semibold" id="audit-log-detail-title">
              {getActionLabel(item.action)}
            </h3>
          </div>
          <button className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15" onClick={onClose}>
            关闭
          </button>
        </div>

        <dl className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {detailRows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="mt-1 break-words text-sm text-slate-200">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-6 grid gap-5">
          <AuditDataBlock title="变更前数据" value={item.beforeData} />
          <AuditDataBlock title="变更后数据" value={item.afterData} />
        </div>
      </section>
    </div>
  );
}

export default function AuditLogsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlKey = searchParams.toString();
  const initialFilters = getFiltersFromUrl(new URLSearchParams(urlKey));
  const [filters, setFilters] = useState<AuditFilters>(initialFilters);
  const [query, setQuery] = useState(initialFilters.search);
  const [data, setData] = useState<AuditLogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);
  const requestSequence = useRef(0);
  const hasHandledInitialSearch = useRef(false);
  const incomingUrlSync = useRef<string | null>(null);
  const filtersUrlKey = toUrlParams(filters).toString();

  useEffect(() => {
    const nextFilters = getFiltersFromUrl(new URLSearchParams(urlKey));
    incomingUrlSync.current = toUrlParams(nextFilters).toString();
    setFilters((current) => (filtersEqual(current, nextFilters) ? current : nextFilters));
    setQuery((current) => (current === nextFilters.search ? current : nextFilters.search));
  }, [urlKey]);

  useEffect(() => {
    if (incomingUrlSync.current !== null) {
      const syncedKey = incomingUrlSync.current;
      if (syncedKey === filtersUrlKey) {
        incomingUrlSync.current = null;
        if (urlKey !== filtersUrlKey) {
          router.replace(
            filtersUrlKey ? `/platform-admin/audit-logs?${filtersUrlKey}` : '/platform-admin/audit-logs',
          );
        }
      }
      return;
    }

    if (urlKey !== filtersUrlKey) {
      router.replace(
        filtersUrlKey ? `/platform-admin/audit-logs?${filtersUrlKey}` : '/platform-admin/audit-logs',
      );
    }
  }, [filtersUrlKey, router, urlKey]);

  useEffect(() => {
    if (!hasHandledInitialSearch.current) {
      hasHandledInitialSearch.current = true;
      return;
    }

    const timer = window.setTimeout(() => {
      const nextSearch = query.slice(0, 100);
      setFilters((current) => {
        const next = { ...current, page: 1, search: nextSearch };
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
        const response = await fetch(`/api/platform-admin/audit-logs?${toApiParams(filters).toString()}`, {
          signal,
        });
        const payload = (await response.json().catch(() => null)) as AuditLogResponse | { error?: string } | null;

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

        if (!response.ok || !payload || !Array.isArray((payload as AuditLogResponse).items)) {
          throw new Error(
            typeof (payload as { error?: unknown } | null)?.error === 'string'
              ? (payload as { error: string }).error.slice(0, 200)
              : '审计日志加载失败，请稍后重试',
          );
        }

        if (requestId === requestSequence.current) {
          setData(payload as AuditLogResponse);
        }
      } catch (requestError: unknown) {
        if (signal?.aborted || (requestError instanceof DOMException && requestError.name === 'AbortError')) {
          return;
        }
        if (requestId === requestSequence.current) {
          setError(requestError instanceof Error ? requestError.message : '审计日志加载失败，请稍后重试');
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

  useEffect(() => {
    if (!selectedLog) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedLog(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedLog]);

  const updateFilter = <Key extends keyof AuditFilters>(key: Key, value: AuditFilters[Key]) => {
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
  const hasRows = Boolean(data?.items.length);

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-sky-200">只读模块</p>
          <h2 className="mt-1 text-2xl font-bold">平台审计日志</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            记录平台管理员执行的关键管理操作，审计记录不可在后台修改或删除。
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
            placeholder="搜索审计 ID、动作、目标或管理员"
            value={query}
          />
          <select
            className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm"
            onChange={(event) => updateFilter('action', event.target.value.slice(0, 100))}
            value={filters.action}
          >
            <option value="">全部操作类型</option>
            {(data?.filters.actions || []).map((action) => (
              <option key={action} value={action}>
                {getActionLabel(action)}
              </option>
            ))}
          </select>
          <select
            className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm"
            onChange={(event) => updateFilter('targetType', event.target.value.slice(0, 100))}
            value={filters.targetType}
          >
            <option value="">全部目标类型</option>
            {(data?.filters.targetTypes || []).map((targetType) => (
              <option key={targetType} value={targetType}>
                {getTargetTypeLabel(targetType)}
              </option>
            ))}
          </select>
          <select
            className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm"
            onChange={(event) => updateFilter('sortOrder', event.target.value === 'asc' ? 'asc' : 'desc')}
            value={filters.sortOrder}
          >
            <option value="desc">最新优先</option>
            <option value="asc">最早优先</option>
          </select>
          <input
            className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm outline-none placeholder:text-slate-500 focus:border-sky-400"
            maxLength={100}
            onChange={(event) => updateFilter('adminUserId', event.target.value.slice(0, 100))}
            placeholder="管理员 ID"
            value={filters.adminUserId}
          />
          <input
            className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm outline-none placeholder:text-slate-500 focus:border-sky-400"
            maxLength={100}
            onChange={(event) => updateFilter('companyId', event.target.value.slice(0, 100))}
            placeholder="企业 ID"
            value={filters.companyId}
          />
          <label className="grid gap-1 text-xs text-slate-400">
            开始日期
            <input
              className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              onChange={(event) => updateFilter('dateFrom', event.target.value)}
              type="date"
              value={filters.dateFrom}
            />
          </label>
          <label className="grid gap-1 text-xs text-slate-400">
            结束日期
            <input
              className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              onChange={(event) => updateFilter('dateTo', event.target.value)}
              type="date"
              value={filters.dateTo}
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-400">审计记录总数：{data?.total ?? 0}</p>
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
          正在加载真实审计记录…
        </div>
      ) : null}

      {data ? (
        <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10 bg-white/10">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-xs text-slate-400">
            <span>审计记录为只读，不可修改或删除</span>
            {loading ? <span>正在按当前条件刷新…</span> : null}
          </div>
          <table className="w-full min-w-[1520px] text-left text-sm">
            <thead className="bg-slate-950/30 text-slate-400">
              <tr>
                {[
                  '时间',
                  '操作管理员',
                  '操作类型',
                  '目标类型',
                  '目标 ID',
                  '企业 ID',
                  '原因',
                  'IP',
                  'User-Agent',
                  '操作结果摘要',
                  '详情',
                ].map((title) => (
                  <th className="p-3 font-medium" key={title}>
                    {title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr className="border-t border-white/10 align-top" key={item.id}>
                  <td className="whitespace-nowrap p-3 text-slate-300">{formatDate(item.createdAt)}</td>
                  <td className="p-3">
                    <p className="font-medium text-slate-100">{item.admin.name || '未知管理员'}</p>
                    <p className="mt-1 text-xs text-slate-400">{item.admin.maskedEmail || '未绑定'}</p>
                    <p className="mt-1 break-all text-xs text-slate-500">{item.admin.id || '—'}</p>
                  </td>
                  <td className="p-3 font-medium text-sky-200">{getActionLabel(item.action)}</td>
                  <td className="p-3">{getTargetTypeLabel(item.targetType)}</td>
                  <td className="max-w-44 break-all p-3 text-xs text-slate-300">{item.targetId || '—'}</td>
                  <td className="max-w-44 break-all p-3 text-xs text-slate-300">{item.companyId || '—'}</td>
                  <td className="max-w-56 break-words p-3 text-slate-300">{item.reason || '—'}</td>
                  <td className="whitespace-nowrap p-3 text-slate-300">{item.ip || '—'}</td>
                  <td className="max-w-60 break-words p-3 text-xs text-slate-400">{item.userAgent || '—'}</td>
                  <td className="max-w-64 break-words p-3 text-slate-200">{getResultSummary(item)}</td>
                  <td className="p-3">
                    <button
                      className="whitespace-nowrap text-sky-300 hover:text-sky-200"
                      onClick={() => setSelectedLog(item)}
                    >
                      查看详情
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!hasRows && !loading ? (
            <div className="p-8 text-center text-sm text-slate-400">当前筛选条件下暂无审计记录。</div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2 text-slate-400">
          <span>共 {data?.total ?? 0} 条</span>
          <select
            className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-slate-100"
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
        <div className="flex items-center gap-3">
          <button
            className="rounded-lg bg-white/10 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!data || currentPage <= 1 || loading}
            onClick={() => updateFilter('page', Math.max(1, currentPage - 1))}
          >
            上一页
          </button>
          <span className="text-slate-300">
            {currentPage} / {totalPages}
          </span>
          <button
            className="rounded-lg bg-white/10 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!data || currentPage >= totalPages || loading}
            onClick={() => updateFilter('page', currentPage + 1)}
          >
            下一页
          </button>
        </div>
      </div>

      {selectedLog ? <AuditDetailModal item={selectedLog} onClose={() => setSelectedLog(null)} /> : null}
    </section>
  );
}
