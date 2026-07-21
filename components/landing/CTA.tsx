import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export default function CTA() {
  return (
    <section id="pricing" className="max-w-7xl mx-auto px-6 py-24 md:py-32 text-center scroll-mt-20">
      <div className="card max-w-2xl mx-auto p-12 md:p-16">
        <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-4 leading-tight">
          从第一份企业资料开始，<br />搭建你的企业 AI 大脑
        </h2>
        <p className="text-text-secondary text-lg mb-8">
          无需部署，无需技术团队，15 分钟完成知识库搭建。
        </p>
        <Link href="/auth/login" className="btn-primary text-base px-8 py-3.5 rounded-xl inline-flex items-center gap-2">
          立即开始 <ArrowRight className="w-5 h-5" />
        </Link>
        <p className="mt-4 text-xs text-text-muted">免费开始，无需信用卡</p>
      </div>
    </section>
  );
}
