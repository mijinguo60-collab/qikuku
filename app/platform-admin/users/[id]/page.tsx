'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

type UserStatus = 'active' | 'disabled' | 'deleted';
type StatusAction = 'active' | 'disabled';
type ModalKind = 'status' | 'sessions' | 'platformRole' | null;

type UserDetailResponse = {
  user: {
    id: string;
    name: string | null;
    maskedPhone: string;
    maskedEmail: string;
    status: unknown;
    role: unknown;
    avatar: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    lastLoginAt: string | null;
    phoneVerifiedAt: string | null;
  };
  identities: Array<{
    id: string;
    provider: string;
    bound: boolean;
    createdAt: string | null;
    updatedAt: string | null;
  }>;
  memberships: Array<{
    membershipId: string;
    companyId: string;
    companyName: string;
    role: string;
    status: string;
    createdAt: string | null;
    updatedAt: string | null;
  }>;
  sessions: Array<{
    id: string;
    activeCompanyId: string | null;
    createdAt: string | null;
    expiresAt: string | null;
    active: boolean;
  }>;
  stats: Record<string, number | null>;
};

type StatusActionResponse = {
  success?: boolean;
  unchanged?: boolean;
  revokedSessionCount?: number;
  user?: { id?: string; status?: string };
  error?: string;
};

type SessionRevokeResponse = {
  success?: boolean;
  unchanged?: boolean;
  revokedSessionCount?: number;
  error?: string;
};

type PlatformRoleResponse = {
  success?: boolean;
  unchanged?: boolean;
  user?: { id?: string; role?: string };
  error?: string;
};

const STATUS_LABELS: Record<UserStatus, string> = {
  active: '正常',
  disabled: '已禁用',
  deleted: '已删除',
};

const SELF_LOGOUT_CONFIRMATION = '退出我的全部会话';

function getUserStatus(value: unknown): UserStatus | null {
  return value === 'active' || value === 'disabled' || value === 'deleted' ? value : null;
}

function getStatusLabel(value: unknown) {
  const status = getUserStatus(value);
  return status ? STATUS_LABELS[status] : '未知状态';
}

function getRoleLabel(value: unknown) {
  return value === 'platform_super_admin' ? '平台超级管理员' : '普通用户';
}

