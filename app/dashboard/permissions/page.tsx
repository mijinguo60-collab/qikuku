import { Shield } from 'lucide-react';

const roles = [
  { id: 'owner', label: '企业创始人', description: '可管理企业设置和成员列表。' },
  { id: 'member', label: '企业员工', description: '可使用企业已开放的工作台功能。' },
];

export default function PermissionsPage() {
  return (
    <div className="p-8 max-w-4xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary mb-1">权限管理</h1>
        <p className="text-sm text-text-secondary">当前企业仅使用创始人与员工两类正式角色。</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {roles.map((role) => <div className="card p-5" key={role.id}>
          <Shield className="mb-3 h-5 w-5 text-accent-blue" />
          <h2 className="text-sm font-semibold text-text-primary">{role.label} <span className="text-text-muted">{role.id}</span></h2>
          <p className="mt-2 text-sm text-text-secondary">{role.description}</p>
        </div>)}
      </div>
      <p className="mt-6 text-sm text-text-muted">更细的部门和岗位权限将在成员邀请功能上线后开放。</p>
    </div>
  );
}
