import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getRequestSession } from '@/lib/session';
import { getDb } from '@/lib/db';
import { requirePlatformAdmin } from '@/lib/platform-admin/auth';

const USER_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

type UserStatus = 'active' | 'disabled';

type StatusChangeResult =
  | { kind: 'not_found' }
  | { kind: 'self_disable' }
  | { kind: 'last_platform_admin' }
  | { kind: 'deleted_cannot_restore' }
  | { kind: 'noop'; userId: string; status: string }
  | { kind: 'changed'; userId: string; status: UserStatus; revokedSessionCount: number };

function isUserId(value: string) {
  return value.length > 0 && value.length <= 100 && USER_ID_PATTERN.test(value);
}

function isUserStatus(value: unknown): value is UserStatus {
  return value === 'active' || value === 'disabled';
}

function getReason(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const targetUserId = params.id;
  if (!isUserId(targetUserId)) {
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

  const input = body as { status?: unknown; reason?: unknown };
  const status = input.status;
  if (!isUserStatus(status)) {
    return NextResponse.json({ error: '用户状态仅允许 active 或 disabled' }, { status: 400 });
  }

  const reason = getReason(input.reason);
  if (reason.length < 2 || reason.length > 200) {
    return NextResponse.json({ error: '操作原因长度需为2至200字' }, { status: 400 });
  }

  const userAgent = request.headers.get('user-agent')?.slice(0, 500) || null;
  const db = getDb();

  try {
    const result = (await db.transactionAsync(async (tx: any): Promise<StatusChangeResult> => {
      const target = await tx
        .prepare(`SELECT id,status,role FROM "User" WHERE id=? FOR UPDATE`)
        .get(targetUserId);

      if (!target) {
        return { kind: 'not_found' };
      }

      if (status === 'disabled' && target.id === session.id) {
        return { kind: 'self_disable' };
      }

      if (status === 'active' && target.status === 'deleted') {
        return { kind: 'deleted_cannot_restore' };
      }

      if (target.status === status) {
        return { kind: 'noop', userId: target.id, status: target.status };
      }

      if (status === 'disabled' && target.role === 'platform_super_admin') {
        const activePlatformAdmins = await tx
          .prepare(
            `SELECT id FROM "User" WHERE role='platform_super_admin' AND status='active' ORDER BY id FOR UPDATE`,
          )
          .all();

        if (activePlatformAdmins.length <= 1) {
          return { kind: 'last_platform_admin' };
        }
      }

      const beforeData =
        status === 'disabled'
          ? {
              status: target.status,
              role: target.role,
              activeSessionCount: Number(
                (
                  await tx
                    .prepare(
                      `SELECT COUNT(*)::int AS count FROM "UserSession" WHERE "userId"=? AND "expiresAt">NOW()`,
                    )
                    .get(target.id)
                )?.count || 0,
              ),
            }
          : { status: target.status, role: target.role };

      const now = new Date().toISOString();
      await tx
        .prepare(`UPDATE "User" SET status=?,"updatedAt"=? WHERE id=?`)
        .run(status, now, target.id);

      const revokedSessionCount =
        status === 'disabled'
          ? Number(
              (
                await tx.prepare(`DELETE FROM "UserSession" WHERE "userId"=?`).run(target.id)
              )?.changes || 0,
            )
          : 0;

      const afterData =
        status === 'disabled'
          ? { status, role: target.role, revokedSessionCount }
          : { status, role: target.role };

      await tx
        .prepare(
          `INSERT INTO "PlatformAuditLog" (id,"adminUserId",action,"targetType","targetId",reason,"beforeData","afterData",ip,"userAgent","createdAt") VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          randomUUID(),
          platformAdmin.id,
          status === 'disabled' ? 'user.disable' : 'user.restore',
          'User',
          target.id,
          reason,
          JSON.stringify(beforeData),
          JSON.stringify(afterData),
          null,
          userAgent,
          now,
        );

      return {
        kind: 'changed',
        userId: target.id,
        status,
        revokedSessionCount,
      };
    })) as StatusChangeResult;

    if (result.kind === 'not_found') {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }
    if (result.kind === 'self_disable') {
      return NextResponse.json({ error: '当前平台管理员不能禁用自己' }, { status: 400 });
    }
    if (result.kind === 'last_platform_admin') {
      return NextResponse.json({ error: '不能禁用最后一个有效平台管理员' }, { status: 400 });
    }
    if (result.kind === 'deleted_cannot_restore') {
      return NextResponse.json({ error: '已删除用户不能通过此接口恢复' }, { status: 400 });
    }
    if (result.kind === 'noop') {
      return NextResponse.json({
        success: true,
        user: { id: result.userId, status: result.status },
        revokedSessionCount: 0,
        unchanged: true,
      });
    }

    return NextResponse.json({
      success: true,
      user: { id: result.userId, status: result.status },
      revokedSessionCount: result.revokedSessionCount,
    });
  } catch {
    return NextResponse.json({ error: '用户状态更新失败，请稍后重试' }, { status: 500 });
  }
}
