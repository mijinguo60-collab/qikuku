import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';
import { Shield, Check, X, MoreHorizontal, Plus, UserPlus } from 'lucide-react';

interface UserRow {
  id: string; name: string; email: string; role: string; createdAt: string; companyId: string;
}

interface Role {
  id: string; label: string; description: string;
}

interface Permission {
  id: string; label: string;
  roles: string[];
}

const ROLES: Role[] = [
  { id: 'super_admin', label: '超级管理员', description: '拥有所有权限，可管理企业和成员' },
  { id: 'admin', label: '企业管理员', description: '可管理知识库、成员，查看所有数据' },
  { id: 'department_head', label: '部门主管', description: '可管理本部门知识空间和成员' },
  { id: 'member', label: '普通员工', description: '可使用问答、做图、查看公开知识' },
  { id: 'guest', label: '访客', description: '仅查看被授权的知识空间' },
];

const PERMISSIONS: Permission[] = [
  { id: 'view_knowledge', label: '查看知识空间', roles: ['super_admin', 'admin', 'department_head', 'member', 'guest'] },
  { id: 'upload_files', label: '上传文件', roles: ['super_admin', 'admin', 'department_head', 'member'] },
  { id: 'delete_files', label: '删除文件', roles: ['super_admin', 'admin'] },
  { id: 'use_chat', label: '使用基础问答', roles: ['super_admin', 'admin', 'department_head', 'member', 'guest'] },
  { id: 'use_skill_chat', label: '使用管理 Skill 问答', roles: ['super_admin', 'admin', 'department_head'] },
  { id: 'use_images', label: '使用 AI 做图', roles: ['super_admin', 'admin', 'department_head', 'member'] },
  { id: 'view_sensitive', label: '查看敏感资料', roles: ['super_admin', 'admin', 'department_head'] },
  { id: 'manage_members', label: '管理成员', roles: ['super_admin', 'admin'] },
  { id: 'view_logs', label: '查看审计日志', roles: ['super_admin', 'admin'] },
  { id: 'modify_settings', label: '修改系统设置', roles: ['super_admin'] },
];

function getRoleLabel(roleId: string) { return ROLES.find(r => r.id === roleId)?.label || roleId; }

function getRoleDescription(roleId: string) { return ROLES.find(r => r.id === roleId)?.description || ''; }

export default function PermissionsPage() {
  const cookie = cookies().get('qikuku_user');
  if (!cookie) return null;
  const currentUser = JSON.parse(cookie.value);
  const db = getDb();

  const users = db.prepare(
    'SELECT id, name, email, role, createdAt, companyId FROM User WHERE companyId = ? ORDER BY role, createdAt'
  ).all(currentUser.companyId) as UserRow[];

  const isSuperAdmin = currentUser.role === 'super_admin';

  return (
    <div className="p-8 max-w-6xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary mb-1">权限管理</h1>
        <p className="text-sm text-text-secondary">管理企业成员、角色和访问权限</p>
      </div>

      {/* Members Section */}
      <div className="card mb-8">
        <div className="px-6 py-4 border-b border-border-light flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <UserPlus className="w-4 h-4" /> 企业成员
          </h2>
          <button className="btn-primary text-xs flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> 添加成员
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-light">
                <th className="text-left px-6 py-3 text-xs font-medium text-text-muted">姓名</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-text-muted">邮箱</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-text-muted">角色</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-text-muted">加入时间</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u: UserRow) => (
                <tr key={u.id} className="border-b border-border-light hover:bg-surface-secondary transition-colors">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-surface-tertiary flex items-center justify-center text-xs font-bold text-text-muted">
                        {u.name.charAt(0)}
                      </div>
                      <span className="font-medium text-text-primary">{u.name}</span>
                      {u.id === currentUser.id && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent-blue/10 text-accent-blue">你</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-3 text-text-secondary">{u.email}</td>
                  <td className="px-6 py-3">
                    <select
                      defaultValue={u.role}
                      disabled={!isSuperAdmin || u.id === currentUser.id}
                      className="text-xs bg-surface-secondary border border-border-light rounded-lg px-2.5 py-1.5 text-text-primary outline-none disabled:opacity-50"
                    >
                      {ROLES.map(r => (
                        <option key={r.id} value={r.id}>{r.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-3 text-xs text-text-muted">
                    {new Date(u.createdAt).toLocaleDateString('zh-CN')}
                  </td>
                  <td className="px-3 py-3">
                    <button className="p-1.5 rounded-lg hover:bg-surface-hover">
                      <MoreHorizontal className="w-4 h-4 text-text-muted" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Role Descriptions */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Shield className="w-4 h-4" /> 角色说明
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {ROLES.map(role => (
            <div key={role.id} className="card p-4">
              <h3 className="text-xs font-semibold text-text-primary mb-1">{role.label}</h3>
              <p className="text-[11px] text-text-secondary leading-relaxed">{role.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Permission Matrix */}
      <div>
        <h2 className="text-sm font-semibold text-text-primary mb-4">权限矩阵</h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border-light">
                <th className="text-left px-4 py-3 font-medium text-text-primary min-w-[160px]">权限</th>
                {ROLES.map(r => (
                  <th key={r.id} className="text-center px-3 py-3 font-medium text-text-secondary min-w-[80px]">{r.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map(perm => (
                <tr key={perm.id} className="border-b border-border-light hover:bg-surface-secondary transition-colors">
                  <td className="px-4 py-3 text-text-primary">{perm.label}</td>
                  {ROLES.map(role => (
                    <td key={role.id} className="text-center px-3 py-3">
                      {perm.roles.includes(role.id)
                        ? <Check className="w-4 h-4 text-success mx-auto" />
                        : <X className="w-4 h-4 text-text-muted mx-auto" />
                      }
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
