import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getRequestSession } from '@/lib/session';
import { requirePlatformAdmin } from '@/lib/platform-admin/auth';

const COMPANY_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

type SafeCompany = {
  id: string;
  name: string;
};

type RevokeCompanySessionsResult =
  | { kind: 'not_found' }
  | { kind: 'noop'; company: SafeCompany }
  | { kind: 'revoked'; company: SafeCompany; revokedSessionCount: number };

function isValidCompanyId(value: string) {
  return value.length > 0 && value.length <= 100 && COMPANY_ID_PATTERN.test(value);
}

function getReason(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function getSafeIp(request: NextRequest) {
  const candidate = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
  return /^[0-9a-fA-F:.]{1,64}$/.test(candidate) ? candidate : null;
}

function getSafeUserAgent(request: NextRequest) {
  const userAgent = request.headers.get('user-agent');
  return userAgent
    ? userAgent.replace(/[\u0000-\u001F\u007F]/g, ' ').slice(0, 500)
    : null;
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const companyId = typeof params?.id === 'string' ? params.id.trim() : '';
  if (!isValidCompanyId(companyId)) {
    return NextResponse.json({ error: '企业 ID 格式错误' }, { status: 400 });
  }

  const session = await getRequestSession(request);
  if (!session) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  const platformAdmin = await requirePlatformAdmin(request);
  if (!platformAdmin) {
    return NextResponse.json({ error: '无平台运营权限' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '请求数据格式错误' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: '请求数据格式错误' }, { status: 400 });
  }

  const reason = getReason((body as { reason?: unknown }).reason);
  if (reason.length < 2 || reason.length > 200) {
    return NextResponse.json({ error: '操作原因长度需为2至200字' }, { status: 400 });
  }

  const ip = getSafeIp(request);
  const userAgent = getSafeUserAgent(request);
  const db = getDb();

  try {
    const result = (await db.transactionAsync(async (tx: any): Promise<RevokeCompanySessionsResult> => {
      // 与企业 Membership 操作共用 companyId 锁键，避免跨企业会话撤销发生竞态。
      await tx.prepare(`SELECT pg_advisory_xact_lock(hashtext(?))`).get(companyId);

      const companyRow = await tx
        .prepare(`SELECT id,name FROM "Company" WHERE id=? FOR UPDATE`)
        .get(companyId) as Record<string, unknown> | null;
      if (!companyRow) return { kind: 'not_found' };

      const company: SafeCompany = {
        id: String(companyRow.id),
        name: typeof companyRow.name === 'string' ? companyRow.name : '',
      };
      const countRow = await tx
        .prepare(`SELECT COUNT(*)::int AS count FROM "UserSession" WHERE "activeCompanyId"=?`)
        .get(company.id) as { count?: unknown } | null;
      const activeCompanySessionCount = Number(countRow?.count || 0);

      if (activeCompanySessionCount === 0) {
        return { kind: 'noop', company };
      }

      const deleted = await tx
        .prepare(`DELETE FROM "UserSession" WHERE "activeCompanyId"=?`)
        .run(company.id);
      const revokedSessionCount = Number(deleted?.changes || 0);
      if (revokedSessionCount !== activeCompanySessionCount) {
        throw new Error('company_session_revoke_count_mismatch');
      }

      const now = new Date().toISOString();
      await tx
        .prepare(
          `INSERT INTO "PlatformAuditLog" (id,"adminUserId",action,"targetType","targetId","companyId",reason,"beforeData","afterData",ip,"userAgent","createdAt") VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          randomUUID(),
          platformAdmin.id,
          'company.sessions.revoke_all',
          'company',
          company.id,
          company.id,
          reason,
          JSON.stringify({ activeCompanySessionCount }),
          JSON.stringify({ activeCompanySessionCount: 0, revokedSessionCount }),
          ip,
          userAgent,
          now,
        );

      return { kind: 'revoked', company, revokedSessionCount };
    })) as RevokeCompanySessionsResult;

    if (result.kind === 'not_found') {
      return NextResponse.json({ error: '企业不存在' }, { status: 404 });
    }
    if (result.kind === 'noop') {
      return NextResponse.json({
        success: true,
        changed: false,
        revokedSessionCount: 0,
        company: result.company,
      });
    }

    return NextResponse.json({
      success: true,
      changed: true,
      revokedSessionCount: result.revokedSessionCount,
      company: result.company,
    });
  } catch {
    return NextResponse.json({ error: '退出企业会话失败，请稍后重试' }, { status: 500 });
  }
}