function formatDate(value: string | null, emptyLabel = '暂无可靠数据') {
  if (!value) return emptyLabel;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return emptyLabel;

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function getReturnPage(value: string | null) {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

function getReturnPageSize(value: string | null) {
  const pageSize = Number(value);
  return pageSize === 20 || pageSize === 50 || pageSize === 100 ? pageSize : 20;
}

function getReturnSearch(value: string | null) {
  return value && value.length <= 100 ? value : '';
}

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const userId = typeof params.id === 'string' ? params.id : '';
  const rawReturnPage = searchParams.get('returnPage');
  const rawReturnPageSize = searchParams.get('returnPageSize');
  const rawReturnSearch = searchParams.get('returnSearch');
  const returnPage = getReturnPage(rawReturnPage);
  const returnPageSize = getReturnPageSize(rawReturnPageSize);
  const returnSearch = getReturnSearch(rawReturnSearch);
  const returnParams = new URLSearchParams({
    page: String(returnPage),
    pageSize: String(returnPageSize),
  });

  if (returnSearch) {
    returnParams.set('search', returnSearch);
  }

  const hasReturnContext =
    rawReturnPage !== null || rawReturnPageSize !== null || rawReturnSearch !== null;
  const returnHref = hasReturnContext
    ? `/platform-admin/users?${returnParams.toString()}`
    : '/platform-admin/users';
  const [data, setData] = useState<UserDetailResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalKind, setModalKind] = useState<ModalKind>(null);
  const [reason, setReason] = useState('');
  const [selfLogoutConfirmation, setSelfLogoutConfirmation] = useState('');
  const [selfLogoutConfirming, setSelfLogoutConfirming] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const requestSequence = useRef(0);

  const load = useCallback(
    async (signal?: AbortSignal, showLoading = true) => {
      const requestId = ++requestSequence.current;
      if (showLoading) {
        setLoading(true);
        setError('');
      }

      try {
        const response = await fetch(
          `/api/platform-admin/users/${encodeURIComponent(userId)}`,
          { signal },
        );
        const payload = (await response.json()) as UserDetailResponse;

        if (!response.ok) {
          throw new Error(String(response.status));
        }

        if (requestId === requestSequence.current) {
          setData(payload);
        }
      } catch (requestError: unknown) {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') {
          return;
        }

        if (requestId === requestSequence.current) {
          const message = requestError instanceof Error ? requestError.message : '';
          setError(
            message === '404'
              ? '用户不存在'
              : message === '403'
                ? '无平台运营权限'
                : message === '401'
                  ? '未登录'
                  : '用户详情加载失败',
          );
        }
      } finally {
        if (showLoading && requestId === requestSequence.current && !signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [userId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);

    return () => {
      controller.abort();
    };
  }, [load]);

  const closeModal = useCallback(() => {
    if (submitting) return;
    setModalKind(null);
    setReason('');
    setSelfLogoutConfirmation('');
    setSelfLogoutConfirming(false);
    setActionError('');
  }, [submitting]);

  useEffect(() => {
    if (!modalKind || submitting) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeModal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeModal, modalKind, submitting]);

  const currentStatus = data ? getUserStatus(data.user.status) : null;
  const targetStatus: StatusAction | null =
    currentStatus === 'active' ? 'disabled' : currentStatus === 'disabled' ? 'active' : null;
  const trimmedReason = reason.trim();
  const reasonIsValid = trimmedReason.length >= 2 && trimmedReason.length <= 200;
  const actionLabel = targetStatus === 'disabled' ? '禁用用户' : '恢复用户';
  const activeSessionCount =
    typeof data?.stats.activeSessionCount === 'number' &&
    Number.isFinite(data.stats.activeSessionCount) &&
    data.stats.activeSessionCount >= 0
      ? data.stats.activeSessionCount
      : data?.sessions.filter((session) => session.active).length ?? 0;
  const selfLogoutConfirmationIsValid =
    selfLogoutConfirmation === SELF_LOGOUT_CONFIRMATION;
  const isPlatformAdmin = data?.user.role === 'platform_super_admin';
  const platformRoleAction = isPlatformAdmin ? 'revoke' : 'grant';
  const platformRoleActionDisabled =
    submitting ||
    currentStatus === 'deleted' ||
    (platformRoleAction === 'grant' && currentStatus !== 'active');

  const submitStatusChange = async () => {
    if (!data || !targetStatus || !reasonIsValid || submitting) return;

    setSubmitting(true);
    setActionError('');
    setActionNotice('');

    try {
      const response = await fetch(
        `/api/platform-admin/users/${encodeURIComponent(data.user.id)}/status`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: targetStatus, reason: trimmedReason }),
        },
      );
      const payload = (await response.json().catch(() => null)) as StatusActionResponse | null;

      if (response.status === 401) {
        window.location.assign('/auth/login');
        return;
      }

      if (!response.ok || payload?.success !== true) {
        if (response.status === 403) {
          throw new Error('无平台运营权限');
        }
        if (response.status === 400 && typeof payload?.error === 'string') {
          throw new Error(payload.error.slice(0, 200));
        }
        throw new Error('操作失败，请稍后重试');
      }

      setModalKind(null);
      setReason('');
      setActionNotice(
        payload.unchanged
          ? '用户状态未发生变化'
          : targetStatus === 'disabled'
            ? `用户已禁用${typeof payload.revokedSessionCount === 'number' ? `，已撤销 ${payload.revokedSessionCount} 个登录会话` : ''}`
            : '用户已恢复',
      );
      await load(undefined, false);
    } catch (requestError: unknown) {
      setActionError(
        requestError instanceof Error && requestError.message
          ? requestError.message
          : '操作失败，请稍后重试',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const submitSessionRevoke = async (confirmSelfLogout = false) => {
    if (!data || !reasonIsValid || submitting) return;
    if (confirmSelfLogout && !selfLogoutConfirmationIsValid) return;

    setSubmitting(true);
    setActionError('');
    setActionNotice('');

    try {
      const response = await fetch(
        `/api/platform-admin/users/${encodeURIComponent(data.user.id)}/sessions`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reason: trimmedReason,
            ...(confirmSelfLogout ? { confirmSelfLogout: true } : {}),
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as SessionRevokeResponse | null;

      if (response.status === 401) {
        window.location.assign('/auth/login');
        return;
      }

      if (!response.ok || payload?.success !== true) {
        if (response.status === 403) {
          throw new Error('无平台运营权限');
        }
        if (response.status === 404) {
          throw new Error('用户不存在');
        }
        if (response.status === 400 && typeof payload?.error === 'string') {
          if (payload.error === '需要明确确认退出当前管理员的全部会话') {
            setSelfLogoutConfirming(true);
            return;
          }
          throw new Error(payload.error.slice(0, 200));
        }
        throw new Error('强制退出失败，请稍后重试');
      }

      if (confirmSelfLogout) {
        setModalKind(null);
        setData(null);
        window.location.assign('/auth/login?notice=session-revoked');
        return;
      }

      setModalKind(null);
      setReason('');
      setSelfLogoutConfirmation('');
      setSelfLogoutConfirming(false);
      setActionNotice(
        payload.unchanged || payload.revokedSessionCount === 0
          ? '该用户当前没有有效登录会话'
          : `已强制退出 ${payload.revokedSessionCount} 个登录会话`,
      );
      await load(undefined, false);
    } catch (requestError: unknown) {
      setActionError(
        requestError instanceof Error && requestError.message
          ? requestError.message
          : '强制退出失败，请稍后重试',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const submitPlatformRoleChange = async () => {
    if (!data || !reasonIsValid || submitting || platformRoleActionDisabled) return;

    setSubmitting(true);
    setActionError('');
    setActionNotice('');

    try {
      const response = await fetch(
        `/api/platform-admin/users/${encodeURIComponent(data.user.id)}/platform-role`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            isPlatformAdmin: platformRoleAction === 'grant',
            reason: trimmedReason,
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as PlatformRoleResponse | null;

      if (response.status === 401) {
        window.location.assign('/auth/login');
        return;
      }

      if (!response.ok || payload?.success !== true) {
        if (response.status === 403) {
          throw new Error('无平台运营权限');
        }
        if (response.status === 404) {
          throw new Error('用户不存在');
        }
        if (response.status === 409) {
          throw new Error('无法安全确定该用户授权前的角色，已拒绝撤销');
        }
        if (response.status === 400 && typeof payload?.error === 'string') {
          throw new Error(payload.error.slice(0, 200));
        }
        throw new Error('平台角色操作失败，请稍后重试');
      }

      setModalKind(null);
      setReason('');
      setActionNotice(
        payload.unchanged
          ? '平台角色未发生变化'
          : platformRoleAction === 'grant'
            ? '已授予平台管理员权限'
            : '已撤销平台管理员权限',
      );
      await load(undefined, false);
    } catch (requestError: unknown) {
      setActionError(
        requestError instanceof Error && requestError.message
          ? requestError.message
          : '平台角色操作失败，请稍后重试',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p>加载中…</p>;
  }

  if (error && !data) {
    return (
      <section>
        <h2 className="text-2xl font-bold">{error}</h2>
        <Link href={returnHref} className="mt-4 inline-block underline">
          返回用户列表
        </Link>
        {error === '用户详情加载失败' && (
          <button onClick={() => void load()} className="ml-4 underline">
            重新加载
          </button>
        )}
      </section>
    );
  }

  if (!data) {
    return null;
  }

  const { user } = data;
  const basicRows = [
    `姓名：${user.name || '未设置姓名'}`,
    `用户 ID：${user.id}`,
    `手机号：${user.maskedPhone}`,
    `邮箱：${user.maskedEmail}`,
    `注册时间：${formatDate(user.createdAt)}`,
    `更新时间：${formatDate(user.updatedAt)}`,
    `最近登录：${formatDate(user.lastLoginAt, '从未登录')}`,
    `手机验证：${formatDate(user.phoneVerifiedAt, '未验证')}`,
  ];

  return (
    <section>
      <Link href={returnHref} className="text-sm text-slate-400">
        返回用户列表
      </Link>
      <h2 className="mt-4 text-2xl font-bold">用户详情</h2>
      <p className="text-slate-400">
        {user.name || '未设置姓名'} · {user.id}
      </p>

      {error && <p className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
      {actionNotice && (
        <p className="mt-4 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-200">
          {actionNotice}
        </p>
      )}

      <DetailBlock title="基本资料" rows={basicRows} />
      <section className="mt-4 rounded-2xl bg-white/10 p-5">
        <h3 className="font-bold">账号状态和平台角色</h3>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-300">
          <span>账号状态：{getStatusLabel(user.status)}</span>
          <span>平台角色：{getRoleLabel(user.role)}</span>
          {currentStatus === 'deleted' ? (
            <span className="text-amber-200">该用户已删除，无法通过此处恢复</span>
          ) : targetStatus ? (
            <button
              type="button"
              onClick={() => {
                setActionError('');
                setActionNotice('');
                setModalKind('status');
              }}
              disabled={submitting}
              className={
                targetStatus === 'disabled'
                  ? 'rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2 text-red-100 transition hover:bg-red-400/20 disabled:opacity-50'
                  : 'rounded-lg bg-white/15 px-3 py-2 text-white transition hover:bg-white/20 disabled:opacity-50'
              }
            >
              {actionLabel}
            </button>
          ) : null}
          <div className="flex flex-col items-start gap-1">
            <button
              type="button"
              onClick={() => {
                setActionError('');
                setActionNotice('');
                setModalKind('platformRole');
              }}
              disabled={platformRoleActionDisabled}
              className={
                platformRoleAction === 'grant'
                  ? 'rounded-lg bg-sky-300 px-3 py-2 text-slate-950 transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-50'
                  : 'rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-amber-50 transition hover:bg-amber-300/20 disabled:cursor-not-allowed disabled:opacity-50'
              }
            >
              {platformRoleAction === 'grant' ? '授予平台管理员' : '撤销平台管理员'}
            </button>
            {currentStatus === 'deleted' && (
              <p className="text-xs text-slate-400">该用户已删除，无法修改平台权限。</p>
            )}
            {platformRoleAction === 'grant' && currentStatus === 'disabled' && (
              <p className="text-xs text-slate-400">只有正常状态用户可以被授予平台管理员权限。</p>
            )}
          </div>
        </div>
      </section>

      <DetailBlock
        title="数据统计"
        rows={Object.entries(data.stats).map(([key, value]) => `${key}：${value ?? '暂无可靠数据'}`)}
      />
      <DetailBlock
        title="认证身份"
        rows={data.identities.map((identity) =>
          `${identity.provider} · 已绑定 · ${formatDate(identity.createdAt)}`,
        )}
        emptyLabel="暂无认证身份"
      />
      <DetailBlock
        title="所属企业"
        rows={data.memberships.map((membership) =>
          `${membership.companyName} · ${membership.companyId} · ${membership.role} · ${membership.status}`,
        )}
        emptyLabel="该用户尚未加入企业。"
      />
      <section className="mt-4 overflow-x-auto rounded-2xl bg-white/10 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold">登录 Session</h3>
            <p className="mt-1 text-sm text-slate-300">当前有效会话：{activeSessionCount} 个</p>
          </div>
          <div>
            <button
              type="button"
              disabled={
                submitting || currentStatus === 'deleted' || activeSessionCount === 0
              }
              onClick={() => {
                setActionError('');
                setActionNotice('');
                setSelfLogoutConfirmation('');
                setSelfLogoutConfirming(false);
                setModalKind('sessions');
              }}
              className="rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-sm text-amber-50 transition hover:bg-amber-300/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              强制退出全部会话
            </button>
            {activeSessionCount === 0 && currentStatus !== 'deleted' && (
              <p className="mt-2 text-xs text-slate-400">当前没有有效登录会话</p>
            )}
            {currentStatus === 'deleted' && (
              <p className="mt-2 text-xs text-slate-400">该用户已删除，无法撤销会话</p>
            )}
          </div>
        </div>
        {data.sessions.length ? (
          <div className="mt-3 min-w-[600px] space-y-2 text-sm text-slate-300">
            {data.sessions.map((session) => (
              <p key={session.id}>
                {session.id} · {session.active ? '有效' : '已过期'} · {formatDate(session.expiresAt)}
              </p>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-400">暂无登录 Session</p>
        )}
      </section>

      {modalKind === 'status' && targetStatus && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          role="presentation"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-status-dialog-title"
            className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl"
          >
            <h3 id="user-status-dialog-title" className="text-xl font-bold">
              {targetStatus === 'disabled' ? '确认禁用用户' : '确认恢复用户'}
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              {targetStatus === 'disabled'
                ? '禁用后，该用户的全部登录 Session 将立即失效，但不会删除用户、企业关系或业务数据。'
                : '恢复后允许用户重新登录，但不会自动创建新的 Session。'}
            </p>
            <dl className="mt-5 space-y-2 rounded-xl bg-white/5 p-4 text-sm text-slate-300">
              <div className="flex justify-between gap-4">
                <dt>用户姓名</dt>
                <dd>{user.name || '未设置姓名'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>用户 ID</dt>
                <dd className="break-all text-right">{user.id}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>当前状态</dt>
                <dd>{getStatusLabel(currentStatus)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>目标状态</dt>
                <dd>{getStatusLabel(targetStatus)}</dd>
              </div>
            </dl>
            <label className="mt-5 block text-sm font-medium" htmlFor="status-change-reason">
              操作原因
            </label>
            <textarea
              id="status-change-reason"
              value={reason}
              maxLength={200}
              disabled={submitting}
              onChange={(event) => setReason(event.target.value)}
              placeholder="请填写本次操作原因"
              className="mt-2 min-h-28 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm outline-none ring-sky-300/50 focus:ring-2 disabled:opacity-60"
            />
            <p className="mt-2 text-right text-xs text-slate-400">{reason.length}/200</p>
            {actionError && <p className="mt-3 text-sm text-red-200">{actionError}</p>}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeModal}
                disabled={submitting}
                className="rounded-lg bg-white/10 px-4 py-2 text-sm disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void submitStatusChange()}
                disabled={!reasonIsValid || submitting}
                className={
                  targetStatus === 'disabled'
                    ? 'rounded-lg bg-red-400/80 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-50'
                    : 'rounded-lg bg-sky-300 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-50'
                }
              >
                {submitting ? '提交中…' : targetStatus === 'disabled' ? '确认禁用' : '确认恢复'}
              </button>
            </div>
          </section>
        </div>
      )}

      {modalKind === 'sessions' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          role="presentation"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="revoke-sessions-dialog-title"
            className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl"
          >
            <h3 id="revoke-sessions-dialog-title" className="text-xl font-bold">
              确认强制退出全部会话
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              执行后，该用户当前所有登录会话将立即失效，需要重新登录。此操作不会删除用户、企业关系或业务数据。
            </p>
            <dl className="mt-5 space-y-2 rounded-xl bg-white/5 p-4 text-sm text-slate-300">
              <div className="flex justify-between gap-4">
                <dt>用户姓名</dt>
                <dd>{user.name || '未设置姓名'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>用户 ID</dt>
                <dd className="break-all text-right">{user.id}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>当前有效会话</dt>
                <dd>{activeSessionCount} 个</dd>
              </div>
            </dl>
            {selfLogoutConfirming && (
              <div className="mt-5 rounded-xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-50">
                <p className="font-medium">你正在退出当前管理员账号的全部会话。</p>
                <p className="mt-1 leading-6">操作完成后，你将立即退出平台后台并需要重新登录。</p>
                <label className="mt-4 block font-medium" htmlFor="self-logout-confirmation">
                  请输入“{SELF_LOGOUT_CONFIRMATION}”以继续
                </label>
                <input
                  id="self-logout-confirmation"
                  value={selfLogoutConfirmation}
                  disabled={submitting}
                  onChange={(event) => setSelfLogoutConfirmation(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-amber-200/30 bg-slate-950 px-3 py-2 text-sm outline-none ring-amber-200/50 focus:ring-2 disabled:opacity-60"
                />
              </div>
            )}
            <label className="mt-5 block text-sm font-medium" htmlFor="revoke-sessions-reason">
              操作原因
            </label>
            <textarea
              id="revoke-sessions-reason"
              value={reason}
              maxLength={200}
              disabled={submitting}
              onChange={(event) => setReason(event.target.value)}
              placeholder="请填写本次操作原因"
              className="mt-2 min-h-28 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm outline-none ring-amber-200/50 focus:ring-2 disabled:opacity-60"
            />
            <p className="mt-2 text-right text-xs text-slate-400">{reason.length}/200</p>
            {actionError && <p className="mt-3 text-sm text-red-200">{actionError}</p>}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeModal}
                disabled={submitting}
                className="rounded-lg bg-white/10 px-4 py-2 text-sm disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void submitSessionRevoke(selfLogoutConfirming)}
                disabled={
                  !reasonIsValid ||
                  submitting ||
                  (selfLogoutConfirming && !selfLogoutConfirmationIsValid)
                }
                className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-50"
              >
                {submitting
                  ? '提交中…'
                  : selfLogoutConfirming
                    ? '确认退出我的全部会话'
                    : '确认退出'}
              </button>
            </div>
          </section>
        </div>
      )}

      {modalKind === 'platformRole' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          role="presentation"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="platform-role-dialog-title"
            className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl"
          >
            <h3 id="platform-role-dialog-title" className="text-xl font-bold">
              {platformRoleAction === 'grant'
                ? '确认授予平台管理员权限'
                : '确认撤销平台管理员权限'}
            </h3>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              {platformRoleAction === 'grant'
                ? '授予后，该用户将可以访问企库库平台运营后台，包括用户、企业、套餐、订单和系统管理功能。此操作不会修改其企业成员角色。'
                : '撤销后，该用户将不能继续访问平台运营后台，但其普通登录状态、企业成员关系和企业角色不会被修改。'}
            </p>
            <dl className="mt-5 space-y-2 rounded-xl bg-white/5 p-4 text-sm text-slate-300">
              <div className="flex justify-between gap-4">
                <dt>用户姓名</dt>
                <dd>{user.name || '未设置姓名'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>用户 ID</dt>
                <dd className="break-all text-right">{user.id}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>当前平台角色</dt>
                <dd>{getRoleLabel(user.role)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>目标平台角色</dt>
                <dd>
                  {platformRoleAction === 'grant'
                    ? '平台超级管理员'
                    : '由服务端根据最近一次真实授权审计安全恢复'}
                </dd>
              </div>
            </dl>
            {platformRoleAction === 'grant' ? (
              <p className="mt-4 rounded-xl border border-sky-300/30 bg-sky-300/10 p-3 text-sm leading-6 text-sky-50">
                平台管理员拥有平台运营后台的高权限访问能力，请确认授权对象和操作原因。
              </p>
            ) : (
              <p className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm leading-6 text-amber-50">
                如果服务端无法安全确定授权前的原始角色，将拒绝撤销；前端不会猜测或填写恢复角色。
              </p>
            )}
            <label className="mt-5 block text-sm font-medium" htmlFor="platform-role-reason">
              操作原因
            </label>
            <textarea
              id="platform-role-reason"
              value={reason}
              maxLength={200}
              disabled={submitting}
              onChange={(event) => setReason(event.target.value)}
              placeholder="请填写本次操作原因"
              className="mt-2 min-h-28 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm outline-none ring-sky-300/50 focus:ring-2 disabled:opacity-60"
            />
            <p className="mt-2 text-right text-xs text-slate-400">{reason.length}/200</p>
            {actionError && <p className="mt-3 text-sm text-red-200">{actionError}</p>}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeModal}
                disabled={submitting}
                className="rounded-lg bg-white/10 px-4 py-2 text-sm disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void submitPlatformRoleChange()}
                disabled={!reasonIsValid || submitting || platformRoleActionDisabled}
                className={
                  platformRoleAction === 'grant'
                    ? 'rounded-lg bg-sky-300 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-50'
                    : 'rounded-lg bg-amber-300 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-50'
                }
              >
                {submitting
                  ? '提交中…'
                  : platformRoleAction === 'grant'
                    ? '确认授权'
                    : '确认撤销'}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function DetailBlock({
  title,
  rows,
  emptyLabel = '暂无可靠数据',
}: {
  title: string;
  rows: string[];
  emptyLabel?: string;
}) {
  return (
    <div className="mt-4 overflow-x-auto rounded-2xl bg-white/10 p-5">
      <h3 className="font-bold">{title}</h3>
      {rows.length ? (
        <div className="mt-3 min-w-[600px] space-y-2 text-sm text-slate-300">
          {rows.map((row) => (
            <p key={row}>{row}</p>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-400">{emptyLabel}</p>
      )}
    </div>
  );
}
