import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getRequestSession } from '@/lib/session';
import { getDb } from '@/lib/db';
import { requirePlatformAdmin } from '@/lib/platform-admin/auth';

const PLATFORM_SUPER_ADMIN = 'platform_super_admin';
const USER_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

type PlatformRoleResult =
  | { kind: 'not_found' }
  | { kind: 'grant_inactive_user' }
  | { kind: 'self_revoke' }
  | { kind: 'last_platform_admin' }
  | { kind: 'unsafe_previous_role' }
  | { kind: 'noop'; userId: string; role: string }
  | { kind: 'changed'; userId: string; role: string };

function isValidUserId(value: string) {
  return value.length > 0 && value.length <= 100 && USER_ID_PATTERN.test(value);
}

function getReason(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function getAuditData(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const targetUserId = typeof params?.id === 'string' ? params.id : '';
  if (!isValidUserId(targetUserId)) {
    return NextResponse.json({ error: '用户ID格式错误' }, { status: 400 });
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

  const input = body as { isPlatformAdmin?: unknown; reason?: unknown };
  if (typeof input.isPlatformAdmin !== 'boolean') {
    return NextResponse.json({ error: 'isPlatformAdmin 必须是布尔值' }, { status: 400 });
  }

  const reason = getReason(input.reason);
  if (reason.length < 2 || reason.length > 200) {
    return NextResponse.json({ error: '操作原因长度需为2至200字' }, { status: 400 });
  }

  const userAgent = request.headers.get('user-agent')?.slice(0, 500) || null;
  const db = getDb();

  try {
    const result = (await db.transactionAsync(async (tx: any): Promise<PlatformRoleResult> => {
      const target = await tx
        .prepare(`SELECT id,role,status FROM "User" WHERE id=? FOR UPDATE`)
        .get(targetUserId);

      if (!target) {
        return { kind: 'not_found' };
      }

      if (input.isPlatformAdmin) {
        if (target.status !== 'active') {
          return { kind: 'grant_inactive_user' };
        }

        if (target.role === PLATFORM_SUPER_ADMIN) {
          return { kind: 'noop', userId: target.id, role: target.role };
        }

        const previousRole = target.role;
        const now = new Date().toISOString();
        await tx
          .prepare(`UPDATE "User" SET role=?,"updatedAt"=? WHERE id=?`)
          .run(PLATFORM_SUPER_ADMIN, now, target.id);

        await tx
          .prepare(
            `INSERT INTO "PlatformAuditLog" (id,"adminUserId",action,"targetType","targetId",reason,"beforeData","afterData",ip,"userAgent","createdAt") VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          )
          .run(
            randomUUID(),
            platformAdmin.id,
            'user.platform_admin.grant',
            'User',
            target.id,
            reason,
            JSON.stringify({ role: previousRole, status: target.status }),
            JSON.stringify({
              role: PLATFORM_SUPER_ADMIN,
              status: target.status,
              previousRole,
            }),
            null,
            userAgent,
            now,
          );

        return { kind: 'changed', userId: target.id, role: PLATFORM_SUPER_ADMIN };
      }

      if (target.id === platformAdmin.id) {
        return { kind: 'self_revoke' };
      }

      if (target.role !== PLATFORM_SUPER_ADMIN) {
        return { kind: 'noop', userId: target.id, role: target.role };
      }

      const activePlatformAdmins = await tx
        .prepare(
          `SELECT id FROM "User" WHERE role=? AND status='active' ORDER BY id FOR UPDATE`,
        )
        .all(PLATFORM_SUPER_ADMIN);
      if (activePlatformAdmins.length <= 1) {
        return { kind: 'last_platform_admin' };
      }

      const latestGrant = await tx
        .prepare(
          `SELECT "beforeData","afterData" FROM "PlatformAuditLog" WHERE action=? AND "targetType"='User' AND "targetId"=? ORDER BY "createdAt" DESC,id DESC LIMIT 1 FOR UPDATE`,
        )
        .get('user.platform_admin.grant', target.id);
      const beforeData = getAuditData(latestGrant?.beforeData);
      const afterData = getAuditData(latestGrant?.afterData);
      const previousRole = beforeData?.role;

      const nonPlatformRoles = new Set(
        (
          await tx
            .prepare(`SELECT DISTINCT role FROM "User" WHERE role<>?`)
            .all(PLATFORM_SUPER_ADMIN)
        )
          .map((row: { role?: unknown }) => row.role)
          .filter((role: unknown): role is string => typeof role === 'string' && role.length > 0),
      );

      if (
        afterData?.role !== PLATFORM_SUPER_ADMIN ||
        typeof previousRole !== 'string' ||
        previousRole === PLATFORM_SUPER_ADMIN ||
        !nonPlatformRoles.has(previousRole)
      ) {
        return { kind: 'unsafe_previous_role' };
      }

      const now = new Date().toISOString();
      await tx
        .prepare(`UPDATE "User" SET role=?,"updatedAt"=? WHERE id=?`)
        .run(previousRole, now, target.id);

      await tx
        .prepare(
          `INSERT INTO "PlatformAuditLog" (id,"adminUserId",action,"targetType","targetId",reason,"beforeData","afterData",ip,"userAgent","createdAt") VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          randomUUID(),
          platformAdmin.id,
          'user.platform_admin.revoke',
          'User',
          target.id,
          reason,
          JSON.stringify({ role: PLATFORM_SUPER_ADMIN, status: target.status }),
          JSON.stringify({ role: previousRole, status: target.status }),
          null,
          userAgent,
          now,
        );

      return { kind: 'changed', userId: target.id, role: previousRole };
    })) as PlatformRoleResult;

    if (result.kind === 'not_found') {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }
    if (result.kind === 'grant_inactive_user') {
      return NextResponse.json({ error: '仅可向状态正常的用户授予平台管理员权限' }, { status: 400 });
    }
    if (result.kind === 'self_revoke') {
      return NextResponse.json({ error: '当前平台管理员不能撤销自己的平台权限' }, { status: 400 });
    }
    if (result.kind === 'last_platform_admin') {
      return NextResponse.json({ error: '不能撤销最后一个有效平台管理员权限' }, { status: 400 });
    }
    if (result.kind === 'unsafe_previous_role') {
      return NextResponse.json(
        { error: '无法安全确定该用户授权前的角色，已拒绝撤销' },
        { status: 409 },
      );
    }
    if (result.kind === 'noop') {
      return NextResponse.json({
        success: true,
        user: { id: result.userId, role: result.role },
        unchanged: true,
      });
    }

    return NextResponse.json({
      success: true,
      user: { id: result.userId, role: result.role },
      unchanged: false,
    });
  } catch {
    return NextResponse.json({ error: '平台管理员权限更新失败，请稍后重试' }, { status: 500 });
  }
}
