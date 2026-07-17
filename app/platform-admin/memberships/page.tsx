'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

const PAGE_SIZES = [20, 50, 100] as const;
const SORT_FIELDS = ['createdAt', 'updatedAt', 'role', 'status'] as const;

type PageSize = (typeof PAGE_SIZES)[number];
type SortBy = (typeof SORT_FIELDS)[number];
type SortOrder = 'asc' | 'desc';

type MembershipFilters = {
  page: number;
  pageSize: PageSize;
  search: string;
  companyId: string;
  userId: string;
  role: string;
  status: string;
  sortBy: SortBy;
  sortOrder: SortOrder;
};

type MembershipItem = {
  membershipId: string;
  role: string;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
  company: {
    id: string;
    name: string;
  };
  user: {
    id: string;
    name: string;
    maskedPhone: string;
    maskedEmail: string;
    accountStatus: string;
    lastLoginAt: string | null;
  };
  activeCompanySessionCount: number | null;
  currentMonthCreditsUsed: number | null;
  invitation: {
    inviterId: string;
    inviterName: string;
  } | null;
};

type MembershipListResponse = {
  items: MembershipItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  filters: {
    roles: string[];
    statuses: string[];
  };
};

type MembershipRole = 'owner' | 'member';
type MembershipStatus = 'active' | 'disabled';
type ModalKind = 'role' | 'status' | null;

type RoleOperation = {
  membership: MembershipItem;
  targetRole: MembershipRole;
};

type RoleChangeResponse = {
  success?: boolean;
  changed?: boolean;
  error?: string;
};

type StatusOperation = {
  membership: MembershipItem;
  targetStatus: MembershipStatus;
};

type StatusChangeResponse = {
  success?: boolean;
  changed?: boolean;
  revokedSessionCount?: number;
  error?: string;
};

const DEFAULT_FILTERS: MembershipFilters = {
  page: 1,
  pageSize: 20,
  search: '',
  companyId: '',
  userId: '',
  role: '',
  status: '',
  sortBy: 'createdAt',
  sortOrder: 'desc',
};

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  member: '成员',
};

const MEMBERSHIP_STATUS_LABELS: Record<string, string> = {
  active: '正常',
  disabled: '已停用',
};

const ACCOUNT_STATUS_LABELS: Record<string, string> = {
  active: '正常',
  disabled: '已禁用',
  deleted: '已删除',
};

function getPage(value: string | null) {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 ? page : DEFAULT_FILTERS.page;
}

function getPageSize(value: string | null): PageSize {
  const pageSize = Number(value);
  return PAGE_SIZES.includes(pageSize as PageSize) ? (pageSize as PageSize) : DEFAULT_FILTERS.pageSize;
}

function getLimitedText(value: string | null, maximum = 100) {
  return value && value.length <= maximum ? value : '';
}

function getSortBy(value: string | null): SortBy {
  return SORT_FIELDS.includes(value as SortBy) ? (value as SortBy) : DEFAULT_FILTERS.sortBy;
}

function getSortOrder(value: string | null): SortOrder {
  return value === 'asc' || value === 'desc' ? value : DEFAULT_FILTERS.sortOrder;
}

function getFiltersFromUrl(params: URLSearchParams): MembershipFilters {
  return {
    page: getPage(params.get('page')),
    pageSize: getPageSize(params.get('pageSize')),
    search: getLimitedText(params.get('search')),
    companyId: getLimitedText(params.get('companyId')),
    userId: getLimitedText(params.get('userId')),
    role: getLimitedText(params.get('role'), 50),
    status: getLimitedText(params.get('status'), 50),
    sortBy: getSortBy(params.get('sortBy')),
    sortOrder: getSortOrder(params.get('sortOrder')),
  };
}

function filtersEqual(first: MembershipFilters, second: MembershipFilters) {
  return (
    first.page === second.page &&
    first.pageSize === second.pageSize &&
    first.search === second.search &&
    first.companyId === second.companyId &&
    first.userId === second.userId &&
    first.role === second.role &&
    first.status === second.status &&
    first.sortBy === second.sortBy &&
    first.sortOrder === second.sortOrder
  );
}

