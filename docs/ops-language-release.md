# 运营后台语言与镜像验收记录

更新：2026-10-13，Asia/Tokyo。**后台语言、店铺 hydration 修复与本地镜像功能验收已完成；生产配置与真实外部服务验收待完成。**
全部原有未提交改动保留，没有提交、推送或切换现有 `:3000` / `:9000` 服务。

## 语言行为

- Ops 支持英文与简体中文。中文浏览器标签（含 `zh-Hans` / `zh-Hant`）使用当前简体中文文案；其他语言回退英文。
- Dashboard 的已选语言通过 `uiLocale` 优先传入；独立 Ops 页面读取 `Accept-Language` 的优先级。Ops 不依赖购物站的语言 allowlist。
- 请求边界覆盖客户端传入的内部 locale header，仅向组件转发 `en` / `zh`。显式语言保存在 HttpOnly、SameSite=Lax、`/ops` 范围的会话 Cookie，链接与 GET 表单保持语言。
- 服务器页面和客户端图表、弹窗、催付、CSV 校验、履约、客服、翻译及装修编辑器复用 next-intl。目录在 `storefront/messages/ops/{en,zh}.json`。
- 已知旧服务诊断按声明的模板翻译；SKU、channel、品牌名、顾客消息、商品内容、已保存装修文案及未知第三方报错不被自动翻译。
- Puck 编辑器的控件字典、模块/字段/选项标签与存储缺失提示均接入语言。界面语言与编辑中的内容语言分开，不改已保存页面。
- 自托管系统 App 的同源侧栏扩展标签复用 Dashboard 运营导航注册表；其他 Apps 保留自己的标签。
- 隔离 Dashboard 使用 `:9100`，现有 Saleor App 注册在 `:9000`，因此隔离实例里的这些跨源扩展保持安装时标签；Ops 正文及 Dashboard 自研运营入口已验证两种语言。同源扩展标签的识别/翻译由相关单元测试覆盖，正式 App 安装需按目标 origin 复验。
- Saleor 原生 `zh-Hans` 资源仍不完整，缺失消息仍显示默认英文。本次没有声称补齐所有原生或第三方 App 文案。

## 本地检查结果

| 检查                              | 结果与范围                                                                                                                                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storefront 完整 `pnpm run verify` | Node 24.21.0 容器中通过；214 个测试文件、1,272 个 Vitest 测试及 12 个品牌安全检查通过；类型、文档/依赖策略、设计 token 与 lint gate 通过，lint 有 21 个既存 warnings                               |
| Dashboard                         | TypeScript 与 strict 检查通过；6 个相关 Jest suite / 61 项测试通过；目标 ESLint 0 errors，15 warnings                                                                                              |
| 22 个 Ops 路由                    | 英文、中文浏览器各全部通过 HTTP 200、正文、html lang 和页面截图检查；包含首页/商品详情两种装修页                                                                                                   |
| 语言保持                          | 英文浏览器选择中文后导航仍为中文，再选英文后保持英文；使用真实 Ops 登录表单与 HttpOnly 会话                                                                                                        |
| Dashboard 嵌入                    | 新镜像 `:9100` 中 22 路由 × 两种语言通过；真实本地 Saleor 员工会话刷新和 SSO exchange，内层侧栏隐藏；两种语言均无页面 JavaScript 错误                                                              |
| 权限负例                          | 无凭证 401、品牌只读账号访问插件 403、自己的品牌 200、其他品牌 403                                                                                                                                 |
| Manifest / App                    | 新 Dashboard Nginx 的 Manifest 为 JSON，7 个扩展；3 个 `/commerce-admin` 路由 200，`nginx -t` 通过。现有 Saleor App 的安装 URL 仍绑定 `:9000`，新镜像的正式 App 安装/停用/恢复需在目标 origin 复验 |
| Compose / diff                    | 本地 Compose 配置与 `git diff --check` 通过                                                                                                                                                        |
| Dashboard Knip                    | 通过；`useLegacyThemeHandler` 和 `CommerceOpsEntry` 均只在声明文件内使用，收窄为本地声明，保留 hook、主题切换和导航类型                                                                            |
| Storefront 购物页                 | 新镜像中首页、商品列表、带查询的搜索、空购物车、收藏、登录、注册均 200 且无页面 JavaScript 错误；页脚导航与空 checkout 通过；3 项真实生产浏览器回归测试通过                                        |

