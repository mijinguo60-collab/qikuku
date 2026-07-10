import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';
import { Settings, Building2, Shield, Database, ArrowRight, Image as ImageIcon, Save } from 'lucide-react';
import Link from 'next/link';

export default function SettingsPage() {
  const cookie = cookies().get('qikuku_user');
  if (!cookie) return null;
  const user = JSON.parse(cookie.value);
  const db = getDb();

  const company: any = db.prepare('SELECT * FROM "Company" WHERE id = ?').get(user.companyId) || {};

  return (
    <div className="p-8 max-w-3xl mx-auto animate-fade-in">
      <h1 className="text-2xl font-bold text-text-primary mb-8">系统设置</h1>

      {/* Company Info */}
      <div className="card p-6 mb-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-accent-blue/10 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-accent-blue" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text-primary">企业信息</h2>
            <p className="text-[11px] text-text-muted">修改企业基本资料</p>
          </div>
        </div>
        <div className="space-y-4">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-2xl bg-surface-tertiary flex items-center justify-center flex-shrink-0">
              {company.logo ? (
                <img src={company.logo} alt="Logo" className="w-12 h-12 rounded-xl object-cover" />
              ) : (
                <Building2 className="w-8 h-8 text-text-muted" />
              )}
            </div>
            <div>
              <button className="btn-secondary text-xs flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5" /> 上传 Logo
              </button>
              <p className="text-[10px] text-text-muted mt-1">建议尺寸: 256x256，PNG 或 SVG</p>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-text-muted mb-1">企业名称</label>
            <input className="input-primary text-sm" defaultValue={company.name || ''} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-text-muted mb-1">行业</label>
            <select className="input-primary text-sm" defaultValue={company.industry || 'local_life'}>
              <option value="local_life">本地生活 / 探店代运营</option>
              <option value="manufacturing">工厂 / 制造业</option>
              <option value="optometry">眼视光 / 医疗服务</option>
              <option value="education">教育 / 培训机构</option>
              <option value="finance_tax">财税 / 咨询服务</option>
              <option value="other">其他</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-text-muted mb-1">企业简介</label>
            <textarea className="input-primary text-sm min-h-[80px] resize-none" defaultValue={company.description || ''} placeholder="简要描述你的企业..." />
          </div>
          <div className="flex justify-end">
            <button className="btn-primary text-sm flex items-center gap-1.5">
              <Save className="w-4 h-4" /> 保存企业信息
            </button>
          </div>
        </div>
      </div>

      {/* Current Plan */}
      <div className="card p-6 mb-6">
        <h2 className="text-sm font-semibold text-text-primary mb-3">当前套餐</h2>
        <div className="flex items-center justify-between p-4 rounded-xl bg-surface-secondary">
          <div>
            <p className="text-sm font-semibold text-text-primary">免费版</p>
            <p className="text-xs text-text-muted">基础功能，5 个知识空间，10 个文件</p>
          </div>
          <button className="btn-primary text-xs">升级套餐</button>
        </div>
      </div>

      {/* Quick Links */}
      <div className="space-y-2">
        <h3 className="text-[11px] font-semibold text-text-muted uppercase mb-2 px-1">其他设置</h3>
        {[
          { href: '/dashboard/settings/models', icon: Database, title: '模型配置', desc: '配置语言模型、图片模型和向量模型 API' },
          { href: '/dashboard/permissions', icon: Shield, title: '权限管理', desc: '管理成员角色和访问权限' },
          { href: '/dashboard/security', icon: Settings, title: '数据安全', desc: '操作日志、敏感文件管理和数据策略' },
        ].map((item, i) => (
          <Link key={i} href={item.href}
            className="card-hover p-5 flex items-center gap-4 group">
            <div className="w-10 h-10 rounded-xl bg-surface-tertiary flex items-center justify-center">
              <item.icon className="w-5 h-5 text-text-secondary" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-text-primary">{item.title}</h3>
              <p className="text-xs text-text-muted">{item.desc}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-text-primary transition-colors" />
          </Link>
        ))}
      </div>
    </div>
  );
}
