# 统一运营配置中心

日期：2026-10-14（Asia/Tokyo）。

## 用户确认的范围

采用“统一配置中心，直达已有表单；部署项提供具体配置指引”，保留现有存储与运行时配置架构。客服、广告、Merchant 的环境变量配置没有改为在线保存；不提供保存后实际不生效的表单。

## 根因与入口

两个后台导航来自 Dashboard 外层侧栏与 iframe 中 Ops 自身的侧栏。现有工作区修复让 `OpsShell` 同时检查 `embedded=1` 和实际 iframe 环境；内部跳转丢失参数后仍隐藏内层导航，独立打开 Ops 保留自身导航。本轮保留该修复并扩展浏览器回归到配置中心往返。

原先配置分散：催付和装修有真实保存接口，而客服设置、广告和 Merchant 页面只读取部署配置。官方 App 的配置页还指向插件状态目录，因此不能承担完整接入指引。

现在的入口：

- Dashboard：**设置 → 运营配置中心**，通过原有 `/commerce-ops` 页面嵌入 `/ops/settings`。
- Ops 独立使用：应用菜单中的**配置中心**，或者直接 `/ops/settings`。
- 各 Ops 功能页右上角：**配置与接入**，直接定位对应功能说明；品牌列表和插件目录提供**配置中心**入口。
- 官方 App：原有 `/commerce-admin/configuration` 地址打开新的配置中心，不改变 App 安装或授权协议。

配置中心沿用现有身份、权限与品牌边界。Saleor 员工只看到其有权访问的功能；品牌只读分析员和受限渠道员工不能访问全局配置中心。页面只展示静态配置项名称和接入说明，不读取、回显密钥，也没有新增数据库表。

## 功能与配置位置

| 功能 | 已有页面 | 后台可操作 | 部署配置说明 |
| --- | --- | --- | --- |
| 主题装修与 AI 模型 | `/ops/themes` | 品牌/渠道/语言、草稿、发布、AI 图片面板的模型配置 | 主题数据库、加密密钥、允许的 AI Endpoint；见 `docs/theme-editor-ai.md` |
| 经营分析 | `/ops/analytics` | 已有日期/市场筛选；品牌视图从品牌站点进入 | 分析数据库、同意策略、可信代理 IP 头；全局分析仍是平台汇总 |
| 智能催付 | `/ops/analytics/reminders` | 当前品牌规则、时间间隔、额度与发送记录 | 品牌发件身份、Resend、Cron、Saleor 服务令牌；见 `docs/analytics-payment-reminders.md` |
| 客服与 WhatsApp / AI | `/ops/support/settings` | 读取配置状态；工作台处理真实会话 | 品牌独立 Account / Website Inbox、Website Token、Agent API Token、WhatsApp 号码与 AI Worker；见两份客服文档 |
| 广告追踪 | `/ops/analytics/destinations` | 按品牌查看服务器接收账户与投递记录 | 品牌服务器账户、数据库、同意策略与浏览器公开 ID；多品牌部署继续关闭全局浏览器像素 |
| AI 多语言 | `/ops/translations` | 创建任务、审阅、导出与符合既有发布条件的操作 | 数据库、专用 Saleor Token、AI 与 Worker；见 `docs/translation-management-center.md` |
| SEO / Merchant | `/ops/merchant` | 查看 Feed 开关、扫描限制、排除前缀 | Feed 环境变量；基础 SEO 不受 Feed 暂停影响；见 `docs/seo-google-merchant.md` |

配置中心明确展示每项功能的环境变量与部署步骤：本地编辑 `storefront/.env.local`，Docker 编辑根目录 `.env` 并核对 Compose `environment` / `build.args`。运行时配置需重新创建对应服务，Worker 配置同步；`NEXT_PUBLIC_` 变量需重新构建镜像。所有实例应使用一致配置。

`storefront/.env.example` 已补充原先缺失的 `SUPPORT_CHATWOOT_AGENT_TOKENS_JSON`。该变量必须是每品牌独立的服务器 Agent 凭据，不能复用公开 Website Token。

## 实现与验证

- 配置说明和现有页面映射：`storefront/src/lib/ops/configuration.ts`；覆盖既有七个插件，测试校验变量和文档确实存在。
- 页面：`storefront/src/app/ops/settings/page.tsx`；自己的 Suspense / 权限边界，避免请求身份阻塞静态预渲染。
- 共享配置入口：`storefront/src/app/ops/_components/ops-shell.tsx`；使用普通页面导航，保留装修编辑器未保存草稿的保护。
- Dashboard 注册表、Ops 菜单、两个 App / Dashboard 路径白名单已同步加入实际路由。
- 中英文说明使用既有 Ops 字典，测试验证所有标题、操作和接入说明在英文页面不残留中文。

最终检查结果和浏览器截图将在验收完成后记录。隔离服务的凭据与日志位于忽略目录 `.local/ops-configuration-20261014/`，不进入源码。

## 交付与真实环境限制

这是源码和本地验证任务，没有部署到用户截图里的环境。实际环境必须构建并部署本轮 Dashboard / Storefront 源码，才能看到新的入口和保留的嵌入导航修复。Chatwoot、邮件、广告、AI 模型与支付真实服务均没有在本轮联调，配置说明也不表示任何服务已成功接入。

现有侧栏外观、品牌安全、Checkout 与翻译 Worker 等未提交改动保留。若后续创建 PR，配置中心应作为独立功能评审；不要将工作区其他任务一起提交。

## 新开窗口继续

在 Codex 新窗口打开 `/Users/algive/sloar-saas`，发送：

> 阅读 docs/ops-configuration-center.md、docs/ops-embedded-navigation.md 与子项目 AGENTS.md，保留所有未提交改动。用户已选择“统一配置中心，直达已有表单；部署项提供具体配置指引”，不要改成新凭据存储体系。配置中心位于 /ops/settings，Dashboard 设置菜单和官方 App 配置页均已接入。先核对本文件最终验证记录和实际运行版本；如获部署授权，再按现有流程构建部署 Dashboard / Storefront 并验证 iframe 设置往返和员工权限。真实 Chatwoot、邮件、广告、AI 与支付未实际联调时明确说明，不把配置格式校验当作成功接入。
