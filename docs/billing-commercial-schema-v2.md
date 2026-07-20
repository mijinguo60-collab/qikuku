# 商业模式数据库设计 V2

本文档用于下一阶段 Prisma 迁移设计，不修改现有 `prisma/schema.prisma`，只给出精确的数据库结构建议、职责边界、索引、唯一约束、迁移顺序和回滚方案。

本次 `billing_commercial_v2_foundation` 迁移与短信登录迁移严格隔离。迁移 diff 基线必须包含第 3B 开始前工作区里已存在的短信 schema 漂移，但不能包含本轮新增的计费结构。

## A. 当前模型缺口

当前仓库已经具备这些基础模型：`Plan`、`Subscription`、`PaymentOrder`、`RechargeOrder`、`CreditAccount`、`CreditGrant`、`CreditLedger`、`UsageRecord`、`Company`、`CompanyMembership`。

现有能力可以覆盖“当前状态”和“付款结果”，但有四个关键缺口：

1. `Subscription` 只表达当前订阅状态，不能稳定表达每个付费账期的历史身份。
2. `PaymentOrder` 能表达支付订单和退款时间，但不能稳定表达“账期”与“订单”之间的 1:n 或 1:1 业务边界。
3. `CreditGrant` 可以表达一笔积分来源，但 `sourceType` 仍是自由字符串，且缺少明确的会员月度积分发放运行记录。
4. 永久模型权益目前是纯逻辑层能力，没有独立的持久化授权表，无法审计“来源、撤销、回填、幂等”。

### 现有表的适配性结论

- `Subscription`：适合表示当前有效会员和到期时间，不适合承担“不可变账期历史”。
- `PaymentOrder`：适合表示支付、回调、退款、支付渠道流水，不适合承担“业务账期归档主键”。
- `CreditGrant`：适合表示积分来源本身，适合继续作为余额与过期机制的事实表，但建议补充更明确的 grant 类型枚举语义。
- `CreditLedger`：适合做消费与幂等审计锚点，但不足以独立表达“每月会员积分发放任务”的调度、重试和补发状态。
- `Company` / `CompanyMembership`：足够支撑企业与成员关系，不需要为本阶段改写。

## B. 推荐 Prisma 模型草案

### 1. 月度付费账期表

```prisma
model MembershipBillingPeriod {
  id                 String   @id @default(uuid())
  companyId          String
  subscriptionId     String?
  paymentOrderId     String?
  provider           String
  externalPeriodKey  String
  planCode           String
  billingCycle       MembershipBillingCycle
  periodStart        DateTime
  periodEnd          DateTime
  status             MembershipBillingPeriodStatus
  paymentCompletedAt DateTime?
  refundedAt         DateTime?
  cancelledAt        DateTime?
  invalidatedAt      DateTime?
  invalidationReason String?
  metadataJson       Json?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  company            Company      @relation(fields: [companyId], references: [id], onDelete: Restrict)
  subscription       Subscription? @relation(fields: [subscriptionId], references: [id], onDelete: SetNull)
  paymentOrder       PaymentOrder? @relation(fields: [paymentOrderId], references: [id], onDelete: SetNull)
  pointGrantRuns     MembershipPointGrantRun[]

  @@unique([provider, externalPeriodKey])
  @@index([companyId, periodStart, periodEnd])
  @@index([companyId, billingCycle, status])
  @@index([subscriptionId, periodStart])
  @@index([paymentOrderId])
}
```

### 2. 企业永久权益发放表

```prisma
model CompanyEntitlementGrant {
  id               String   @id @default(uuid())
  companyId        String
  entitlementType  CompanyEntitlementType
  sourceType       CompanyEntitlementSourceType
  sourceId         String
  sourceOrderId    String?
  grantedAt        DateTime @default(now())
  effectiveAt      DateTime?
  revokedAt        DateTime?
  revocationReason String?
  metadataJson     Json?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  company          Company  @relation(fields: [companyId], references: [id], onDelete: Restrict)

  @@unique([companyId, entitlementType, sourceType, sourceId])
  @@index([companyId, entitlementType, revokedAt])
  @@index([sourceOrderId])
  @@index([sourceType, sourceId])
}
```

