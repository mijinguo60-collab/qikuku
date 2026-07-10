import { cookies } from 'next/headers';
import { getAuditLogs } from '@/lib/audit';
import { Lock, Shield, Eye, Download, Trash2, Clock, User as UserIcon, FileText, Server } from 'lucide-react';

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  return `${Math.floor(diff / 86400)}天前`;
}

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    upload_document: '上传文件',
    delete_document: '删除文件',
    view_document: '查看文件',
    ai_chat: 'AI 问答',
    ai_skill_chat: '管理 Skill 问答',
    ai_image: 'AI 做图',
    login: '登录',
    change_role: '修改角色',
    update_settings: '修改设置',
    export_data: '导出数据',
  };
  return map[action] || action;
}

export default async function SecurityPage() {
  const cookie = cookies().get('qikuku_user');
  if (!cookie) return null;
  const user = JSON.parse(cookie.value);

  const logs = await getAuditLogs(user.companyId, 30) as any[];

  return (
    <div className="p-8 max-w-6xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary mb-1">数据安全</h1>
        <p className="text-sm text-text-secondary">审计日志、敏感文件管理和数据合规</p>
      </div>

      {/* Security Features */}
      <div className="grid md:grid-cols-2 gap-4 mb-8">
        {[
          { icon: Shield, title: '权限审计', desc: '定期审查成员权限，确保最小权限原则', status: '已启用', color: 'text-success' },
          { icon: Lock, title: 'API Key 加密', desc: '所有模型 API Key 服务端 AES-256 加密存储', status: '已启用', color: 'text-success' },
          { icon: Server, title: '私有化部署', desc: '支持部署到企业自有服务器，数据不出企业', status: '支持', color: 'text-accent-blue' },
          { icon: FileText, title: 'NDA 保密协议', desc: '支持签署 NDA 保密协议，保障数据安全', status: '可提供', color: 'text-accent-purple' },
        ].map((item, i) => (
          <div key={i} className="card p-5 flex gap-4">
            <div className="w-10 h-10 rounded-xl bg-surface-tertiary flex items-center justify-center flex-shrink-0">
              <item.icon className="w-5 h-5 text-text-secondary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-1">{item.title}</h3>
              <p className="text-xs text-text-secondary mb-2">{item.desc}</p>
              <span className={`text-[10px] font-medium ${item.color}`}>{item.status}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Sensitive File Summary */}
      <div className="card p-6 mb-8">
        <h2 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Eye className="w-4 h-4" /> 敏感等级说明
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { level: '普通', desc: '可对外分享', color: 'bg-success/10 text-success border-success/20' },
            { level: '内部', desc: '企业内部使用', color: 'bg-accent-blue/10 text-accent-blue border-accent-blue/20' },
            { level: '机密', desc: '仅限管理层', color: 'bg-warning/10 text-warning border-warning/20' },
            { level: '高度机密', desc: '仅超级管理员', color: 'bg-danger/10 text-danger border-danger/20' },
          ].map((s, i) => (
            <div key={i} className={`p-3 rounded-xl border ${s.color} text-center`}>
              <p className="text-xs font-semibold mb-0.5">{s.level}</p>
              <p className="text-[10px] opacity-70">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Audit Log Table */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
            <Clock className="w-4 h-4" /> 操作审计日志
          </h2>
          <div className="flex items-center gap-2">
            <button className="btn-secondary text-xs flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5" /> 导出
            </button>
            <button className="btn-secondary text-xs flex items-center gap-1.5 text-danger">
              <Trash2 className="w-3.5 h-3.5" /> 清除
            </button>
          </div>
        </div>
        <div className="card overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border-light">
                <th className="text-left px-4 py-3 font-medium text-text-muted">操作人</th>
                <th className="text-left px-4 py-3 font-medium text-text-muted">操作类型</th>
                <th className="text-left px-4 py-3 font-medium text-text-muted">操作对象</th>
                <th className="text-left px-4 py-3 font-medium text-text-muted">结果</th>
                <th className="text-left px-4 py-3 font-medium text-text-muted">时间</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log: any) => (
                <tr key={log.id} className="border-b border-border-light hover:bg-surface-secondary transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <UserIcon className="w-3.5 h-3.5 text-text-muted" />
                      <span className="text-text-primary">{log.userName || '系统'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full bg-surface-tertiary text-text-secondary">
                      {actionLabel(log.action)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-muted">{log.targetType || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={log.result?.startsWith('success') ? 'text-success' : 'text-text-muted'}>
                      {log.result?.slice(0, 30) || '-'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-muted">{timeAgo(log.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {logs.length === 0 && (
            <div className="text-center py-12">
              <Clock className="w-8 h-8 text-text-muted mx-auto mb-2" />
              <p className="text-xs text-text-muted">暂无审计日志</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