function toUrlParams(filters: MembershipFilters) {
  const params = new URLSearchParams();
  if (filters.page > DEFAULT_FILTERS.page) params.set('page', String(filters.page));
  if (filters.pageSize !== DEFAULT_FILTERS.pageSize) params.set('pageSize', String(filters.pageSize));
  if (filters.search) params.set('search', filters.search);
  if (filters.companyId) params.set('companyId', filters.companyId);
  if (filters.userId) params.set('userId', filters.userId);
  if (filters.role) params.set('role', filters.role);
  if (filters.status) params.set('status', filters.status);
  if (filters.sortBy !== DEFAULT_FILTERS.sortBy) params.set('sortBy', filters.sortBy);
  if (filters.sortOrder !== DEFAULT_FILTERS.sortOrder) params.set('sortOrder', filters.sortOrder);
  return params;
}

function toApiParams(filters: MembershipFilters) {
  const params = new URLSearchParams({
    page: String(filters.page),
    pageSize: String(filters.pageSize),
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
  });
  if (filters.search) params.set('search', filters.search);
  if (filters.companyId) params.set('companyId', filters.companyId);
  if (filters.userId) params.set('userId', filters.userId);
  if (filters.role) params.set('role', filters.role);
  if (filters.status) params.set('status', filters.status);
  return params;
}

function formatDate(value: string | null | undefined, empty = '—') {
  if (!value) return empty;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return empty;
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatCount(value: number) {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(value);
}

function getRoleLabel(value: string) {
  return ROLE_LABELS[value] || value || '—';
}

function getMembershipStatusLabel(value: string) {
  return MEMBERSHIP_STATUS_LABELS[value] || value || '—';
}

function getAccountStatusLabel(value: string) {
  return ACCOUNT_STATUS_LABELS[value] || value || '—';
}

function getRoleOperationUnavailableReason(membership: MembershipItem) {
  if (membership.status !== 'active') return '成员关系当前不可修改';
  if (membership.user.accountStatus !== 'active') return '用户账号当前不可用';
  if (membership.role !== 'owner' && membership.role !== 'member') return '暂不支持该角色';
  return '';
}

function getStatusOperationUnavailableReason(membership: MembershipItem) {
  if (membership.role !== 'owner' && membership.role !== 'member') return '暂不支持该角色';
  if (!membership.user?.id) return '成员信息当前不可用';
  if (membership.status !== 'active' && membership.status !== 'disabled') return '成员关系当前状态不可修改';
  if (membership.status === 'disabled' && membership.user.accountStatus !== 'active') {
    return '用户账号当前不可用，无法恢复成员关系';
  }
  return '';
}

function getSafeApiError(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback;
  const message = value.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 200);
  return message || fallback;
}

