# 2026-10-14 产品就绪审查：六项源码修复与上线验收计划

范围：自营多品牌，首个目标市场 US / en / USD。外部独立商户、订阅收费和商户账务后置。用户已确认先执行六项缺陷与客服生产构建阻断修复；本文记录源码审查及**已批准的首批计划**，不授权部署或改变第三方状态，不使用简单完成百分比。

## 证据边界

- 历史合并及 CI 证据以 [product-audit-status.md](product-audit-status.md)、[product-audit-remediation.md](product-audit-remediation.md) 为准；历史通过不能替代当前工作区或生产验收。
- 本批已修复 COM01/02、PLG01/02、ADMIN01/02 六处调用链/品牌/权限/队列缺陷，并修客服页面 PPR 边界。未运行真实 Stripe、Chatwoot、广告、邮件或生产环境联调，不能判定整体上线完成。
- 审查初期 localhost 无运行服务，两个 Docker contexts 均不可连接；继续任务后父任务恢复 localVM，原 Saleor API/数据库与旧构建 Storefront/Dashboard 已启动。它们不是本批源码部署验证；父任务使用 Node 24 和 `NEXT_PUBLIC_SALEOR_API_URL=../backend/saleor/graphql/schema.graphql` 执行修复前基线 Storefront verify：214 个测试文件 / 1,272 项单元测试和 12 项品牌检查通过；日志 `.local/product-audit-20261014-verify.log`。修复后的完整 verify/build 结果见下文。
- 保留现有 Dashboard 侧栏、Ops iframe 修复、设计稿及其他未提交改动；具体状态见 [development-coordination.md](development-coordination.md)、[ops-embedded-navigation.md](ops-embedded-navigation.md)。不重复把已修复的内层导航问题列作新缺陷。

修复后使用真实 Saleor `:8000` schema 完整 verify：222 文件 / 1,321 项通过，2 项可选 Chrome 测试跳过；12 项品牌检查通过；ESLint 0 errors / 21 项既有 warnings，日志 `.local/product-audit-20261014-final-verify.log`。Next 16.3.8 优化生产构建/PPR 通过，日志 `.local/product-audit-20261014-build.log`。独立真实 Chrome 组件套件 6 项通过（含 2 项浏览器测试，CSS 隔离组件验证，不是支付联调）。

本次源码生产构建曾在隔离 `127.0.0.1:3105` 运行，build/runtime 使用临时只读 audit-default 品牌映射到实际 `default-channel`；没有写入商品/订单。Basic 隔离运营账号下 4 项浏览器回归通过（48.1 秒）：英文 22 路由、中文 22 路由、真实 Next iframe 客服→设置→返回、语言链接持久性；日志 `.local/product-audit-20261014-browser.log`。父任务视觉检查品牌页/中文客服/嵌入设置正常。运行日志仅有既有 metadataBase warning；真实 Saleor 员工 SSO 轮询、Stripe/provider 均未实际联调。旧 `:3000` / `:9000` 构建没有更新，没有生产部署。

## 页面关系与职责

| 页面层          | 入口及下游                                                                            | 权威边界/验收重点                                                   |
| --------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 原生 Dashboard  | 首页、订单、商品、客户、营销、Channels、Apps、Settings                                | 复用 Saleor 路由/权限，不新建平行商品或订单系统                     |
| Dashboard → Ops | `/commerce-ops` → `/commerce-admin/sso` → `/api/admin-sso/exchange` → `/ops/*` iframe | 同源消息、真实员工校验、短时 HttpOnly 会话；菜单隐藏不授权          |
| 官方 Ops App    | Manifest / App 配置 → 已有 Ops 功能页                                                 | 区分源码、安装、品牌配置、真实验收；部署 origin 与 API 可达地址不同 |
| 经营分析        | 总览 → 实时/流量/结账/商品/催付/广告投递                                              | 页面与轮询 API 同权限；金额区分币种，分析收入不冒充到账             |
| 品牌站点        | 列表 → 品牌概况/insights/realtime/catalog/fulfillment/tracking/readiness              | 服务端品牌/channel 范围及各目标按钮权限                             |
| 装修与翻译      | 品牌首页/PDP 模板 → 预览/发布；翻译 → 队列/草稿/审核/发布                             | 复用编辑器与原生商品数据；失败不能伪装成功                          |
| 客服            | 会话工作台 → 设置 → 返回；前台点击加载客服                                            | 工作台/设置权限不同；iframe 往返和独立 Ops 两种显示均验证           |
| 顾客购买        | 品牌首页 → PDP → 购物车 → Checkout → 支付 → 订单确认/查单                             | Host/channel/订单所有权、品牌标识、支付恢复与防重复                 |

