import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getRequestSession } from '@/lib/session';
import { getDb } from '@/lib/db';
import { requirePlatformAdmin } from '@/lib/platform-admin/auth';

const USER_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

type RevokeResult =
  | { kind: 'not_found' }
  | { kind: 'self_confirmation_required' }
  | { kind: 'noop' }
  | { kind: 'revoked'; revokedSessionCount: number };

function isValidUserId(value: string) {
  return value.length > 0 && value.length <= 100 && USER_ID_PATTERN.test(value);
}

function getReason(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const targetUserId = params.id;
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

  const input = body as { reason?: unknown; confirmSelfLogout?: unknown };
  const reason = getReason(input.reason);
  if (reason.length < 2 || reason.length > 200) {
    return NextResponse.json({ error: '操作原因长度需为2至200字' }, { status: 400 });
  }

  if (
    input.confirmSelfLogout !== undefined &&
    typeof input.confirmSelfLogout !== 'boolean'
  ) {
    return NextResponse.json({ error: 'confirmSelfLogout 必须是布尔值' }, { status: 400 });
  }

  const userAgent = request.headers.get('user-agent')?.slice(0, 500) || null;
  const db = getDb();

  try {
    const result = (await db.transactionAsync(async (tx: any): Promise<RevokeResult> => {
      const target = await tx
        .prepare(`SELECT id FROM "User" WHERE id=? FOR UPDATE`)
        .get(targetUserId);

      if (!target) {
        return { kind: 'not_found' };
      }

      if (targetUserId === session.id && input.confirmSelfLogout !== true) {
        return { kind: 'self_confirmation_required' };
      }

      const countRow = await tx
        .prepare(`SELECT COUNT(*)::int AS count FROM "UserSession" WHERE "userId"=?`)
        .get(targetUserId);
      const sessionCount = Number(countRow?.count || 0);

      if (sessionCount === 0) {
        return { kind: 'noop' };
      }

      const deleted = await tx
        .prepare(`DELETE FROM "UserSession" WHERE "userId"=?`)
        .run(targetUserId);
      const revokedSessionCount = Number(deleted?.changes || 0);

      if (revokedSessionCount !== sessionCount) {
        throw new Error('Session revoke count mismatch');
      }

      const now = new Date().toISOString();
      await tx
        .prepare(
          `INSERT INTO "PlatformAuditLog" (id,"adminUserId",action,"targetType","targetId",reason,"beforeData","afterData",ip,"userAgent","createdAt") VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          randomUUID(),
          platformAdmin.id,
          'user.sessions.revoke_all',
          'User',
          targetUserId,
          reason,
          JSON.stringify({ sessionCount }),
          JSON.stringify({ revokedSessionCount }),
          null,
          userAgent,
          now,
        );

      return { kind: 'revoked', revokedSessionCount };
    })) as RevokeResult;

    if (result.kind === 'not_found') {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    if (result.kind === 'self_confirmation_required') {
      return NextResponse.json(
        { error: '需要明确确认退出当前管理员的全部会话' },
        { status: 400 },
      );
    }

    if (result.kind === 'noop') {
      return NextResponse.json({
        success: true,
        userId: targetUserId,
        revokedSessionCount: 0,
        unchanged: true,
      });
    }

    return NextResponse.json({
      success: true,
      userId: targetUserId,
      revokedSessionCount: result.revokedSessionCount,
      unchanged: false,
    });
  } catch {
    return NextResponse.json({ error: '退出用户会话失败，请稍后重试' }, { status: 500 });
  }
}