export default function MembershipsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlKey = searchParams.toString();
  const initialFilters = getFiltersFromUrl(new URLSearchParams(urlKey));
  const [filters, setFilters] = useState<MembershipFilters>(initialFilters);
  const [query, setQuery] = useState(initialFilters.search);
  const [data, setData] = useState<MembershipListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [modalKind, setModalKind] = useState<ModalKind>(null);
  const [roleOperation, setRoleOperation] = useState<RoleOperation | null>(null);
  const [statusOperation, setStatusOperation] = useState<StatusOperation | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [operationError, setOperationError] = useState('');
  const requestSequence = useRef(0);
  const operationRequestSequence = useRef(0);
  const operationControllerRef = useRef<AbortController | null>(null);
  const modalOpen = useRef(false);
  const filtersRef = useRef(filters);
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
    filtersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    if (incomingUrlSync.current !== null) {
      const syncedKey = incomingUrlSync.current;
      if (syncedKey === filtersUrlKey) {
        incomingUrlSync.current = null;
        if (urlKey !== filtersUrlKey) {
          router.replace(
            filtersUrlKey ? `/platform-admin/memberships?${filtersUrlKey}` : '/platform-admin/memberships',
          );
        }
      }
      return;
    }

    if (urlKey !== filtersUrlKey) {
      router.push(filtersUrlKey ? `/platform-admin/memberships?${filtersUrlKey}` : '/platform-admin/memberships');
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
    async (signal?: AbortSignal, filtersToLoad: MembershipFilters = filters) => {
      const requestId = ++requestSequence.current;
      setLoading(true);
      setError('');

      try {
        const response = await fetch(`/api/platform-admin/memberships?${toApiParams(filtersToLoad).toString()}`, {
          signal,
        });
        const payload = (await response.json().catch(() => null)) as
          | MembershipListResponse
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

        if (!response.ok || !payload || !Array.isArray((payload as MembershipListResponse).items)) {
          const apiError = typeof (payload as { error?: unknown } | null)?.error === 'string'
            ? (payload as { error: string }).error.slice(0, 200)
            : '企业成员加载失败，请稍后重试';
          throw new Error(apiError);
        }

        if (requestId === requestSequence.current) {
          setData(payload as MembershipListResponse);
        }
      } catch (requestError: unknown) {
        if (signal?.aborted || (requestError instanceof DOMException && requestError.name === 'AbortError')) {
          return;
        }
        if (requestId === requestSequence.current) {
          setError(requestError instanceof Error ? requestError.message : '企业成员加载失败，请稍后重试');
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

  useEffect(() => () => operationControllerRef.current?.abort(), []);

  useEffect(() => {
    if (!data || data.total <= 0 || data.totalPages < 1 || data.page <= data.totalPages) {
      return;
    }

    setFilters((current) => {
      const next = { ...current, page: data.totalPages };
      return filtersEqual(current, next) ? current : next;
    });
  }, [data]);

  const updateFilter = <Key extends keyof MembershipFilters>(key: Key, value: MembershipFilters[Key]) => {
    setFilters((current) => {
      const next = { ...current, page: 1, [key]: value };
      return filtersEqual(current, next) ? current : next;
    });
  };

  const resetFilters = () => {
    setQuery('');
    setFilters(DEFAULT_FILTERS);
  };

  const closeOperation = useCallback(() => {
    operationRequestSequence.current += 1;
    modalOpen.current = false;
    operationControllerRef.current?.abort();
    operationControllerRef.current = null;
    setModalKind(null);
    setRoleOperation(null);
    setStatusOperation(null);
    setReason('');
    setOperationError('');
    setSubmitting(false);
  }, []);

  const openRoleOperation = (membership: MembershipItem) => {
    if (modalOpen.current || modalKind || submitting || getRoleOperationUnavailableReason(membership)) return;
    const targetRole: MembershipRole = membership.role === 'member' ? 'owner' : 'member';
    modalOpen.current = true;
    setSuccessMessage('');
    setReason('');
    setOperationError('');
    setStatusOperation(null);
    setModalKind('role');
    setRoleOperation({ membership, targetRole });
  };

  const openStatusOperation = (membership: MembershipItem) => {
    if (modalOpen.current || modalKind || submitting || getStatusOperationUnavailableReason(membership)) return;
    const targetStatus: MembershipStatus = membership.status === 'active' ? 'disabled' : 'active';
    modalOpen.current = true;
    setSuccessMessage('');
    setReason('');
    setOperationError('');
    setRoleOperation(null);
    setModalKind('status');
    setStatusOperation({ membership, targetStatus });
  };

  const submitRoleOperation = async () => {
    if (!roleOperation || submitting) return;
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 2 || trimmedReason.length > 200) return;

    const requestId = ++operationRequestSequence.current;
    const controller = new AbortController();
    operationControllerRef.current = controller;
    setSubmitting(true);
    setOperationError('');

    try {
      const response = await fetch(
        `/api/platform-admin/memberships/${encodeURIComponent(roleOperation.membership.membershipId)}/role`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: roleOperation.targetRole, reason: trimmedReason }),
          signal: controller.signal,
        },
      );
      const payload = (await response.json().catch(() => null)) as RoleChangeResponse | null;

      if (requestId !== operationRequestSequence.current) return;

      if (response.status === 401) {
        window.location.assign('/auth/login');
        return;
      }
      if (response.status === 403) {
        setOperationError('无平台运营权限');
        return;
      }
      if (response.status === 404) {
        setOperationError('成员关系不存在或已被移除');
        return;
      }
      if (response.status === 400 || response.status === 409) {
        setOperationError(getSafeApiError(payload?.error, '角色修改失败，请检查输入后重试'));
        return;
      }
      if (!response.ok || !payload?.success) {
        setOperationError('角色修改失败，请稍后重试');
        return;
      }

      setSuccessMessage(
        payload.changed === false
          ? '成员角色已经是目标状态'
          : roleOperation.targetRole === 'owner'
            ? '已设为 Owner'
            : '已降为普通成员',
      );
      operationControllerRef.current = null;
      modalOpen.current = false;
      setModalKind(null);
      setRoleOperation(null);
      setStatusOperation(null);
      setReason('');
      setOperationError('');
      setSubmitting(false);
      void load(undefined, filtersRef.current);
    } catch (requestError: unknown) {
      if (controller.signal.aborted || requestId !== operationRequestSequence.current) return;
      setOperationError('角色修改失败，请稍后重试');
    } finally {
      if (requestId === operationRequestSequence.current && !controller.signal.aborted) {
        setSubmitting(false);
        operationControllerRef.current = null;
      }
    }
  };

  const submitStatusOperation = async () => {
    if (!statusOperation || submitting) return;
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 2 || trimmedReason.length > 200) return;

    const requestId = ++operationRequestSequence.current;
    const controller = new AbortController();
    operationControllerRef.current = controller;
    setSubmitting(true);
    setOperationError('');

    try {
      const response = await fetch(
        `/api/platform-admin/memberships/${encodeURIComponent(statusOperation.membership.membershipId)}/status`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: statusOperation.targetStatus, reason: trimmedReason }),
          signal: controller.signal,
        },
      );
      const payload = (await response.json().catch(() => null)) as StatusChangeResponse | null;

      if (requestId !== operationRequestSequence.current) return;

      if (response.status === 401) {
        window.location.assign('/auth/login');
        return;
      }
      if (response.status === 403) {
        setOperationError('无平台运营权限');
        return;
      }
      if (response.status === 404) {
        setOperationError('成员关系不存在或已被移除');
        return;
      }
      if (response.status === 400 || response.status === 409) {
        setOperationError(getSafeApiError(payload?.error, '成员状态修改失败，请检查输入后重试'));
        return;
      }
      if (!response.ok || !payload?.success) {
        setOperationError('成员状态修改失败，请稍后重试');
        return;
      }

      const revokedSessionCount = typeof payload.revokedSessionCount === 'number' && payload.revokedSessionCount > 0
        ? ` 已撤销该成员在当前企业的 ${formatCount(payload.revokedSessionCount)} 个登录会话。`
        : '';
      setSuccessMessage(
        payload.changed === false
          ? '成员状态已经是目标状态'
          : statusOperation.targetStatus === 'disabled'
            ? `成员已停用。${revokedSessionCount}`
            : '成员关系已恢复',
      );
      operationControllerRef.current = null;
      modalOpen.current = false;
      setModalKind(null);
      setRoleOperation(null);
      setStatusOperation(null);
      setReason('');
      setOperationError('');
      setSubmitting(false);
      void load(undefined, filtersRef.current);
    } catch (requestError: unknown) {
      if (controller.signal.aborted || requestId !== operationRequestSequence.current) return;
      setOperationError('成员状态修改失败，请稍后重试');
    } finally {
      if (requestId === operationRequestSequence.current && !controller.signal.aborted) {
        setSubmitting(false);
        operationControllerRef.current = null;
      }
    }
  };

  useEffect(() => {
    if (!modalKind) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeOperation();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeOperation, modalKind]);

  const currentPage = data && data.total > 0 ? Math.min(Math.max(data.page, 1), Math.max(data.totalPages, 1)) : 1;
  const totalPages = Math.max(data?.totalPages || 1, 1);
  const trimmedReasonLength = reason.trim().length;
  const canSubmitRoleOperation = Boolean(
    roleOperation && !submitting && trimmedReasonLength >= 2 && trimmedReasonLength <= 200,
  );
  const canSubmitStatusOperation = Boolean(
    statusOperation && !submitting && trimmedReasonLength >= 2 && trimmedReasonLength <= 200,
  );

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-sky-200">真实数据 · 成员信息查询与企业角色、状态管理</p>
          <h2 className="mt-1 text-2xl font-bold">企业成员</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            查看企库库平台中所有企业的成员关系、企业角色、成员状态、登录状态和使用情况。
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
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <input
            className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm outline-none placeholder:text-slate-500 focus:border-sky-400"
            maxLength={100}
            onChange={(event) => setQuery(event.target.value.slice(0, 100))}
            placeholder="搜索成员、企业或手机号后四位"
            value={query}
          />
          <input
            className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm outline-none placeholder:text-slate-500 focus:border-sky-400"
            maxLength={100}
            onChange={(event) => updateFilter('companyId', event.target.value.slice(0, 100))}
            placeholder="企业 ID"
            value={filters.companyId}
          />
          <input
            className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm outline-none placeholder:text-slate-500 focus:border-sky-400"
            maxLength={100}
            onChange={(event) => updateFilter('userId', event.target.value.slice(0, 100))}
            placeholder="用户 ID"
            value={filters.userId}
          />
          <select
            className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm"
            onChange={(event) => updateFilter('role', event.target.value)}
            value={filters.role}
          >
            <option value="">全部企业角色</option>
            {(data?.filters.roles || []).map((role) => (
              <option key={role} value={role}>
                {getRoleLabel(role)}
              </option>
            ))}
          </select>
          <select
            className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm"
            onChange={(event) => updateFilter('status', event.target.value)}
            value={filters.status}
          >
            <option value="">全部 Membership 状态</option>
            {(data?.filters.statuses || []).map((status) => (
              <option key={status} value={status}>
                {getMembershipStatusLabel(status)}
              </option>
            ))}
          </select>
          <select
            className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm"
            onChange={(event) => updateFilter('sortBy', getSortBy(event.target.value))}
            value={filters.sortBy}
          >
            <option value="createdAt">加入时间</option>
            <option value="updatedAt">更新时间</option>
            <option value="role">企业角色</option>
            <option value="status">Membership 状态</option>
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
          <p className="text-sm text-slate-400">成员关系总数：{data?.total ?? 0}</p>
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

      {successMessage ? (
        <div className="mt-5 rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-4 text-sm text-emerald-100">
          {successMessage}
        </div>
      ) : null}

      {!data && loading ? (
        <div className="mt-5 rounded-2xl border border-white/10 bg-white/10 p-8 text-sm text-slate-400">
          正在加载真实企业成员数据…
        </div>
      ) : null}

      {data ? (
        <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10 bg-white/10">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-xs text-slate-400">
            <span>可调整企业角色与成员状态；不支持删除成员关系或修改用户账号状态</span>
            {loading ? <span>正在按当前条件刷新…</span> : null}
          </div>
          <table className="w-full min-w-[2010px] text-left text-sm">
            <thead className="bg-slate-950/30 text-slate-400">
              <tr>
                {[
                  '成员关系',
                  '企业',
                  '用户',
                  '联系方式',
                  '企业角色',
                  'Membership 状态',
                  '用户账号状态',
                  '最近登录',
                  '企业内有效 Session',
                  '本月个人积分消耗',
                  '邀请信息',
                  '操作',
                ].map((title) => (
                  <th className="p-3 font-medium" key={title}>
                    {title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((membership) => (
                <tr className="border-t border-white/10 align-top" key={membership.membershipId}>
                  <td className="p-3">
                    <p className="max-w-52 break-all font-medium text-slate-100">{membership.membershipId}</p>
                    <p className="mt-1 text-xs text-slate-400">加入：{formatDate(membership.createdAt)}</p>
                    <p className="mt-1 text-xs text-slate-500">更新：{formatDate(membership.updatedAt)}</p>
                  </td>
                  <td className="p-3">
                    <p className="font-medium text-slate-100">{membership.company.name || '未命名企业'}</p>
                    <p className="mt-1 max-w-52 break-all text-xs text-slate-500">{membership.company.id}</p>
                  </td>
                  <td className="p-3">
                    <p className="font-medium text-slate-100">{membership.user.name || '未设置姓名'}</p>
                    <p className="mt-1 max-w-52 break-all text-xs text-slate-500">{membership.user.id}</p>
                  </td>
                  <td className="p-3 text-slate-300">
                    <p>{membership.user.maskedPhone || '未绑定'}</p>
                    <p className="mt-1 text-xs text-slate-400">{membership.user.maskedEmail || '未绑定'}</p>
                  </td>
                  <td className="p-3">
                    <span className="inline-flex rounded-full bg-sky-300/10 px-2 py-0.5 text-xs text-sky-100">
                      {getRoleLabel(membership.role)}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
                      membership.status === 'disabled'
                        ? 'bg-amber-300/10 text-amber-100'
                        : 'bg-emerald-300/10 text-emerald-100'
                    }`}>
                      {getMembershipStatusLabel(membership.status)}
                    </span>
                  </td>
                  <td className="p-3 text-slate-200">{getAccountStatusLabel(membership.user.accountStatus)}</td>
                  <td className="whitespace-nowrap p-3 text-slate-300">
                    {formatDate(membership.user.lastLoginAt, '从未登录')}
                  </td>
                  <td className="p-3 text-slate-200">
                    {membership.activeCompanySessionCount === null
                      ? '暂无可靠数据'
                      : `${formatCount(membership.activeCompanySessionCount)} 个`}
                  </td>
                  <td className="p-3 text-slate-200">
                    {membership.currentMonthCreditsUsed === null
                      ? '暂无可靠数据'
                      : `${formatCount(membership.currentMonthCreditsUsed)} 积分`}
                  </td>
                  <td className="p-3 text-slate-300">
                    {membership.invitation
                      ? `${membership.invitation.inviterName || '未设置姓名'} · ${membership.invitation.inviterId}`
                      : '暂无可靠邀请记录'}
                  </td>
                  <td className="p-3">
                    {(() => {
                      const roleUnavailableReason = getRoleOperationUnavailableReason(membership);
                      const statusUnavailableReason = getStatusOperationUnavailableReason(membership);
                      const supportsRole = membership.role === 'owner' || membership.role === 'member';
                      const supportsStatus = membership.status === 'active' || membership.status === 'disabled';
                      const isOwner = membership.role === 'owner';
                      const isDisabled = membership.status === 'disabled';
                      return (
                        <div className="min-w-36 space-y-2">
                          <div>
                            <p className="mb-1 text-[11px] text-slate-500">角色管理</p>
                            {supportsRole ? (
                              <button
                                className={`whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-45 ${
                                  isOwner
                                    ? 'border-amber-300/25 bg-amber-300/10 text-amber-100 hover:bg-amber-300/15'
                                    : 'border-sky-300/25 bg-sky-300/10 text-sky-100 hover:bg-sky-300/15'
                                }`}
                                disabled={Boolean(roleUnavailableReason) || submitting}
                                onClick={() => openRoleOperation(membership)}
                                title={roleUnavailableReason || undefined}
                              >
                                {isOwner ? '降为成员' : '设为 Owner'}
                              </button>
                            ) : (
                              <span className="text-xs text-slate-500">暂不支持修改</span>
                            )}
                            {roleUnavailableReason ? <p className="mt-1 max-w-36 text-xs text-slate-500">{roleUnavailableReason}</p> : null}
                          </div>
                          <div>
                            <p className="mb-1 text-[11px] text-slate-500">成员状态</p>
                            {supportsStatus ? (
                              <button
                                className={`whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-45 ${
                                  isDisabled
                                    ? 'border-sky-300/25 bg-sky-300/10 text-sky-100 hover:bg-sky-300/15'
                                    : 'border-amber-300/25 bg-amber-300/10 text-amber-100 hover:bg-amber-300/15'
                                }`}
                                disabled={Boolean(statusUnavailableReason) || submitting}
                                onClick={() => openStatusOperation(membership)}
                                title={statusUnavailableReason || undefined}
                              >
                                {isDisabled ? '恢复成员' : '停用成员'}
                              </button>
                            ) : (
                              <span className="text-xs text-slate-500">状态暂不支持修改</span>
                            )}
                            {statusUnavailableReason ? <p className="mt-1 max-w-36 text-xs text-slate-500">{statusUnavailableReason}</p> : null}
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && data.items.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">当前条件下没有成员关系数据</div>
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
          第 {currentPage} / {totalPages} 页 · 共 {data?.total ?? 0} 条成员关系
        </span>
        <button
          className="rounded-lg bg-white/10 px-3 py-2 transition hover:bg-white/15 disabled:opacity-40"
          disabled={!data || currentPage >= totalPages || loading}
          onClick={() => setFilters((current) => ({ ...current, page: currentPage + 1 }))}
        >
          下一页
        </button>
      </div>

      {modalKind === 'role' && roleOperation ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
          onClick={closeOperation}
          role="dialog"
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={`text-xs font-medium ${roleOperation.targetRole === 'member' ? 'text-amber-200' : 'text-sky-200'}`}>
                  企业角色调整
                </p>
                <h3 className="mt-1 text-xl font-bold text-white">
                  {roleOperation.targetRole === 'owner' ? '确认将该成员设为企业 Owner？' : '确认将该 Owner 降为普通成员？'}
                </h3>
              </div>
              <button
                aria-label="关闭角色修改弹窗"
                className="rounded-lg px-2 py-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
                onClick={closeOperation}
                type="button"
              >
                ×
              </button>
            </div>

            <p className="mt-3 text-sm leading-6 text-slate-300">
              {roleOperation.targetRole === 'owner'
                ? 'Owner 可在企业后台执行更高权限的企业管理操作。'
                : '系统会保护企业最后一个有效 Owner。如果该成员是最后一个有效 Owner，操作将被拒绝。'}
            </p>

            <dl className="mt-5 grid gap-3 rounded-xl border border-white/10 bg-white/5 p-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500">用户</dt>
                <dd className="mt-1 break-all text-slate-100">{roleOperation.membership.user.name || '未设置姓名'}</dd>
                <dd className="mt-1 break-all text-xs text-slate-400">{roleOperation.membership.user.id}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">企业</dt>
                <dd className="mt-1 break-all text-slate-100">{roleOperation.membership.company.name || '未命名企业'}</dd>
                <dd className="mt-1 break-all text-xs text-slate-400">{roleOperation.membership.company.id}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">当前角色</dt>
                <dd className="mt-1 text-slate-100">{getRoleLabel(roleOperation.membership.role)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">目标角色</dt>
                <dd className="mt-1 text-slate-100">{getRoleLabel(roleOperation.targetRole)}</dd>
              </div>
            </dl>

            <label className="mt-5 block text-sm font-medium text-slate-200" htmlFor="membership-role-reason">
              操作原因
            </label>
            <textarea
              className="mt-2 min-h-24 w-full resize-y rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-400 disabled:opacity-60"
              disabled={submitting}
              id="membership-role-reason"
              maxLength={200}
              onChange={(event) => setReason(event.target.value)}
              placeholder="组织角色调整、Owner职责变更等"
              value={reason}
            />
            <div className="mt-1 flex justify-between text-xs">
              <span className={trimmedReasonLength > 0 && trimmedReasonLength < 2 ? 'text-amber-200' : 'text-slate-500'}>
                操作原因需为 2–200 个字符
              </span>
              <span className={reason.length >= 200 ? 'text-amber-200' : 'text-slate-500'}>{reason.length}/200</span>
            </div>

            {operationError ? (
              <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">
                {operationError}
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                className="rounded-lg px-4 py-2 text-sm text-slate-300 transition hover:bg-white/10"
                onClick={closeOperation}
                type="button"
              >
                {submitting ? '取消并停止' : '取消'}
              </button>
              <button
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-45 ${
                  roleOperation.targetRole === 'member'
                    ? 'bg-amber-500/80 hover:bg-amber-500'
                    : 'bg-sky-500/80 hover:bg-sky-500'
                }`}
                disabled={!canSubmitRoleOperation}
                onClick={() => void submitRoleOperation()}
                type="button"
              >
                {submitting
                  ? '处理中…'
                  : roleOperation.targetRole === 'owner'
                    ? '确认设为 Owner'
                    : '确认降为成员'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {modalKind === 'status' && statusOperation ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
          onClick={closeOperation}
          role="dialog"
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={`text-xs font-medium ${statusOperation.targetStatus === 'disabled' ? 'text-amber-200' : 'text-sky-200'}`}>
                  企业成员状态调整
                </p>
                <h3 className="mt-1 text-xl font-bold text-white">
                  {statusOperation.targetStatus === 'disabled' ? '确认停用该企业成员？' : '确认恢复该企业成员？'}
                </h3>
              </div>
              <button
                aria-label="关闭成员状态修改弹窗"
                className="rounded-lg px-2 py-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
                onClick={closeOperation}
                type="button"
              >
                ×
              </button>
            </div>

            <p className="mt-3 text-sm leading-6 text-slate-300">
              {statusOperation.targetStatus === 'disabled'
                ? '停用后，该成员将无法继续访问当前企业，其属于该企业的登录会话会被撤销。用户账号及其在其他企业的成员关系不受影响。'
                : '恢复后，该成员可以重新登录或重新选择当前企业。系统不会自动创建登录会话。'}
            </p>
            {statusOperation.targetStatus === 'disabled' && statusOperation.membership.role === 'owner' ? (
              <p className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-sm leading-6 text-amber-100">
                系统将在服务端检查该成员是否为企业最后一个有效 Owner。最后一个有效 Owner 不允许停用。
              </p>
            ) : null}

            <dl className="mt-5 grid gap-3 rounded-xl border border-white/10 bg-white/5 p-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500">用户</dt>
                <dd className="mt-1 break-all text-slate-100">{statusOperation.membership.user.name || '未设置姓名'}</dd>
                <dd className="mt-1 break-all text-xs text-slate-400">{statusOperation.membership.user.id}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">企业</dt>
                <dd className="mt-1 break-all text-slate-100">{statusOperation.membership.company.name || '未命名企业'}</dd>
                <dd className="mt-1 break-all text-xs text-slate-400">{statusOperation.membership.company.id}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">企业角色</dt>
                <dd className="mt-1 text-slate-100">{getRoleLabel(statusOperation.membership.role)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">当前状态</dt>
                <dd className="mt-1 text-slate-100">{getMembershipStatusLabel(statusOperation.membership.status)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">目标状态</dt>
                <dd className="mt-1 text-slate-100">{getMembershipStatusLabel(statusOperation.targetStatus)}</dd>
              </div>
            </dl>

            <label className="mt-5 block text-sm font-medium text-slate-200" htmlFor="membership-status-reason">
              操作原因
            </label>
            <textarea
              className="mt-2 min-h-24 w-full resize-y rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-400 disabled:opacity-60"
              disabled={submitting}
              id="membership-status-reason"
              maxLength={200}
              onChange={(event) => setReason(event.target.value)}
              placeholder={statusOperation.targetStatus === 'disabled' ? '成员离职、暂停企业权限、组织调整等' : '恢复企业权限、成员重新入职等'}
              value={reason}
            />
            <div className="mt-1 flex justify-between text-xs">
              <span className={trimmedReasonLength > 0 && trimmedReasonLength < 2 ? 'text-amber-200' : 'text-slate-500'}>
                操作原因需为 2–200 个字符
              </span>
              <span className={reason.length >= 200 ? 'text-amber-200' : 'text-slate-500'}>{reason.length}/200</span>
            </div>

            {operationError ? (
              <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">
                {operationError}
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                className="rounded-lg px-4 py-2 text-sm text-slate-300 transition hover:bg-white/10"
                onClick={closeOperation}
                type="button"
              >
                {submitting ? '取消并停止' : '取消'}
              </button>
              <button
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-45 ${
                  statusOperation.targetStatus === 'disabled'
                    ? 'bg-amber-500/80 hover:bg-amber-500'
                    : 'bg-sky-500/80 hover:bg-sky-500'
                }`}
                disabled={!canSubmitStatusOperation}
                onClick={() => void submitStatusOperation()}
                type="button"
              >
                {submitting
                  ? '处理中…'
                  : statusOperation.targetStatus === 'disabled'
                    ? '确认停用成员'
                    : '确认恢复成员'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
