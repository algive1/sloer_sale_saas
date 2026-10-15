# 客服页面重复后台导航的诊断与修复

日期：2026-10-14（Asia/Tokyo）。

## 问题与根因

用户确认额外侧栏显示“数据分析”等后台总菜单，属于 Commerce Ops 外壳，不是客服会话列表。

Dashboard 的 `/commerce-ops` 与官方 App 桥接页都以 iframe 打开 Ops 页面，初始网址携带 `embedded=1`。`OpsShell` 原先仅根据当前网址参数判断是否隐藏内层侧栏和工具栏。

客服工作台中的“Chatwoot 设置”及设置页的返回链接使用 Next `Link`，目标路径没有 `embedded=1`。客户端导航后参数消失，但页面仍处于原来的 iframe 中。外壳误判为独立页面，于是重新显示数据分析、在线商店等内层菜单。

middleware 已为完整 iframe 文档请求补充嵌入参数，但其条件是 `sec-fetch-dest: iframe`。Next 客户端导航使用获取 RSC 的请求，无法依靠该文档请求条件恢复参数。单独隐藏客服列表或逐个修改链接不能解决共享外壳的错误判断。

相关代码：

- `dashboard/src/components/CommerceOpsPage/CommerceOpsPage.tsx`：直接导航 iframe 入口。
- `storefront/src/app/(root)/commerce-admin/commerce-ops-app-bridge.tsx`：官方 App iframe 入口。
- `storefront/src/app/ops/_components/ops-shell.tsx`：内层外壳与显示判断。
- `storefront/src/app/ops/support/_components/chat-workbench.tsx` 与 `support/settings/page.tsx`：触发客户端往返跳转的现有链接。

## 最小修复

在外壳现有的挂载后浏览器读取中记录 `window.parent !== window`。嵌入显示条件改为“当前参数表示嵌入，或实际运行在 iframe 中”。参数在客户端跳转中丢失时，外壳仍保持嵌入显示。

独立打开 Ops 页面时保留自身导航。客服的品牌筛选、会话列表、聊天区与客户信息仍属于工作台功能。权限、会话、channel 校验、SSO、客服接口与后台配色均未改变；iframe 判断只影响显示，不能授予访问权限。

## 验证范围

使用 Node 24.19.0 与当前 Next.js 16.3.8，启动隔离开发进程 `localhost:3105`，使用独立测试运营账号及真实 Ops 登录。Chatwoot 未配置，页面展示真实的未配置状态，没有伪造会话或第三方 API 成功结果。

新增回归位于 `storefront/e2e/ops-language-live.spec.ts`。仅父 iframe 容器由测试提供；登录、Ops 外壳、客服页面、设置页面、客户端路由与样式均来自运行中的项目。

- 修复前：初次嵌入时菜单隐藏；点击设置后参数消失，隐藏断言收到 `visible`，复现失败。
- 修复后：同一测试通过；独立打开的侧栏可见，嵌入后的侧栏隐藏，设置与返回工作台均保持隐藏。
- 截图留在忽略目录 `.local/ops-embedded-navigation-20261014/before.png` 与 `after.png`。
- 完整 `verify` 使用仓库当前 Core 的真实 schema 文件 `backend/saleor/graphql/schema.graphql` 运行生成与检查；这是静态类型与测试验证，不是实际 Saleor 服务联调。

完整 `verify` 已通过：文档与依赖规则、设计令牌、GraphQL 规则、应用和运营 E2E 类型检查、Lint、214 个测试文件中的 1,272 项单元测试，以及 12 项品牌安全检查。Lint 为 0 errors / 27 warnings，修改文件的目标 Lint 无错误。日志保存在 `.local/ops-embedded-navigation-20261014/verify.log`。针对本问题的浏览器回归为 1 项通过；修复前同一断言失败，修复后通过。未修改 GraphQL 源文件，生成检查未产生额外源码差异。

运行回归：

```sh
PLAYWRIGHT_BASE_URL=http://localhost:3105 \
PLAYWRIGHT_CHANNEL=chrome \
OPS_E2E_USERNAME=<隔离运营账号> \
OPS_E2E_PASSWORD=<隔离账号密码> \
pnpm --dir storefront exec playwright test e2e/ops-language-live.spec.ts \
  --grep 'keeps the inner navigation' --workers=1
```

当前本机 `:9000` 不可连接，Docker daemon 未运行。未切换原有服务、未重建部署镜像，也未执行真实 Saleor 员工 SSO 或 Chatwoot 联调。源码修复必须进入实际部署的 Storefront 构建后，运行版本才会生效；不能把隔离开发页检查当作用户环境已经更新。

隔离开发进程已停止。测试服务日志还报告客服页已有的 `blocking-prerender-dynamic` 诊断：`SupportPage` 调用 `currentOpsViewer()` 的 `connection()` 缺少该页面自身的 Suspense 边界。该诊断在导航修复前的基线请求中也存在，页面请求与本次导航回归通过并不代表此问题已解决。本次没有改动客服页的数据边界；部署验收前应单独处理并执行生产构建验证。

## 新开窗口继续

在 Codex 新窗口打开 `/Users/algive/sloar-saas`，发送：

> 阅读 docs/ops-embedded-navigation.md，保留所有未提交改动及 docs/design 中的设计稿。重复内层导航已在隔离 Next 进程中复现并修复，重点是 OpsShell 根据实际 iframe 环境保持嵌入显示；完整 verify 与本问题浏览器回归已通过。按记录继续处理客服页已有的 blocking-prerender-dynamic 诊断并完成生产构建验证。确认运行环境后，沿现有构建部署流程更新 Storefront，并通过真实 Dashboard 客服入口、设置返回、员工 SSO 和独立 Ops 页面验收。不要删除客服会话列表，不要放宽权限，也不要把开发测试说成真实 Chatwoot 联调。
