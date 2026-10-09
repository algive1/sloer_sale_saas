# 多语言管理中心（后台 V1）

路径：\`/ops/translations\`（受现有 \`ANALYTICS_DASHBOARD_SECRET\` Basic Auth 保护），入口在系统插件页。

本期真正实现：现有 UI 翻译 JSON 覆盖率、品牌/Channel/语言筛选、批量排队前 10 件商品、libSQL 任务保存、外部 Worker 逐条生成、原文/译文对照、人工编辑/退回/批准、仅单品牌情况下可选的安全发布、失败重试。

## 配置

\`\`\`dotenv
ANALYTICS_DASHBOARD_SECRET=YOUR_ADMIN_BASIC_AUTH_SECRET
STOREFRONT_CHANNELS=us
NEXT_PUBLIC_STOREFRONT_LOCALES=en,de,fr
NEXT_PUBLIC_STOREFRONT_LOCALE_CHANNELS=en:us,de:us,fr:us

# 使用 ANALYTICS_LIBSQL_URL / ANALYTICS_LIBSQL_AUTH_TOKEN，
# 或者指定一组独立凭证（不能只设置其中一项）。
TRANSLATION_LIBSQL_URL=
TRANSLATION_LIBSQL_AUTH_TOKEN=

# 服务端 ONLY：需要 MANAGE_PRODUCTS 和 MANAGE_TRANSLATIONS 的专用服务 token。
TRANSLATION_SALEOR_TOKEN=
TRANSLATION_AI_BASE_URL=https://your-approved-model.example/v1
TRANSLATION_AI_API_KEY=
TRANSLATION_AI_MODEL=
TRANSLATION_WORKER_SECRET=REPLACE_WITH_RANDOM_SECRET_LONGER_THAN_32_CHARS
# 默认关闭 Saleor 正式写入
TRANSLATION_PUBLISH_ENABLED=0
\`\`\`

\`SALEOR_INTERNAL_API_URL\` 优先用于后台到 Saleor 通信，在 Compose 内部是 \`http://api:8000/graphql/\`。
管理员表单不能指定 AI 主机名和 Token，不能修改商品 ID 或品牌归属。
生产应使用可信反向代理/TLS 与隔离服务网络。

## 使用

1. 在 \`/ops/translations\` 选择品牌、市场、语言，创建最多 10 件商品的一批任务。
2. 单独启动 \`docker compose --profile translations-ai up -d\`。专用 Poller 每 15 秒通过 Bearer Secret 调用一次 \`POST /api/plugins/ai-translations/worker\`。每次只处理一个排队项目，AI 调用绝不出现在普通顾客页面。
3. 刷新任务页，核查商品原文和 AI 翻译；必要时编辑译文，逐件批准或退回。需要重试的失败项目可以手动重新入队。
4. 单品牌且显式 \`TRANSLATION_PUBLISH_ENABLED=1\` 才会显示正式发布。发布前重新读取 Saleor 当前商品和目标语言译文；原文变化或已有人工译文都会阻止覆盖。
5. **多品牌时**自动发布强制关闭：Saleor 商品翻译是全局属性，Channel 隔离无法证明同一商品的不同品牌译文不会互相覆盖。如需跨品牌发布，请在品牌商品独立/共享关系梳理后，使用原先 PR #35 的审核导出与导入流程。

## 可靠性 / 安全边界

- 后台写操作要求同源 Origin + JSON；未知品牌、非法语言×Channel 组合都拒绝。
- 原文哈希、编辑版本 CAS、队列 CAS、防重复活动任务以及按状态转换，避免重复支出与审核覆盖。
- 存储表按任务的 site/channel/locale 关联；API 读取必须按当前 siteId 授权，Worker 仅凭服务器内部生成的作用域进行处理。
- Worker 认领超时后可有限次数恢复；**发布阶段**失败或网络超时标为 \`needs_reconciliation\`，不得直接重复提交，必须人工到 Saleor 对账。
- 只有单个商品在当前 Channel 的名称、描述、SEO 字段参与翻译。本期不处理分类/集合、富文本复杂块、CMS/Puck、政策、邮件、SKU 属性的后台可视化翻译；原 PR #35 的命令行导入仍可用于分类与集合。
- AI 服务需返回严格 JSON；禁止额外字段、HTML、空译文和改变占位符；对运输、关税、材质或法律承诺仍需人工审核。
- 目前 Basic Auth 为整个运营后台共享凭证：**没有逐管理员身份、审计签名与角色级审核授权**。上线多人员流程之前须增加独立运营登录与审核审计日志。不能把此 V1 误认为完整 Shopify Translate & Adapt/TMS 方案。
- AI 提供商会接收商品内容；必须先审核其隐私、数据存储与成本。
- 不在顾客链路增加 SQL/AI 请求；可选 worker 单条串行，独立于 checkout。

## 验收

CI 覆盖 TypeScript、单元测试和 Saleor 端到端回归。实际环境还需手工验证：
权限不足、存储断线、Token 错误、AI 超时、多品牌拒绝发布、多人并发修改、已存在译文、原文变更、真实店铺结账链路。

后台不提供虚假的“已翻译”绿色状态：UI 覆盖率**仅统计本地 JSON**，不代表 Saleor 商品/页面/邮件已经完整本地化。
