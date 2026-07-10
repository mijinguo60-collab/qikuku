import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

const faqs = [
  { q: '企库库和普通网盘有什么区别？', a: '网盘只是存文件，企库库能让企业资料变成 AI 可检索、可问答、可管理的知识资产。' },
  { q: '企库库和 ChatGPT 有什么区别？', a: 'ChatGPT 是通用对话工具，企库库是基于企业私有知识库的 AI 系统。你的企业资料不会被用于训练模型。' },
  { q: '企业资料会不会泄露？', a: '企业资料存储在企业独立空间中，权限隔离。支持签署 NDA 保密协议。' },
  { q: '员工离职后资料怎么办？', a: '管理员可以禁用离职员工账号，该员工无法继续访问。企业资料归属于企业空间。' },
  { q: '可以上传哪些文件？', a: '支持 PDF、Word、Excel、PPT、TXT、Markdown、CSV、JSON 等格式。' },
  { q: '可以按岗位设置权限吗？', a: '支持。你可以为不同角色设置不同的知识库访问权限。' },
  { q: '支持图片生成吗？', a: '支持。企库库内置 AI 做图功能，用自然语言生成产品图、海报、封面。' },
  { q: '支持管理诊断吗？', a: '支持。管理 Skill 增强问答基于德鲁克、蒂尔、波特等管理思想，结合企业资料输出诊断。' },
  { q: '需要企业自己整理资料吗？', a: '我们提供资料准备清单，也提供定制化数据梳理服务。' },
  { q: '多久可以上线使用？', a: '资料准备完成后，当天即可完成知识库搭建并开始使用。' },
  { q: '是否支持定制化？', a: '支持。包括专属知识库搭建、业务流程梳理、私有化部署等。' },
  { q: '是否可以签保密协议？', a: '可以。支持签署 NDA 保密协议，保障商业信息安全。' },
];

export default function FaqPage() {
  return (
    <main className="min-h-screen bg-white"><Navbar />
    <section className="max-w-3xl mx-auto px-6 pt-24 pb-20">
      <h1 className="text-3xl md:text-4xl font-bold text-text-primary mb-4">常见问题</h1>
      <p className="text-text-secondary mb-12">关于企库库的常见问题解答</p>
      <div className="space-y-6">
        {faqs.map((f, i) => <div key={i} className="border-b border-border-light pb-6"><h3 className="text-sm font-semibold text-text-primary mb-2">{i+1}. {f.q}</h3><p className="text-sm text-text-secondary leading-relaxed">{f.a}</p></div>)}
      </div>
    </section><Footer /></main>
  );
}
