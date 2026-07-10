import { Shield, Lock, FileKey, Eye, Server, ClipboardCheck } from 'lucide-react';

const items = [
  { icon: Lock, title: '企业独立空间', desc: '每个企业拥有独立的数据空间和权限体系，数据完全隔离。' },
  { icon: Shield, title: '权限分级', desc: '超管、管理员、主管、员工、访客五级权限，精细控制数据访问。' },
  { icon: FileKey, title: '文件敏感等级', desc: '普通 / 内部 / 机密 / 高度机密 四级敏感度标签。' },
  { icon: Eye, title: '操作日志', desc: '完整记录每一次知识库访问、问答和文件操作。' },
  { icon: Server, title: 'API Key 服务端加密', desc: '所有模型 API Key 存储在服务端，前端不暴露。' },
  { icon: ClipboardCheck, title: '支持私有化部署', desc: '支持部署到企业自有服务器，满足数据不出企业的合规需求。' },
];

export default function Security() {
  return (
    <section id="security" className="max-w-7xl mx-auto px-6 py-24 md:py-32 scroll-mt-20">
      <div className="text-center mb-16">
        <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-4">企业数据安全，不靠口号</h2>
        <p className="text-text-secondary text-lg max-w-2xl mx-auto">
          模型不训练客户数据，具体以接入模型服务条款为准。支持 NDA 保密协议。
        </p>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
        {items.map((item, i) => (
          <div key={i} className="flex gap-4 p-5 rounded-2xl hover:bg-surface-secondary transition-colors">
            <div className="w-10 h-10 rounded-xl bg-surface-tertiary flex items-center justify-center flex-shrink-0">
              <item.icon className="w-5 h-5 text-text-secondary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-1">{item.title}</h3>
              <p className="text-xs text-text-secondary leading-relaxed">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
