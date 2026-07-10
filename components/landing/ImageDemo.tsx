import { Image, ArrowRight } from 'lucide-react';

export default function ImageDemo() {
  return (
    <section className="max-w-7xl mx-auto px-6 py-24 md:py-32">
      <div className="text-center mb-12">
        <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-4">像聊天一样做图</h2>
        <p className="text-text-secondary text-lg">不需要复杂表单，用自然语言描述你想要的设计</p>
      </div>
      <div className="max-w-3xl mx-auto">
        {/* Chat-like image gen mockup */}
        <div className="card p-6 space-y-5">
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-accent-cyan/10 flex items-center justify-center">
              <span className="text-[11px] font-bold text-accent-cyan">You</span>
            </div>
            <div className="bg-text-primary text-white rounded-2xl rounded-tr-md px-4 py-3 max-w-[80%]">
              <p className="text-sm">做一张企库库官网宣传图，纯白背景，Apple 风格，高级极简，中心是企业 AI 大脑抽象视觉，蓝紫色轻微点缀，16:9</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-accent-purple/10 flex items-center justify-center">
              <Image className="w-3.5 h-3.5 text-accent-purple" />
            </div>
            <div className="flex-1">
              <div className="bg-surface-secondary rounded-2xl rounded-tl-md overflow-hidden">
                <div className="aspect-video bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-white shadow-light flex items-center justify-center">
                      <Image className="w-10 h-10 text-accent-blue/30" />
                    </div>
                    <p className="text-xs text-text-muted">AI 生成的企业宣传图</p>
                    <p className="text-[10px] text-text-muted mt-1">纯白背景 · Apple 风格 · 16:9</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2">
                {['下载', '复制提示词', '继续编辑', '保存'].map(a => (
                  <button key={a} className="text-[11px] text-text-muted hover:text-text-primary transition-colors px-2 py-0.5 rounded-lg hover:bg-surface-hover">{a}</button>
                ))}
              </div>
            </div>
          </div>
          {/* Input */}
          <div className="flex items-center gap-2 bg-white border border-border-medium rounded-3xl px-5 py-3">
            <button className="w-8 h-8 rounded-full bg-surface-tertiary flex items-center justify-center hover:bg-surface-hover transition-colors">
              <Image className="w-4 h-4 text-text-muted" />
            </button>
            <span className="text-xs text-text-muted flex-1">描述你想要生成的图片，或上传参考图继续编辑...</span>
            <button className="w-8 h-8 rounded-full bg-text-primary flex items-center justify-center">
              <ArrowRight className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