### 3. 会员月度积分发放运行表

```prisma
model MembershipPointGrantRun {
  id               String   @id @default(uuid())
  companyId        String
  subscriptionId   String
  billingPeriodId  String?
  planCode         String
  grantPeriodKey   String
  grantPeriodStart DateTime
  grantPeriodEnd   DateTime
  scheduledAt      DateTime
  grantedAt        DateTime?
  points           Int
  status           MembershipPointGrantRunStatus
  creditGrantId    String?   @unique
  idempotencyKey   String   @unique
  attemptCount     Int      @default(0)
  lastAttemptAt    DateTime?
  failureReason    String?
  metadataJson     Json?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  company          Company      @relation(fields: [companyId], references: [id], onDelete: Restrict)
  subscription     Subscription @relation(fields: [subscriptionId], references: [id], onDelete: Restrict)
  billingPeriod    MembershipBillingPeriod? @relation(fields: [billingPeriodId], references: [id], onDelete: SetNull)
  creditGrant      CreditGrant? @relation(fields: [creditGrantId], references: [id], onDelete: SetNull)

  @@unique([subscriptionId, grantPeriodKey])
  @@index([companyId, status, scheduledAt])
  @@index([billingPeriodId])
  @@index([subscriptionId, grantPeriodStart])
  @@index([status, scheduledAt])
}
```

### 4. 积分来源类型枚举建议

```prisma
enum CreditGrantType {
  WELCOME
  MEMBERSHIP
  RECHARGE_BASE
  RECHARGE_BONUS
  AGENT_DEMO
  AGENT_LEAD
  MANUAL_ADJUSTMENT
  LEGACY_UNKNOWN
}
```

### 5. 权益来源类型枚举建议

```prisma
enum CompanyEntitlementSourceType {
  MONTHLY_MILESTONE
  ANNUAL_PURCHASE
  SUPER_AGENT_SELF_COMPANY
  ADMIN_GRANT
  LEGACY_MIGRATION
}
```

## C. 枚举草案

建议后续把以下自由字符串逐步收敛成枚举或受控字典：

- `CreditGrant.sourceType`
- `PaymentOrder.orderType`
- `PaymentOrder.status`
- `Subscription.status`
- `Subscription.billingCycle`
- `MembershipBillingPeriod.paymentStatus`
- `CompanyEntitlementGrant.entitlementType`
- `CompanyEntitlementGrant.sourceType`
- `MembershipPointGrantRun.status`

本阶段优先建议只对新增表引入枚举，旧表先保留字符串并通过代码映射兼容，降低迁移风险。

## D. 字段说明

### `MembershipBillingPeriod`

- `externalPeriodKey`：账期稳定主键，幂等核心。应能在支付回调重复执行时保持不变。
- `orderId`：支付订单号，允许为空，因为不同渠道或补单场景不一定先有标准订单。
- `providerPaymentId`：渠道侧支付流水或支付单号，可用于对账，但不应单独作为唯一主键。
- `periodStart` / `periodEnd`：账期边界，必须可用于“是否重叠”的判断。
- `paymentStatus`：建议值包括 `paid`、`pending`、`failed`、`refunded`、`canceled`、`invalidated`。
- `invalidatedAt` / `invalidationReason`：支持人工修正、风控撤销、重复回调作废。

### `CompanyEntitlementGrant`

- `entitlementType`：目前只需要 `ALL_MODELS_PERMANENT`。
- `sourceType`：权益来源类型，决定退款时是否撤销对应来源。
- `sourceId`：来源业务主键，通常是账期 ID、订单 ID 或历史迁移批次 ID。
- `sourceOrderId`：原始订单号，方便人工审计和支付回查。
- `revokedAt` / `revocationReason`：保留审计，不做硬删除。

### `MembershipPointGrantRun`

- `scheduledAt`：本次发放逻辑认为应执行的时间点，便于补偿任务。
- `grantedAt`：实际成功发放时间。
- `status`：建议 `pending`、`granted`、`skipped`、`failed`、`reconciled`。
- `creditGrantId`：实际创建的 `CreditGrant` 外键。
- `idempotencyKey`：幂等锚点，建议与账期强绑定。

