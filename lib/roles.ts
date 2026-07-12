/**
 * 企库库 角色标准化 & 权限判断
 * 历史兼容：super_admin→owner, member→staff, disabled→disabled
 */

type NormRole = 'owner' | 'admin' | 'manager' | 'staff' | 'sales' | 'content' | 'readonly' | 'disabled';

const ROLE_MAP: Record<string, NormRole> = {
  super_admin: 'owner', platform_super_admin: 'owner', owner: 'owner', admin: 'admin',
  manager: 'manager', member: 'staff', employee: 'staff',
  staff: 'staff', sales: 'sales', content: 'content',
  readonly: 'readonly', disabled: 'disabled', inactive: 'disabled', banned: 'disabled',
};

export function normalizeRole(raw: string): NormRole {
  return ROLE_MAP[raw?.toLowerCase()] || 'readonly';
}

export function isAdminRole(raw: string): boolean {
  const n = normalizeRole(raw);
  return n === 'owner' || n === 'admin';
}

export function isStaffRole(raw: string): boolean {
  return ['staff', 'sales', 'content', 'readonly', 'manager'].includes(normalizeRole(raw));
}

export function isDisabledRole(raw: string): boolean {
  return normalizeRole(raw) === 'disabled';
}

const ADMIN_ONLY_PREFIXES = [
  '/dashboard/settings/models', '/dashboard/security', '/dashboard/permissions',
  '/dashboard/settings/company', '/dashboard/team',
  '/dashboard/leads',
  '/api/company', '/api/team',
  '/api/admin',
];

const STAFF_ALLOWED = [
  '/dashboard', '/dashboard/knowledge-spaces', '/dashboard/files',
  '/dashboard/chat', '/dashboard/skill-chat', '/dashboard/skills',
  '/dashboard/images', '/dashboard/assets', '/dashboard/content',
  '/dashboard/training', '/dashboard/sales', '/dashboard/support',
];

export function canAccessRoute(rawRole: string, pathname: string): boolean {
  const role = normalizeRole(rawRole);
  if (role === 'disabled') return false;
  if (role === 'owner' || role === 'admin') return true;
  if (ADMIN_ONLY_PREFIXES.some(p => pathname.startsWith(p))) return false;
  if (role === 'manager') return true;
  return STAFF_ALLOWED.some(p => pathname === p || pathname.startsWith(p + '/'));
}

/** Sidebar 显示控制：哪些菜单组对某角色可见 */
export function isSidebarGroupVisible(rawRole: string, groupLabel: string): boolean {
  const role = normalizeRole(rawRole);
  if (role === 'disabled') return false;
  if (role === 'owner' || role === 'admin') return true;
  if (groupLabel === '管理') return false;
  return true;
}

export { ADMIN_ONLY_PREFIXES, STAFF_ALLOWED };
