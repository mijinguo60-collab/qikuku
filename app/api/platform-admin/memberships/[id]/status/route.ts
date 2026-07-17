import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getRequestSession } from '@/lib/session';
import { requirePlatformAdmin } from '@/lib/platform-admin/auth';

const MEMBERSHIP_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

type MembershipStatus = 'active' | 'disabled';

type SafeMembership = {
  id: string;
  companyId: string;
  userId: string;
  role: string;
  status: string;
  updatedAt: string | null;
};

type StatusChangeResult =
  | { kind: 'not_found' }
  | { kind: 'relation_invalid' }
  | { kind: 'status_not_changeable' }
  | { kind: 'user_inactive' }
  | { kind: 'last_active_owner' }
  | { kind: 'noop'; membership: SafeMembership }
  | { kind: 'changed'; membership: SafeMembership; revokedSessionCount: number };

function isMembershipId(value: string) {
  return value.length > 0 && value.length <= 100 && MEMBERSHIP_ID_PATTERN.test(value);
}

function isMembershipStatus(value: unknown): value is MembershipStatus {
  return value === 'active' || value === 'disabled';
}

function getReason(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function getSafeUserAgent(request: NextRequest) {
  const userAgent = request.headers.get('user-agent');
  return userAgent
    ? userAgent.replace(/[\u0000-\u001F\u007F]/g, ' ').slice(0, 500)
    : null;
}

function getSafeIp(request: NextRequest) {
  const candidate = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
  return /^[0-9a-fA-F:.]{1,64}$/.test(candidate) ? candidate : null;
}

function toIsoTime(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value : null;
}

function toSafeMembership(row: Record<string, unknown>): SafeMembership {
  return {
    id: String(row.id),
    companyId: String(row.companyId),
    userId: String(row.userId),
    role: String(row.role),
    status: String(row.status),
    updatedAt: toIsoTime(row.updatedAt),
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const membershipId = typeof params?.id === 'string' ? params.id.trim() : '';
  if (!isMembershipId(membershipId)) {
    return NextResponse.json({ error: '成员关系 ID 格式错误' }, { status: 400 });
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

  const input = body as { status?: unknown; reason?: unknown };
  if (!isMembershipStatus(input.status)) {
    return NextResponse.json({ error: '成员关系状态仅允许 active 或 disabled' }, { status: 400 });
  }
  const requestedStatus: MembershipStatus = input.status;

  const reason = getReason(input.reason);
  if (reason.length < 2 || reason.length > 200) {
    return NextResponse.json({ error: '操作原因长度需为2至200字' }, { status: 400 });
  }

  const userAgent = getSafeUserAgent(request);
  const ip = getSafeIp(request);
  const db = getDb();

  try {
    const result = (await db.transactionAsync(async (tx: any): Promise<StatusChangeResult> => {
      // 与角色修改接口保持同一 companyId 锁键，串行化 Owner 的降级与停用。
      await tx
        .prepare(
          `SELECT pg_advisory_xact_lock(hashtext(COALESCE((SELECT "companyId" FROM "CompanyMembership" WHERE id=?),?)))`,
        )
        .get(membershipId, membershipId);

      const target = await tx
        .prepare(
          `SELECT id,"companyId" AS "companyId","userId" AS "userId",role,status,"updatedAt" AS "updatedAt"
           FROM "CompanyMembership" WHERE id=? FOR UPDATE`,
        )
        .get(membershipId) as Record<string, unknown> | null;

      if (!target) return { kind: 'not_found' };

      const membership = toSafeMembership(target);
      const company = await tx
        .prepare(`SELECT id FROM "Company" WHERE id=? FOR UPDATE`)
        .get(membership.companyId) as Record<string, unknown> | null;
      const member = await tx
        .prepare(`SELECT id,status FROM "User" WHERE id=? FOR UPDATE`)
        .get(membership.userId) as (Record<string, unknown> & { status?: unknown }) | null;
      if (!company || !member) return { kind: 'relation_invalid' };

      if (membership.status !== 'active' && membership.status !== 'disabled') {
        return { kind: 'status_not_changeable' };
      }
      if (membership.status === requestedStatus) return { kind: 'noop', membership };
      if (requestedStatus === 'active' && member.status !== 'active') {
        return { kind: 'user_inactive' };
      }

      if (membership.status === 'active' && requestedStatus === 'disabled' && membership.role === 'owner') {
        const activeOwners = await tx
          .prepare(
            `SELECT membership.id
             FROM "CompanyMembership" membership
             JOIN "User" ownerUser ON ownerUser.id=membership."userId"
             WHERE membership."companyId"=?
               AND membership.role='owner'
               AND membership.status='active'
               AND ownerUser.status='active'
             ORDER BY membership.id
             FOR UPDATE OF membership,ownerUser`,
          )
          .all(membership.companyId) as Array<Record<string, unknown>>;
        if (activeOwners.length <= 1) return { kind: 'last_active_owner' };
      }

      const now = new Date().toISOString();
      await tx
        .prepare(`UPDATE "CompanyMembership" SET status=?,"updatedAt"=? WHERE id=?`)
        .run(requestedStatus, now, membership.id);

      const revokedSessionCount = requestedStatus === 'disabled'
        ? Number(
            (
              await tx
                .prepare(`DELETE FROM "UserSession" WHERE "userId"=? AND "activeCompanyId"=?`)
                .run(membership.userId, membership.companyId)
            )?.changes || 0,
          )
        : 0;

      const action = requestedStatus === 'disabled' ? 'membership.disable' : 'membership.restore';
      const afterData: Record<string, unknown> = { role: membership.role, status: requestedStatus };
      if (requestedStatus === 'disabled') afterData.revokedSessionCount = revokedSessionCount;
      await tx
        .prepare(
          `INSERT INTO "PlatformAuditLog" (id,"adminUserId",action,"targetType","targetId","companyId",reason,"beforeData","afterData",ip,"userAgent","createdAt") VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          randomUUID(),
          platformAdmin.id,
          action,
          'membership',
          membership.id,
          membership.companyId,
          reason,
          JSON.stringify({ role: membership.role, status: membership.status }),
          JSON.stringify(afterData),
          ip,
          userAgent,
          now,
        );

      return {
        kind: 'changed',
        membership: { ...membership, status: requestedStatus, updatedAt: now },
        revokedSessionCount,
      };
    })) as StatusChangeResult;

    if (result.kind === 'not_found') {
      return NextResponse.json({ error: '成员关系不存在' }, { status: 404 });
    }
    if (result.kind === 'relation_invalid') {
      return NextResponse.json({ error: '成员关系数据异常，当前不可修改' }, { status: 409 });
    }
    if (result.kind === 'status_not_changeable') {
      return NextResponse.json({ error: '成员关系当前状态不可修改' }, { status: 409 });
    }
    if (result.kind === 'user_inactive') {
      return NextResponse.json({ error: '用户账号当前不可用，无法恢复成员关系' }, { status: 409 });
    }
    if (result.kind === 'last_active_owner') {
      return NextResponse.json({ error: '不能停用企业最后一个有效 Owner' }, { status: 409 });
    }
    if (result.kind === 'noop') {
      return NextResponse.json({
        success: true,
        changed: false,
        revokedSessionCount: 0,
        membership: result.membership,
      });
    }

    return NextResponse.json({
      success: true,
      changed: true,
      revokedSessionCount: result.revokedSessionCount,
      membership: result.membership,
    });
  } catch {
    return NextResponse.json({ error: '成员关系状态更新失败，请稍后重试' }, { status: 500 });
  }
}