### `CreditLedgerAllocation`

- 一条 `CreditLedger` 可以拆到多条 `CreditGrant` 分配。
- 一条 `CreditGrant` 也可以被多条 `CreditLedger` 逐步消耗。
- `amount` 表示本次流水从该 `CreditGrant` 实际扣减的正整数积分。
- 这张表是后续做“先扣将过期积分，再扣长效积分”的核心审计结构。

## E. 索引和唯一约束

### 1. `MembershipBillingPeriod`

推荐唯一约束：

- `@@unique([externalPeriodKey])`

理由：最直接地防止同一支付回调、同一账期重复写入。

推荐索引：

- `@@index([companyId, periodStart])`
- `@@index([companyId, periodEnd])`
- `@@index([companyId, planCode, billingCycle])`
- `@@index([subscriptionId, periodStart])`
- `@@index([paymentStatus, periodEnd])`
- `@@index([providerPaymentId])`

补充评估：

- `companyId + periodStart + periodEnd` 适合排查同一企业的时间重叠，但不宜作为唯一约束，因为不同支付渠道可能存在微小时间差。
- `subscriptionId + periodStart` 可用于订阅下账期查询，不宜唯一，因为同一订阅有多个账期。

### 2. `CompanyEntitlementGrant`

推荐唯一约束：

- `@@unique([companyId, entitlementType, sourceType, sourceId])`

理由：同一来源只发一次，支持多个来源并存。

推荐索引：

- `@@index([companyId, entitlementType])`
- `@@index([sourceOrderId])`
- `@@index([sourceType, sourceId])`
- `@@index([revokedAt])`

### 3. `MembershipPointGrantRun`

推荐唯一约束：

- `@unique idempotencyKey`

推荐索引：

- `@@index([companyId, scheduledAt])`
- `@@index([subscriptionId, scheduledAt])`
- `@@index([billingPeriodId])`
- `@@index([creditGrantId])`
- `@@index([status, scheduledAt])`

### 4. 现有表的补充建议

- `CreditGrant`：建议后续把 `sourceType` 迁移为受控枚举或至少做代码级校验。
- `CreditLedger`：现有 `idempotencyKey @unique` 已足够作为消费与发放幂等锚点。
- `PaymentOrder`：`providerTransactionId @unique` 已能防重，但不足以表达账期。
- `CreditGrant.grantType`：本次迁移先保持 nullable，避免历史流水回填时伪造来源。
- `MembershipPointGrantRun.creditGrantId`：建议保持一对一关系，成功发放后最多关联一条 `CreditGrant`。
- `MembershipPointGrantRun.points` 必须为正整数。
- `MembershipPointGrantRun.grantPeriodEnd` 必须晚于 `grantPeriodStart`。
- `MembershipBillingPeriod.periodEnd` 必须晚于 `periodStart`。
- 以上时间与金额约束首期由服务层校验，未来可补数据库 CHECK。

## F. 关系设计

### 1. 订阅、账期、权益、积分之间的关系

推荐关系为：

- `Subscription` 代表企业当前订阅状态。
- `MembershipBillingPeriod` 代表每个付费账期事实。
- `CompanyEntitlementGrant` 代表从某个账期或某次购买导出的永久权益。
- `CreditGrant` 代表所有积分来源，包括欢迎、会员、充值、代理、自定义调整。
- `CreditLedger` 代表所有余额变化与幂等流水。

### 2. 新购买完整调用链

1. 创建或更新 `PaymentOrder`。
2. 支付成功后完成 `PaymentOrder` 回写。
3. 依据订单生成或定位唯一 `MembershipBillingPeriod`。
4. 若订单属于会员购买，写入或更新对应 `Subscription` 当前状态。
5. 依据账期发放当期 `MEMBERSHIP` 积分。
6. 若符合永久条件，写入 `CompanyEntitlementGrant`。
7. 全过程都以 `orderNo`、`providerTransactionId`、`externalPeriodKey`、`idempotencyKey` 做幂等。

