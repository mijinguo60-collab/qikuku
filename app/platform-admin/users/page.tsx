'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

type UserListItem = {
  id: string;
  name: string;
  maskedPhone: string;
  maskedEmail: string;
  status: string;
  role: string;
  identityProviders: string[];
  companyCount: number;
  activeSessionCount: number;
  lastLoginAt: string | null;
  createdAt: string;
};

type UserListData = {
  items: UserListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const PAGE_SIZES = [20, 50, 100] as const;

function getPage(value: string | null) {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

function getPageSize(value: string | null) {
  const pageSize = Number(value);
  return pageSize === 20 || pageSize === 50 || pageSize === 100 ? pageSize : 20;
}

function getSearch(value: string | null) {
  return value && value.length <= 100 ? value : '';
}

function formatDate(value: string | null, empty = '从未登录') {
  return value
    ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value),
      )
    : empty;
}

function getStatusLabel(value: string) {
  return { active: '正常', disabled: '已禁用', deleted: '已删除' }[value] || value;
}

function getRoleLabel(value: string) {
  return value === 'platform_super_admin' ? '平台超级管理员' : '普通用户';
}

export default function UsersPage() {
  const urlSearchParams = useSearchParams();
  const initialPage = getPage(urlSearchParams.get('page'));
  const initialPageSize = getPageSize(urlSearchParams.get('pageSize'));
  const initialSearch = getSearch(urlSearchParams.get('search'));
  const [data, setData] = useState<UserListData | null>(null);
  const [query, setQuery] = useState(initialSearch);
  const [search, setSearch] = useState(initialSearch);
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestSequence = useRef(0);
  const isFirstSearchEffect = useRef(true);

  useEffect(() => {
    if (isFirstSearchEffect.current) {
      isFirstSearchEffect.current = false;
      return;
    }

    const timer = window.setTimeout(() => {
      setPage(1);
      setSearch(query);
    }, 400);

    return () => window.clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setError('');

    try {
      const response = await fetch(
        `/api/platform-admin/users?page=${page}&pageSize=${pageSize}&search=${encodeURIComponent(search)}`,
      );
      const payload = (await response.json()) as UserListData;

      if (!response.ok) {
        throw new Error(
          response.status === 401
            ? '请先登录'
            : response.status === 403
              ? '无平台运营权限'
              : '加载用户失败',
        );
      }

      if (requestId === requestSequence.current) {
        setData(payload);
      }
    } catch (requestError: unknown) {
      if (requestId === requestSequence.current) {
        setError(requestError instanceof Error ? requestError.message : '加载用户失败');
      }
    } finally {
      if (requestId === requestSequence.current) {
        setLoading(false);
      }
    }
  }, [page, pageSize, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const createDetailHref = (userId: string) => {
    const params = new URLSearchParams({
      returnPage: String(page),
      returnPageSize: String(pageSize),
    });

    if (search) {
      params.set('returnSearch', search);
    }

    return `/platform-admin/users/${encodeURIComponent(userId)}?${params.toString()}`;
  };

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">用户管理</h2>
          <p className="mt-2 text-sm text-slate-400">查看平台注册用户及账号状态</p>
        </div>
        <button onClick={() => void load()} className="rounded-lg bg-white/10 px-3 py-2 text-sm">
          刷新
        </button>
      </div>

      <div className="mt-6 rounded-2xl bg-white/10 p-4">
        <div className="flex flex-wrap gap-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索 ID、姓名、邮箱或手机号后四位"
            className="min-w-64 flex-1 rounded-lg bg-slate-900 px-3 py-2 text-sm"
          />
          <select
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              setPage(1);
            }}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-3 text-sm text-slate-400">用户总数：{data?.total ?? 0}</p>
      </div>

      {error ? (
        <div className="mt-5 rounded-xl bg-red-500/10 p-4 text-red-200">
          {error}
          <button onClick={() => void load()} className="ml-3 underline">
            重新加载
          </button>
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-2xl bg-white/10">
          <table className="w-full min-w-[1200px] text-left text-sm">
            <thead className="text-slate-400">
              <tr>
                {[
                  '用户',
                  '手机号',
                  '邮箱',
                  '状态',
                  '平台角色',
                  '登录方式',
                  '所属企业',
                  '有效 Session',
                  '最近登录',
                  '注册时间',
                  '操作',
                ].map((title) => (
                  <th className="p-3 font-medium" key={title}>
                    {title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.items.map((user) => (
                <tr className="border-t border-white/10" key={user.id}>
                  <td className="p-3">
                    <b>{user.name || '未设置姓名'}</b>
                    <small className="block text-slate-500">{user.id}</small>
                  </td>
                  <td className="p-3">{user.maskedPhone}</td>
                  <td className="p-3">{user.maskedEmail}</td>
                  <td className="p-3">{getStatusLabel(user.status)}</td>
                  <td className="p-3">{getRoleLabel(user.role)}</td>
                  <td className="p-3">
                    {user.identityProviders.length ? user.identityProviders.join('、') : '暂无'}
                  </td>
                  <td className="p-3">{user.companyCount}</td>
                  <td className="p-3">{user.activeSessionCount}</td>
                  <td className="p-3">{formatDate(user.lastLoginAt)}</td>
                  <td className="p-3">{formatDate(user.createdAt, '暂无')}</td>
                  <td className="p-3">
                    <Link href={createDetailHref(user.id)} className="text-sky-300 hover:text-sky-200">
                      查看详情
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && <p className="p-5 text-slate-400">加载中…</p>}
          {!loading && data?.items.length === 0 && <p className="p-5 text-slate-400">暂无用户数据</p>}
        </div>
      )}

      <div className="mt-5 flex items-center justify-between text-sm">
        <button
          disabled={!data || data.page <= 1 || loading}
          onClick={() => setPage((currentPage) => currentPage - 1)}
          className="rounded-lg bg-white/10 px-3 py-2 disabled:opacity-40"
        >
          上一页
        </button>
        <span>
          {data?.page || 1} / {Math.max(data?.totalPages || 1, 1)}
        </span>
        <button
          disabled={!data || data.page >= data.totalPages || loading}
          onClick={() => setPage((currentPage) => currentPage + 1)}
          className="rounded-lg bg-white/10 px-3 py-2 disabled:opacity-40"
        >
          下一页
        </button>
      </div>
    </section>
  );
}