Ops 测试使用隔离运行配置，将本地真实 `us` channel 映射为临时验收品牌；没有修改原有品牌配置、商品、订单或发布数据。
没有配置的分析、主题存储、邮件、客服与 AI 服务只验收真实的未配置/不可用提示，不能据此宣称这些服务已实际联调。

当前 `us` channel 没有公开商品，商品列表与搜索验证的是实际空状态。商品详情、带商品结账和已登录顾客账户不在本次真实浏览器数据覆盖范围内。

### 店铺 hydration 根因与修复

用户已授权继续修复既存 React #418。原有 `:3000` 和首轮新镜像在生产模式均复现，开发模式未复现。
捕获失败时的 React hydration fiber 后，定位到正式页脚：RSC 组件树包含 `<footer>`，生产 PPR 恢复响应却只发送其内部 `<div>`，流式替换后 DOM 中没有页脚外层。

`CopyrightText` 原先是客户端组件，在渲染时直接读取当前年份，没有声明 PPR 动态读取。现改为服务器组件，在 `await io()` 后读取年份，再复用 `getCopyrightText(year)`；年份由服务器生成一次，沿现有 Suspense 边界流式传送。
没有关闭 Cache Components/PPR，没有添加 `suppressHydrationWarning` 或屏蔽错误。

新增 `storefront/e2e/storefront-hydration-live.spec.ts`：阻止外部 Next JS bundle 启动 hydration，但允许内联流式替换，断言完整页脚仍存在。
同一检查在原有镜像失败（footer 数量为 0），修复镜像通过（数量为 1）；正常 hydration、购物页导航与空 checkout 也通过。

```sh
PLAYWRIGHT_BASE_URL=http://localhost:3103 PLAYWRIGHT_CHANNEL=chrome \
STOREFRONT_E2E_BROWSE_PATH=/en/us \
pnpm --dir storefront exec playwright test e2e/storefront-hydration-live.spec.ts --workers=1
```

购物页截图与日志保存在忽略目录 `.local/ops-browser-evidence/storefront-hydration/` 和 `.local/hydration-regression-final-evidence.log`。

## 可重建镜像

本机 Docker context 为 `colima-sloer-saleor`，平台 `linux/amd64`。镜像来自仓库 Dockerfile、固定依赖锁文件、Node 24 基础镜像；没有向运行容器复制构建产物冒充构建。

| 镜像                                                | 本次镜像 ID                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------- |
| `sloar-saas-storefront:ops-i18n-hydration-20261013` | `sha256:b77b6d6b3b4844b7ba1fd43c14b4b82ad2213a3661b102363108e9147cb10332` |
| `sloar-saas-dashboard:ops-i18n-hydration-20261013`  | `sha256:27321baeedaeb05e14b7ca28b62521f5a59f6aad097fc5fa53ee1b63f8e20ddb` |

Storefront 的浏览器构建值 `NEXT_PUBLIC_ALLOW_DUMMY_PAYMENT=false`；隔离验收进程也关闭 Dummy Payment。
基础镜像摘要已固定。Docker Hub 超时时，本次使用 Public ECR 的官方镜像副本，保持相同摘要：

```sh
NODE_IMAGE=public.ecr.aws/docker/library/node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 \
NGINX_IMAGE=public.ecr.aws/docker/library/nginx:stable-alpine@sha256:0985e772fb9f729e6fa0980da05fca5d9c468e870eed43071545afa9d2e27d94 \
NEXT_PUBLIC_ALLOW_DUMMY_PAYMENT=false \
docker --context colima-sloer-saleor compose build storefront dashboard
```