### 3. 退款完整调用链

1. 定位 `PaymentOrder`。
2. 标记订单退款。
3. 定位对应 `MembershipBillingPeriod`，保留记录，不删除。
4. 将该账期标记为 `refunded` 或 `invalidated`。
5. 若存在对应 `CompanyEntitlementGrant` 来源，则仅撤销该来源。
6. 重新计算企业是否仍有其他未撤销永久来源。
7. 如永久来源全失效且没有有效会员，则降回 DeepSeek 权限。

### 4. 月度积分发放调用链

1. Cron 或支付成功触发器扫描应发账期。
2. 创建 `MembershipPointGrantRun`，幂等键绑定账期。
3. 创建 `CreditGrant`，`sourceType = MEMBERSHIP`，`sourceId` 绑定账期或运行记录。
4. 写 `CreditLedger`。
5. 更新 `CreditAccount` 缓存。
6. 若任务重复执行，命中 `idempotencyKey` 后跳过。

## G. 推荐修改的现有模型

### `Subscription`

建议后续不再让它承担历史账期职责，仅保留：

- 当前订阅状态
- 当前计费周期
- 当前到期时间
- 自动续费状态

### `PaymentOrder`

建议保留现状，并在后续迁移中补充与账期的显式关联字段或映射层，不强行删除旧字段。

### `CreditGrant`

建议后续引入受控枚举，至少通过代码层确保：

- `WELCOME`
- `MEMBERSHIP`
- `RECHARGE_BASE`
- `RECHARGE_BONUS`
- `AGENT_DEMO`
- `AGENT_LEAD`
- `MANUAL_ADJUSTMENT`
- `REFUND`

### `CreditLedger`

建议保留现有结构，后续只补充更明确的 `featureType` / `metadataJson` 约定，不改变消费事务模型。

## H. 积分分账设计

### 1. 是否需要 `CreditGrantType`

建议需要。

原因：当前 `sourceType` 是字符串，虽然能跑，但难以保证新商业模型下的来源稳定性、审计性和测试可读性。

### 2. `sourceType` 和 `grantType` 是否重复

不完全重复。

- `grantType` 适合表达“这笔积分属于什么用途或生命周期桶”。
- `sourceType` 适合表达“这笔积分从哪个业务事件而来”。

如果后续要减少复杂度，也可以让 `grantType` 成为唯一受控枚举，而把 `sourceType` 保留为外部来源字典，但不建议两者都继续无约束扩张。

### 3. 是否需要 `transferable`

建议不作为第一优先字段。

当前规则里代理自用演示积分、拓客积分、会员积分、充值积分的使用边界更适合由：

- `sourceType`
- `usageScope`
- `restrictedCompanyId`

共同表达。

本次数据库迁移不落 `usageScope`，等代理账户模型可稳定表达后再做。

### 4. 是否需要 `restrictedCompanyId` 或 `usageScope`

建议需要至少一个语义明确的约束字段。

推荐：

- `usageScope`：`COMPANY_ONLY` | `AGENT_SELF_COMPANY_ONLY` | `NEW_CUSTOMER_ONLY` | `GLOBAL`
- `restrictedCompanyId`：当积分只允许用于单一企业时使用

### 5. `AGENT_DEMO` 约束

建议 `usageScope = AGENT_SELF_COMPANY_ONLY`，并在 grant 创建时绑定代理自用企业 ID。

### 6. `AGENT_LEAD` 约束

建议：

- 只能发给从未付费的新企业。
- 单企业累计上限 3000。
- 14 天有效。
- 与代理主账户和被拓企业的关系需要有明确来源审计。

### 7. 事务与并发

积分扣除跨多个 `CreditGrant` 时应保持在同一数据库事务内，并通过：

- `CreditGrant.remainingAmount` 原子递减
- `CreditLedger.idempotencyKey` 唯一约束
- `CreditAccount` 乐观或悲观锁

防止并发超扣。

### 8. 余额不一致修复

建议增加独立的余额核对脚本，按 `CreditGrant.remainingAmount` 汇总重建 `CreditAccount` 缓存，并输出不一致清单。