本批 Ops 已补 realtime 权限映射、按目标权限显示品牌/客服按钮并增加直接商品检查入口；客服身份读取移入页面自身 Suspense，使用骨架加载态。针对性 4 文件 / 21 项单元与服务器渲染权限矩阵、目标 ESLint 和差异空白检查通过；最终全量、生产构建和隔离浏览器结果已记录于上方。

源码入口：`dashboard/src/components/CommerceOpsPage/CommerceOpsPage.tsx`、`storefront/src/lib/ops/navigation.ts`、`storefront/src/lib/ops/authorization.ts`、`storefront/src/middleware.ts`。导航历史证据见 [admin-navigation.md](admin-navigation.md)、[navigation-audit.md](navigation-audit.md)。

## 七个系统插件：配置与就绪矩阵

当前环境探测：旧运行容器未配置 analytics/theme 持久化、`SALEOR_APP_TOKEN`、Resend/品牌发件人/Cron、Chatwoot/WhatsApp/AI、翻译 token/模型/存储/worker，也没有 `STOREFRONT_SITES_JSON`。真实 Core 只有启用的 USD `default-channel`，不具备本批生产品牌配置。`GOOGLE_MERCHANT_FEED_ENABLED` 仅确认字段存在，未核对有效值，不能据此称已启用。未输出凭据。下表是所需依赖与验收矩阵，不代表当前已配置。

注册依据：`storefront/src/plugins/system/registry.ts:15`。集成类型是源码结构描述，不是可用等级；统一暂停配置为 `SYSTEM_PLUGINS_DISABLED`。不根据登记记录推断生产已配置。

| 插件 / 源码集成            | 既有配置或依赖                                                                                                                                                                                                                     | 本次就绪判定与目标验收                                                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| theme-builder / 模块化     | `THEME_LIBSQL_URL` / `THEME_LIBSQL_AUTH_TOKEN`、发布权限；AI 图片沿 `THEME_AI_ENCRYPTION_KEY` / `THEME_AI_ALLOWED_ENDPOINTS`                                                                                                       | 已有编辑器，不接管其他任务 AI 业务；真实品牌 draft→publish→前台、冲突/回滚/暂停后核心页面；[装修说明](theme-editor-pr2.md) / [AI](theme-editor-ai.md) |
| analytics / 部分           | `ANALYTICS_LIBSQL_URL` / `ANALYTICS_LIBSQL_AUTH_TOKEN`、`NEXT_PUBLIC_ANALYTICS_CONSENT_MODE`、可信品牌/channel                                                                                                                     | ADMIN01 源码阻断已修，真实 SSO 待联调；继续订单/退款与持久化数据核对，停用时无新增采集；[分析说明](analytics-saleor-ui-v3.md)                         |
| ads-tracking / 部分        | `ADS_SERVER_SITES_JSON`、`GA4_API_SECRET`、`META_CONVERSIONS_API_TOKEN`、`TIKTOK_EVENTS_API_ACCESS_TOKEN`；浏览器 ID 和同意状态                                                                                                    | 账户/正式投递未联调；目标验证品牌隔离、去重、撤回同意和真实漏斗回执；[广告/分析说明](analytics-saleor-ui-v3.md)                                       |
| payment-reminders / 模块化 | `RESEND_API_KEY`、`PAYMENT_REMINDER_SITES_JSON`、`ANALYTICS_LIBSQL_URL` / `ANALYTICS_LIBSQL_AUTH_TOKEN`；`PAYMENT_REMINDER_CRON_SECRET` 与既有规则                                                                                 | 历史测试不替代真实 Resend 发信/Cron；验证收件人/品牌语言/链接、防重复和失败重试；[催付说明](analytics-payment-reminders.md)                           |
| customer-support / 模块化  | `SUPPORT_CHATWOOT_BASE_URL` / `SUPPORT_CHATWOOT_SITES_JSON` / `SUPPORT_CHATWOOT_AGENT_TOKENS_JSON` / `SUPPORT_WHATSAPP_SITES_JSON`；AI 使用 `SUPPORT_AI_BOTS_JSON` / `SUPPORT_AI_WORKER_SECRET` 与持久账本                         | 配置页只表示本地格式校验；真实消息收发、超时重试、跨品牌负例和人工接管仍须验收；[客服](customer-support.md) / [AI 客服](customer-support-ai.md)       |
| ai-translations / 部分     | `TRANSLATION_SALEOR_TOKEN`、`TRANSLATION_LIBSQL_URL` / `TRANSLATION_LIBSQL_AUTH_TOKEN`、`TRANSLATION_AI_BASE_URL` / `TRANSLATION_AI_API_KEY` / `TRANSLATION_AI_MODEL`、`TRANSLATION_WORKER_SECRET` / `TRANSLATION_PUBLISH_ENABLED` | PLG01/02 源码已修；真实队列中断恢复、并发防重、完整批次和审批后原生重读；[翻译说明](translation-management-center.md)                                 |
| seo-merchant / 内联        | `GOOGLE_MERCHANT_FEED_ENABLED` / `GOOGLE_MERCHANT_FEED_MAX_PAGES` / `GOOGLE_MERCHANT_FEED_BUDGET_MS`；可信品牌/SKU/价格/政策                                                                                                       | 基础 metadata/canonical/sitemap/JSON-LD 属核心；真实 Merchant 诊断、Feed 暂停不破坏核心 SEO；[Merchant 说明](seo-google-merchant.md)                  |