在其他机器选择其实际 Docker context。构建要求 Saleor API 可由 build network 访问，使用仓库现有 GraphQL 生成流程；生产需要对应版本 Core/API。
必须保持 build/runtime 的公开 URL、locale/channel allowlist 与 `STOREFRONT_SITES_JSON` 一致。固定镜像摘要与 lockfile 不保证两次构建的 OCI 字节完全相同。

当前源代码含未提交工作。最终私有记录在 `.local/ops-release-hydration-20261013/`：源码快照、SHA256、镜像归档、镜像元数据和非秘密构建参数；快照排除 `.env`、私钥、运行数据、依赖目录和浏览器凭证。
首轮 `.local/ops-release-20261013/` 快照和 `:ops-i18n-20261013` 镜像标签仍保留，不能将其当作 hydration 修复后的最终版本。
重建需另行提供合法运行凭证及匹配的 Saleor API，快照不是数据库或生产恢复备份。

## 生产待配置与验收项

1. 确认生产 Storefront、Dashboard、Saleor API、App origin、镜像仓库和目标架构。当前公开地址为 localhost，镜像为 linux/amd64；目标确认后重建浏览器公开配置。
2. 配置 `NEXT_PUBLIC_STOREFRONT_URL`、`NEXT_PUBLIC_CHECKOUT_URL`、`NEXT_PUBLIC_SALEOR_API_URL`、`DASHBOARD_API_URL`、`COMMERCE_OPS_URL`、`SALEOR_DASHBOARD_URL` 与 `SALEOR_OPS_APP_PUBLIC_URL`；build/runtime 的 locale/channel allowlist 和 `STOREFRONT_SITES_JSON` 必须一致。
3. 当前 `.env` 的生产 Compose 检查首先被缺少 `SALEOR_ALLOWED_CLIENT_HOSTS` 阻断；`SALEOR_PUBLIC_URL` 也未设置。原始 Compose 还需 `SALEOR_RSA_PRIVATE_KEY`；`scripts/deploy.sh` 可从私有 RSA 文件注入。为生产单独配置 API/会话/worker/webhook 凭证，禁止使用本次临时验收账号或把密钥放入源码归档。
4. 配置 DNS/HTTPS、API CORS/客户端允许域名、私有后端网络、持久化卷和备份恢复；Storefront 容器重建后重启或 reload Dashboard Nginx，使其重新解析 `storefront` upstream。按目标 origin 重验 App Manifest、安装、停用/恢复、SSO、logout、员工权限撤销和受限 channel。
5. 配置真实支付、退款/对账、邮件、Chatwoot/AI、分析/主题数据库、翻译 worker 与商户政策页面；使用真实商品、已登录顾客和带商品结账完成业务验收。外部服务属于**代码完成但未实际联调**的范围。

隔离预览为 `http://localhost:9100`（Dashboard）与 `:3102`（Ops）；它们不是生产发布。购物页隔离验收使用 `:3103`，验收后清理临时容器。原有 `:3000` / `:9000` 未切换，仍运行之前的版本。
本次未向镜像仓库推送，也未操作生产环境。

后续提交/PR 建议分别审查后台语言与 App 接入、镜像构建配置、既存页脚 hydration 修复。当前按用户要求保留所有未提交工作，未创建 PR 或合并。

## 新窗口继续

打开 `/Users/algive/sloar-saas`，发送：

> 阅读 docs/ops-language-release.md、docs/plugin-placement.md、docs/admin-navigation.md 和 docs/system-plugins.md，保留所有未提交改动及 .local/ops-release-20261013、.local/ops-release-hydration-20261013 的快照。后台 22 页中英文、Dashboard 嵌入、店铺 hydration 修复、Node 24 检查、Knip 和本地最终镜像验收已完成。继续按记录核对生产域名、架构、公开构建值、密钥、真实商品与外部服务配置，准备生产验收；不要把本地空状态或单元 Mock 当作生产联调，也不要擅自切换现有服务或部署生产。
