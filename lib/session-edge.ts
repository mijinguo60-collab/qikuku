import { canAccessRoute } from '@/lib/roles';

export type SessionRouteAccessResult = {
  /**
   * 仅表示 Cookie Token 的格式、签名和必要 claims 通过 Edge 预检。
   * Edge 无法查询数据库，不能将其视为完整的 Session 认证结果。
   */
  tokenValid: boolean;
  /** 基于 Token 中企业角色 claims 的快速路由预检结果。 */
  authorizedByRoleClaim: boolean;
  role: string | null;
};

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return atob(padded);
}

const invalidToken: SessionRouteAccessResult = {
  tokenValid: false,
  authorizedByRoleClaim: false,
  role: null,
};

export async function verifySessionRouteAccess(
  token: string | undefined,
  pathname: string,
): Promise<SessionRouteAccessResult> {
  if (!token || !process.env.SESSION_SECRET) return invalidToken;
  const tokenParts = token.split('.');
  if (tokenParts.length !== 2) return invalidToken;
  const [payload, signature] = tokenParts;
  if (!payload || !signature) return invalidToken;
  try {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(process.env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const signatureBytes = Uint8Array.from(fromBase64Url(signature), (char) => char.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, signatureBytes, new TextEncoder().encode(payload));
    if (!valid) return invalidToken;
    const claims = JSON.parse(fromBase64Url(payload));
    if (!claims?.sid || typeof claims.role !== 'string') return invalidToken;
    return {
      tokenValid: true,
      authorizedByRoleClaim: canAccessRoute(claims.role, pathname),
      role: claims.role,
    };
  } catch {
    return invalidToken;
  }
}