外部状态恢复依赖正式备份回执。17 个插件表与核心运营契约按已有发布流程检查；凭据不得写入文档或浏览器。详细约束见 [product-audit-status.md](product-audit-status.md) A08/A23。

## 六项已完成源码修复及验收终点

| ID / 优先级  | 根因与触发                                                                                                                                   | 最小修复方向                                                                                                                                                                 | 必须通过的验收                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| COM01 / P1   | Stripe 把 transaction ID 传给 `processCheckoutTransaction`；该 Action 调用 checkout 变量 Host guard，多品牌按 Checkout ID 查验而拒绝合法交易 | 沿既有 transport/Action 校验交易与所属 checkout/order；多品牌支付前校验服务器专用 `SALEOR_APP_TOKEN` 具有交易查询能力，不足时在 PSP 扣款前失败；保留 Host/channel/所有权边界 | 所属品牌交易 process 成功；外品牌/无归属拒绝；返回恢复和中断授权路径同覆盖；真实 Stripe 明确另行联调 |
| COM02 / P2   | Checkout/订单确认及 skeleton 调用共享 Logo 未传品牌参数，回落 Paper 资源/alt                                                                 | 复用可信品牌配置和共享 Logo，贯通正常页、加载态与订单确认                                                                                                                    | 两品牌与缺 logo 名称回退；桌面/375px、加载态和返回首页链接无串品牌                                   |
| PLG01 / P1   | `claimNext` 只恢复 `processing AND revision<3`；revision 同时用于编辑/CAS，多次重试后崩溃条目永久卡住                                        | 超过 15 分钟的 processing 转 failed，允许明确手动 Retry；CAS 版本不作为恢复上限；publishing/不确定结果绝不自动重试                                                           | 较高 revision 的过期处理中任务可恢复或明确失败；并发 CAS、重试上限及 worker 中断验证                 |
| PLG02 / P1   | `createJob` 活跃检查、job 写入和逐条 item 写入非原子；并发重复批次/模型消耗，部分写入仍推进 cursor                                           | 复用存储事务/批处理体系，原子建立完整批次并约束同范围并发；不持锁调用外部 API                                                                                                | 并发创建只保留一个有效批次；第 N 条写失败无半批/游标丢失；重试后商品完整无跳页；本批无迁移           |
| ADMIN01 / P1 | `/ops/api/analytics/realtime` 未映射 Saleor 权限，SSO 页面允许但轮询 403                                                                     | 复用权限解析器补实际 API 路径；未知路径继续关闭                                                                                                                              | ORDERS/SETTINGS 员工页面/API允许；无关权限、受限 channel 全局 API 拒绝；浏览器真实刷新               |
| ADMIN02 / P2 | 品牌卡片和客服设置链接按角色展示，而不是目标权限；“platform_admin”不代表所有 Saleor 权限                                                     | 复用 `isSaleorOpsRequestAllowed` 过滤目标链接，客户端接收服务器派生能力                                                                                                      | products-only/orders-only/settings-only/Basic 管理员矩阵；按钮不可达时隐藏，iframe 设置往返保留      |

精确定位（相对仓库根）：

- COM01：`storefront/src/app/(checkout)/actions.ts:563`；`storefront/src/checkout/components/payment/stripe/execute-stripe-checkout-payment.ts:110`、`:343`；`storefront/src/checkout/components/payment/stripe/use-stripe-return-completion.ts:85`。
- COM02：`storefront/src/ui/components/shared/logo.tsx:23`；`storefront/src/checkout/views/saleor-checkout/checkout-header.tsx:46`、`checkout-header-skeleton.tsx:22`；`storefront/src/checkout/views/order-confirmation/order-confirmation-page-shell.tsx:31`、`order-confirmation-header-skeleton.tsx:15`。
- PLG01：`storefront/src/plugins/ai-translations/store.ts:137`、`:143`、`:163`；PLG02：同文件 `:83`、`:89`、`:106`、`:109`。
- ADMIN01：`storefront/src/lib/ops/authorization.ts:175`、`:195`；`storefront/src/app/ops/analytics/realtime/realtime-dashboard.tsx:43`。
- ADMIN02：`storefront/src/app/ops/sites/page.tsx:168`、`:184`；`storefront/src/app/ops/support/_components/chat-workbench.tsx:211`、`:245`；权限规则 `storefront/src/lib/ops/authorization.ts:178`。

