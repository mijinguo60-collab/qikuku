export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Client-safe password policy shared by registration and server authentication. */
export function validateLoginPasswordValue(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return `密码长度需为 ${PASSWORD_MIN_LENGTH} 至 ${PASSWORD_MAX_LENGTH} 位`;
  }

  const groups = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;

  return groups >= 2 ? null : '密码需至少包含两种字符类型';
}
