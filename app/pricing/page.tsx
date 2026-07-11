import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import Link from 'next/link';
import { PLAN_CATALOG } from '@/lib/billing/pricing';

const displayPlans = PLAN_CATALOG.map((plan) => ({ ...plan, price: plan.code === 'custom' ? '¥5,000/月起' : plan.monthlyPrice ? `¥${plan.monthlyPrice / 100}/月` : '¥0' }));

export default function PricingPage() {
  return <main className="min-h-screen bg-white"><Navbar />
    <section className="max-w-7xl mx-auto px-6 pt-24 pb-20 text-center"><h1 className="text-4xl md:text-5xl font-bold text-text-primary mb-4">价格方案</h1><p className="text-lg text-text-secondary max-w-2xl mx-auto mb-4">套餐权限与 AI 算力积分独立管理，充值积分不会自动解锁高级套餐。</p><p className="text-sm text-text-muted mb-14">支付通道开通前，可先提交购买申请，由平台顾问协助开通。</p>
      <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-4 text-left">{displayPlans.map(plan => <div key={plan.code} className={`rounded-2xl border p-6 flex flex-col ${plan.code === 'pro' ? 'border-text-primary shadow-hover' : 'border-border-light'}`}>
        {plan.code === 'pro' && <span className="text-xs font-semibold text-text-primary bg-surface-tertiary px-3 py-1 rounded-full self-start">推荐</span>}<h2 className="text-xl font-bold text-text-primary mt-4">{plan.name}</h2><p className="text-2xl font-bold mt-3">{plan.price}</p><p className="text-xs text-text-muted mt-2">{plan.yearlyPrice ? `年付 ¥${plan.yearlyPrice / 100}` : plan.code === 'trial' ? '14 天有效期' : '按合同配置'}</p><div className="border-t border-border-light my-5" />
        <p className="text-sm font-medium">{plan.monthlyCredits ? `${plan.monthlyCredits.toLocaleString()} 积分/月` : plan.code === 'trial' ? '首次赠送 3,000 积分' : '积分按合同配置'}</p><ul className="space-y-2 mt-4 flex-1">{plan.features.map(feature => <li key={feature} className="text-xs text-text-secondary">✓ {feature}</li>)}</ul><Link href="/contact" className={`mt-6 block text-center py-3 rounded-xl text-sm font-medium ${plan.code === 'pro' ? 'bg-text-primary text-white hover:opacity-90' : 'bg-surface-secondary text-text-primary hover:bg-surface-hover'}`}>联系开通</Link>
      </div>)}</div>
    </section><Footer />
  </main>;
}