另有审查时已知部署阻断：客服调用 `currentOpsViewer()` 缺页面自身 Suspense 边界，见 [ops-embedded-navigation.md](ops-embedded-navigation.md)。本批已将身份与运行时品牌读取移入页面自身 Suspense 并加入骨架态；生产构建及隔离生产请求未再出现 `blocking-prerender-dynamic`，本项源码/构建阻断已验证。

## 分阶段最终目标（首阶段已批准，后续按实际验收推进）

1. **阶段一：六缺陷与构建闸门已完成。** 六项源码修复、客服 PPR、完整 verify、生产 build 与上述浏览器回归通过；真实员工 SSO、支付与第三方状态未实际联调，不扩大完成结论。
2. **阶段二：目标市场真实闭环。** 真实两品牌，从 Dashboard 员工入口到商品/装修/订单/支付/物流/客服与分析；验证撤权、logout、外品牌、375px、失败恢复。正式支付/消息/投递需真实账户，代码检查不能替代。
3. **阶段三：运营完整性。** 按既有 A01–A24 清单补品牌发布、商品运营、政策/本地化、广告对账、退货/异常物流、隐私与生产性能。逐项先确认已有原生能力和数据契约，再增功能。
4. **后置阶段：外部商户。** 只有独立租户隔离、入驻与安全验收完成后，才讨论订阅及商户账务。

阶段一的六项源码、客服 PPR、完整 verify、生产 build 与上述浏览器回归已通过；真实员工 SSO、支付与第三方状态未实际联调，不扩大完成结论。仅补配置不能补齐产品能力：多品牌翻译正式发布仍因原生全局译文隔离而刻意关闭；WhatsApp 当前是点击跳转入口，不是 Business API、消息同步或身份认证。

仍缺能力：版本化品牌 CRUD/域名所有权与中断恢复；新商品/SKU CSV 创建更新及持久恢复；完整政策/通知语言发布；品牌广告全漏斗/成本利润口径；真实客服订单上下文与 AI 接管；异常物流/退货/通知重试；大目录生产规模及隐私删除/保留策略。范围与历史证据以状态表为准，不另造已实现接口。

## 真实集成与发布验收清单

- 独立测试环境和真实 Saleor：所属/外品牌、受限渠道、权限撤销/logout；SSO cookie 最长五分钟快照不能宣称即时撤权。
- 浏览器：原生 Dashboard 功能/入口、Ops API 与按钮、iframe/独立 Ops、两个品牌 Checkout/订单确认、375px 和加载态。
- 支付：真实目标收单资格/凭证、3DS、transaction process/返回恢复、防重、订单金额状态及退款对账；不得把 Dummy 当正式通过。
- 外部服务：真实 Resend/Cron、Chatwoot/WhatsApp/AI、广告及签名 Webhook；逐项记录“配置校验/沙盒/正式联调”。
- 部署：公开 URL、build/runtime 品牌/locale/channel 一致；TLS/CORS/私网、凭据、对象存储及数据库恢复回执。Storefront 重建后确认 Dashboard Nginx upstream 重新解析。
- `paper doctor` 检查代理技能/文档安装健康，`--env` 仅检查 Saleor URL；不是生产 provider 就绪工具。发布前按 `scripts/deploy.sh` / `scripts/release.py` 的既有恢复闸门执行，须明确部署授权。

## 新开窗口继续

在 Codex 新窗口打开 `/Users/algive/sloar-saas`，发送：

> 阅读 docs/product-readiness-audit-2026-10-14.md、docs/development-coordination.md 及各子项目 AGENTS.md。当前为自营多品牌 US/en/USD，外部商户/订阅后置。六项源码、客服 PPR、全量 verify/build 与隔离浏览器回归已通过，先读取实际证据，避免重复开发，不重复询问已批准范围；保留所有未提交侧栏、Ops iframe 和设计改动。下一步沿阶段二/真实配置验收清单，核对生产品牌 US/en/USD、持久化及服务凭证；按现有权限边界验收真实员工 SSO、支付、客服/邮件/广告，缺资料时明确指出所需配置及尚缺产品能力。真实 Stripe、Chatwoot、广告、邮件和部署未联调时必须明确说明。不要泄露凭据，不部署或改第三方状态，除非用户另行授权。

验收结束后隔离 `:3105` 已停止，Colima VM 已恢复到测试前停止状态，记录 `.local/product-audit-20261014-runtime-cleanup.log`。运行环境曾恢复仅为验证用途，不能把短时服务启动当作生产品牌已配置或正式部署。
