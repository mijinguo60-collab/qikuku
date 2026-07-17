import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getRequestSession } from '@/lib/session';
import { requirePlatformAdmin } from '@/lib/platform-admin/auth';

const MEMBERSHIP_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

type MembershipRole = 'owner' | 'member';

type SafeMembership = {
  id: string;
  companyId: string;
  userId: string;
  role: string;
  status: string;
  updatedAt: string | null;
};

type RoleChangeResult =
  | { kind: 'not_found' }
  | { kind: 'membership_inactive' }
  | { kind: 'user_inactive' }
  | { kind: 'last_active_owner' }
  | { kind: 'noop'; membership: SafeMembership }
  | { kind: 'changed'; membership: SafeMembership };

function isMembershipId(value: string) {
  return value.length > 0 && value.length <= 100 && MEMBERSHIP_ID_PATTERN.test(value);
}

function isMembershipRole(value: unknown): value is MembershipRole {
  return value === 'owner' || value === 'member';
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

  const input = body as { role?: unknown; reason?: unknown };
  if (!isMembershipRole(input.role)) {
    return NextResponse.json({ error: '成员角色仅允许 owner 或 member' }, { status: 400 });
  }
  const requestedRole: MembershipRole = input.role;

  const reason = getReason(input.reason);
  if (reason.length < 2 || reason.length > 200) {
    return NextResponse.json({ error: '操作原因长度需为2至200字' }, { status: 400 });
  }

  const userAgent = getSafeUserAgent(request);
  const ip = getSafeIp(request);
  const db = getDb();

  try {
    const result = (await db.transactionAsync(async (tx: any): Promise<RoleChangeResult> => {
      // Membership 的 companyId 不可由本接口修改。先取得企业级事务锁，随后重新锁定目标行。
      await tx
        .prepare(
          `SELECT pg_advisory_xact_lock(hashtext(COALESCE((SELECT "companyId" FROM "CompanyMembership" WHERE id=?),?)))`,
        )
        .get(membershipId, membershipId);

      const target = await tx
        .prepare(
          `SELECT membership.id,membership."companyId" AS "companyId",membership."userId" AS "userId",membership.role,membership.status,membership."updatedAt" AS "updatedAt",member.status AS "userStatus"
           FROM "CompanyMembership" membership
           JOIN "Company" company ON company.id=membership."companyId"
           JOIN "User" member ON member.id=membership."userId"
           WHERE membership.id=?
           FOR UPDATE OF membership,company,member`,
        )
        .get(membershipId) as (Record<string, unknown> & { userStatus?: unknown }) | null;

      if (!target) return { kind: 'not_found' };
      if (target.status !== 'active') return { kind: 'membership_inactive' };
      if (target.userStatus !== 'active') return { kind: 'user_inactive' };

      const membership = toSafeMembership(target);
      if (membership.role === requestedRole) return { kind: 'noop', membership };

      if (membership.role === 'owner' && requestedRole === 'member') {
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
        .prepare(`UPDATE "CompanyMembership" SET role=?,"updatedAt"=? WHERE id=?`)
        .run(requestedRole, now, membership.id);

      const action = requestedRole === 'owner'
        ? 'membership.role.promote_owner'
        : 'membership.role.demote_owner';
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
          JSON.stringify({ role: requestedRole, status: membership.status }),
          ip,
          userAgent,
          now,
        );

      return {
        kind: 'changed',
        membership: { ...membership, role: requestedRole, updatedAt: now },
      };
    })) as RoleChangeResult;

    if (result.kind === 'not_found') {
      return NextResponse.json({ error: '成员关系不存在' }, { status: 404 });
    }
    if (result.kind === 'membership_inactive') {
      return NextResponse.json({ error: '成员关系当前不可修改' }, { status: 409 });
    }
    if (result.kind === 'user_inactive') {
      return NextResponse.json({ error: '用户账号当前不可用' }, { status: 409 });
    }
    if (result.kind === 'last_active_owner') {
      return NextResponse.json({ error: '不能降级企业最后一个有效 Owner' }, { status: 409 });
    }

    return NextResponse.json({
      success: true,
      changed: result.kind === 'changed',
      membership: result.membership,
    });
  } catch {
    return NextResponse.json({ error: '成员角色更新失败，请稍后重试' }, { status: 500 });
  }
}