## I. 月度积分发放设计

### 方案比较

#### 方案 A：只用 `CreditGrant` 幂等

优点：

- 表更少。
- 发放与余额来源天然合一。

缺点：

- 难以表达调度、漏跑补发、失败重试、重复执行和人工补偿。
- 对审计不够清晰。

#### 方案 B：新增 `MembershipPointGrantRun`

优点：

- 调度、执行、失败、补发、重试状态清晰。
- 适合 cron、补偿任务和人工修复。
- 更容易跟账期和订单做幂等绑定。

缺点：

- 多一张表。

### 推荐结论

推荐方案 B。

原因是会员月度积分发放本质上是“周期任务 + 可重试发放”，仅靠 `CreditGrant` 不足以覆盖漏跑补发与失败重试语义。

### 场景覆盖

- 月卡首次支付后的当期积分：支付成功即创建对应运行记录并发放。
- 年卡每月积分：每月定时触发运行记录。
- 定时任务重复运行：`idempotencyKey` 命中则跳过。
- 定时任务漏跑：根据未发账期补发。
- 会员提前取消：未来未到期账期不再创建新的运行记录。
- 退款：对应账期失效，未发的月份不再发，已发的月度积分按回填策略决定是否冲正。
- 升级或降级：账期粒度保持独立，不让订阅当前状态覆盖历史已发记录。
- 同一自然月中级升级高级：建议以“实际账期”而不是自然月粗分，避免混发。
- 订阅到期后：不再继续发放。

## J. 历史数据回填策略

### 1. 历史 trial 订阅

- 回填为试用订阅事实，不补造付费账期。
- 仅用于展示和兼容读取。

### 2. 历史 basic / custom 订阅

- 保留为 legacy 兼容记录。
- 不自动降级为 trial。
- 不强行回写为新会员 code。

### 3. 历史 pro / enterprise 订阅

- 依据可确认的支付成功订单回填 `MembershipBillingPeriod`。
- 能明确账期的，按账期回填。
- 无法确认的，进入人工审核清单。

### 4. 历史充值积分

- 保留 `CreditGrant` / `CreditLedger` 原始流水。
- 无法确知来源时，不伪造精确来源。

### 5. 历史套餐积分

- 若能从订单或账期精确推导，回填为 `MEMBERSHIP`。
- 不能精确推导时，保留旧流水，不强行改写。

### 6. 历史赠送积分

- 按已有 `sourceType` 和流水解释。
- 若来源不可判定，进入人工审核。

### 7. 历史已购买年卡客户的永久模型权益

- 只在能明确找到年卡成功订单时回填 `CompanyEntitlementGrant`。
- 无法确认时不自动发放。

### 8. 历史累计购买 3 个月月卡客户的永久模型权益

- 仅当能从账期表或可核验订单精确证明 3 个有效月度账期时再回填。
- 不足证据不自动授予。

### 9. 回填执行规范

- 所有回填脚本默认 `dry-run`。
- 必须显式 `--apply` 才可写入。
- 生产环境必须额外 `--allow-production`。
- 不能对模糊数据进行自动推断。

## K. 分阶段迁移顺序

建议顺序如下：

1. 新增 `MembershipBillingPeriod`、`CompanyEntitlementGrant`、`MembershipPointGrantRun`，不改旧字段。
2. 兼容读取代码先上线，继续读旧 `Subscription` / `PaymentOrder` / `CreditGrant`。
3. 新支付流程开始双写账期表。
4. 新永久模型权益开始写独立授权表。
5. 新会员积分发放开始写 `MembershipPointGrantRun` 与 `CreditGrant`。
6. 历史数据 dry-run 回填。
7. 分批小流量 `--apply` 回填。
8. 核对余额、订阅、账期、权益一致性。
9. 前端或服务端逐步切换到新读取逻辑。
10. 最后再考虑废弃旧兼容逻辑。

## L. 回滚方案

### 1. schema 迁移回滚方式

- 只做向后兼容增加，不删除旧列。
- 如果新表有问题，业务读取层可立即切回旧逻辑。

### 2. 新表存在但业务暂时停用

