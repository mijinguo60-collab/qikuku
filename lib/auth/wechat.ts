import { randomUUID } from 'node:crypto';

/**
 * WeChat OAuth remains disabled until the production AppID, secret and callback
 * domain are configured. This module deliberately contains no mock login path.
 * A callback must verify the provider response, then require the user to pass a
 * WECHAT_BIND SMS challenge before calling the transaction helper below.
 */
const REQUIRED_WECHAT_AUTH_ENV = ['WECHAT_AUTH_ENABLED', 'WECHAT_AUTH_APP_ID', 'WECHAT_AUTH_APP_SECRET', 'WECHAT_AUTH_CALLBACK_URL'] as const;

export function isWechatAuthConfigured() {
  return process.env.WECHAT_AUTH_ENABLED === 'true' && REQUIRED_WECHAT_AUTH_ENV.slice(1).every((key) => Boolean(process.env[key]));
}

export class WechatIdentityError extends Error {
  constructor(readonly code: 'wechat_not_configured' | 'wechat_already_bound' | 'invalid_wechat_identity') {
    super(code);
  }
}

/**
 * Internal transaction helper only. The caller must already have verified both
 * the WeChat OAuth callback and the phone's WECHAT_BIND SMS challenge. It never
 * creates a User, Company or Membership, so a WeChat identity cannot create a
 * second enterprise by itself.
 */
export async function bindWechatIdentityInTransaction(
  tx: any,
  input: { userId: string; openId: string; unionId?: string | null },
) {
  if (!input.userId || !input.openId) throw new WechatIdentityError('invalid_wechat_identity');
  const existing = await tx.prepare(`SELECT id,"userId" FROM "AuthIdentity" WHERE provider='wechat' AND ("providerUserId"=? OR "openId"=? OR (? IS NOT NULL AND "unionId"=?)) LIMIT 1 FOR UPDATE`)
    .get(input.openId, input.openId, input.unionId || null, input.unionId || null) as { id: string; userId: string } | null;
  const timestamp = new Date().toISOString();
  if (existing && existing.userId !== input.userId) throw new WechatIdentityError('wechat_already_bound');
  if (existing) {
    await tx.prepare(`UPDATE "AuthIdentity" SET "providerUserId"=?,"openId"=?,"unionId"=?,"updatedAt"=? WHERE id=?`).run(input.openId, input.openId, input.unionId || null, timestamp, existing.id);
    return { identityId: existing.id, created: false };
  }
  const identityId = randomUUID();
  await tx.prepare(`INSERT INTO "AuthIdentity" (id,"userId",provider,"providerUserId","openId","unionId","createdAt","updatedAt") VALUES (?,?,'wechat',?,?,?,?,?)`)
    .run(identityId, input.userId, input.openId, input.openId, input.unionId || null, timestamp, timestamp);
  return { identityId, created: true };
}
