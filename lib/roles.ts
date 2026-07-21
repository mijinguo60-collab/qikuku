/**
 * 企库库 角色标准化 & 权限判断
 * 历史兼容：super_admin→owner, member→staff。
 * 账号状态一律由 User.status 管理，不得由角色承载。
 */

type NormRole = 'owner' | 'admin' | 'manager' | 'member' | 'sales' | 'content' | 'readonly';

const ROLE_MAP: Record<string, NormRole> = {
  super_admin: 'owner', platform_super_admin: 'owner', owner: 'owner', admin: 'admin',
  manager: 'manager', member: 'member', employee: 'member',
  staff: 'member', sales: 'sales', content: 'content',
  readonly: 'readonly',
};

export function normalizeRole(raw: string): NormRole {
  return ROLE_MAP[raw?.toLowerCase()] || 'readonly';
}

export function isAdminRole(raw: string): boolean {
  const n = normalizeRole(raw);
  return n === 'owner' || n === 'admin';
}

export function isStaffRole(raw: string): boolean {
  return ['member', 'sales', 'content', 'readonly', 'manager'].includes(normalizeRole(raw));
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
  // 仪表盘首屏读取当前企业积分；仅放行该只读接口，不放开账单写操作。
  '/api/billing/credits',
];

export function canAccessRoute(rawRole: string, pathname: string): boolean {
  const role = normalizeRole(rawRole);
  if (role === 'owner' || role === 'admin') return true;
  if (ADMIN_ONLY_PREFIXES.some(p => pathname.startsWith(p))) return false;
  if (role === 'manager') return true;
  return STAFF_ALLOWED.some(p => pathname === p || pathname.startsWith(p + '/'));
}

/** Sidebar 显示控制：哪些菜单组对某角色可见 */
export function isSidebarGroupVisible(rawRole: string, groupLabel: string): boolean {
  const role = normalizeRole(rawRole);
  if (role === 'owner' || role === 'admin') return true;
  if (groupLabel === '管理') return false;
  return true;
}

export { ADMIN_ONLY_PREFIXES, STAFF_ALLOWED };
