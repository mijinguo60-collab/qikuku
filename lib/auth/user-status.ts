export type UserAccountStatus = 'active' | 'disabled' | 'deleted';

export class UserAuthenticationError extends Error {
  readonly code: 'disabled' | 'unavailable';

  constructor(status: unknown) {
    const disabled = status === 'disabled';
    super(disabled ? '账号已被禁用，请联系管理员' : '账号当前不可用');
    this.name = 'UserAuthenticationError';
    this.code = disabled ? 'disabled' : 'unavailable';
  }
}
/**
 * Account state is independent from User.role and Membership.status.
 * Unknown values deliberately fail closed.
 */
export function isActiveUserStatus(status: unknown): status is 'active' {
  return status === 'active';
}

export function assertUserCanAuthenticate(
  user: { status?: unknown } | null | undefined,
): asserts user is { status: 'active' } {
  if (!isActiveUserStatus(user?.status)) {
    throw new UserAuthenticationError(user?.status);
  }
}