- 保留新表数据。
- 读取层回退到 `Subscription`、`PaymentOrder` 和现有积分流水。

### 3. 双写失败

- 先保证旧链路成功。
- 新链路失败时落告警和待补偿队列，不直接回滚用户支付结果。

### 4. 积分发放错误

- 不直接改历史流水。
- 使用冲正流水或退款流水修正。

### 5. 永久权益误发

- 仅撤销对应 `CompanyEntitlementGrant` 记录。
- 保留审计和撤销原因。

### 6. 迁移期间避免重复发积分

- 账期、发放运行记录、CreditLedger 三层幂等。

### 7. 回滚不删除客户现有数据

- 所有新表均保留历史。
- 旧表不删除，不重命名，不硬清空。

## M. 尚未确定的问题

1. `MembershipBillingPeriod.externalPeriodKey` 最终由哪个支付渠道字段拼接最稳妥，需要结合微信、支付宝、手工单分别落地。
2. 年卡退款对已发月度会员积分的冲正策略是否需要细化到“已消费部分不追扣、未消费部分回收”。
3. `CreditGrant.sourceType` 是否最终完全迁移为枚举，还是保留字符串兼容更久。
4. `MembershipPointGrantRun` 是否需要再拆出独立的调度队列表，视后续 cron 复杂度决定。
5. `AGENT_LEAD` 的“新企业”定义是否要以“首个付费订单之前”作为严格判定。

## N. 本次迁移最终确认

1. `MembershipBillingPeriod.externalPeriodKey` 使用 `provider + externalPeriodKey` 复合唯一。
2. 不对时间范围设置数据库唯一约束。
3. `MembershipPointGrantRun` 拥有独立 `grantPeriodKey`，并保存 `planCode` 与 `points` 快照。
4. `CreditLedgerAllocation` 用于一笔流水拆分多笔 `CreditGrant`。
5. `CreditGrant.grantType` 初始保持 nullable。
6. 代理积分 `usageScope` 继续暂缓到代理账户模型阶段。
7. 本次迁移只新增结构，不做历史数据回填。

## 补充结论

### 当前 `Subscription` 是否能准确表达每个付费账期

不能。

原因：它只保留当前订阅状态和到期时间，没有账期历史主键，也没有“同一企业多账期去重”的结构。

### 当前订单是否有唯一 orderId、支付完成时间、退款时间和服务周期

部分具备。

- `PaymentOrder.orderNo` 和 `providerTransactionId` 可做订单与支付流水唯一性。
- `paidAt`、`refundedAt`、`billingCycle`、`planCode` 已存在。
- 但还缺少稳定账期主键和外部账期键。

### 当前是否已经存在 `billingPeriodId`

没有。

### 当前 `CreditGrant.sourceType` 是字符串还是枚举

字符串。

### 当前 `CreditGrant` 是否已能支持这些来源

结构上可以通过字符串承载，但缺少受控枚举与更明确的语义治理：

- `WELCOME`
- `MEMBERSHIP`
- `RECHARGE_BASE`
- `RECHARGE_BONUS`
- `AGENT_DEMO`
- `AGENT_LEAD`
- `MANUAL_ADJUSTMENT`

### 当前 `CreditGrant` 是否已有这些字段

- `originalAmount`：有。
- `remainingAmount`：有。
- `expiresAt`：有。
- `sourceId`：有。
- `idempotencyKey`：不在 `CreditGrant`，而是在 `CreditLedger`。

### 当前 `CreditLedger` 是否能完整记录每次积分消耗来自哪一笔 `CreditGrant`

大体能，但需要依赖 `grantId` 和 `metadataJson`，并且消费过程必须严格维护事务。

### 当前 `Subscription` 是否适合继续承担月度积分发放时间

不适合。

应由 `MembershipBillingPeriod` 和 `MembershipPointGrantRun` 承担。

### 当前退款模型是否足够支持撤销永久权益

不够。

需要独立的 `CompanyEntitlementGrant`。

### 当前数据库里是否已经存在类似 `Entitlement`、`Benefit`、`FeatureGrant` 的表

没有。
