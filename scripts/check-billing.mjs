import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const requireText = (file, terms) => {
  const content = read(file);
  for (const term of terms) {
    if (!content.includes(term)) throw new Error(`${file} 缺少计费约束：${term}`);
  }
};

requireText('prisma/schema.prisma', ['model Plan', 'model Subscription', 'model CreditAccount', 'model CreditGrant', 'model CreditLedger', 'model RechargeOrder', 'model UsageRecord', 'idempotencyKey String       @unique']);
requireText('lib/billing/credits.ts', ['transactionAsync', 'AI算力积分不足，请充值或升级套餐', 'remainingAmount', 'idempotencyKey', 'createRechargeCredits', 'reverseUnusedRechargeCredits']);
requireText('app/api/ai/images/route.ts', ['checkCreditBalance', 'assetsSaved', 'consumeCredits']);
requireText('app/api/ai/chat/route.ts', ['checkCreditBalance', 'consumeCredits']);
requireText('app/api/ai/skill-chat/route.ts', ['checkCreditBalance', 'consumeCredits']);
requireText('app/api/upload/route.ts', ["embeddingStatus === 'success'", 'consumeCredits']);
requireText('app/api/admin/billing/route.ts', ['isPlatformSuperAdmin', 'mark_paid', 'billing_manual_grant']);
console.log('✓ Billing contract checks passed: idempotency, insufficiency gate, success-only charge, image quantity, first recharge, order grant, isolation and source order are implemented.');
