# 系统模块接入 Saleor 官方 App

更新日期：2026-10-13（Asia/Tokyo）。官方 Saleor App 已安装并在本地 Saleor
启用；`http://localhost:9000` 的 Manifest、七个扩展入口、App 配置页、员工会话桥接
及运营侧栏路由已通过浏览器验收。生产实例尚未部署或联调。继续工作时必须保留所有
现有未提交改动。

## 当前实现与官方扩展的区别

- `storefront/src/plugins/system/registry.ts` 是七个业务模块的静态目录，
  明确不是 Saleor App Manifest；购物请求不做动态插件扫描或插件目录数据库查询。
- Dashboard 的 `CommerceOpsPage` 保留为兼容入口，仍可通过同源 iframe 打开现有 `/ops` 页面。
- `GET /api/manifest` 通过 `@saleor/app-sdk` 暴露官方 Manifest。Manifest 声明系统运营 App、
  应用权限、`configurationUrl`，并在 Saleor 的订单、客户、页面、翻译、商品菜单提供七个
  `APP_PAGE` 功能入口。每个入口映射到已有真实 `/ops` 功能页，不创建静态假页面。
- `/commerce-admin/app?path=...` 是官方扩展入口；App Bridge 从 Saleor Dashboard 取得当前员工
  token，再通过同源 `postMessage` 交给内层 Ops iframe。Storefront 调 Saleor GraphQL 验证员工、
  权限和 channel 范围后签发短时 HttpOnly 会话 Cookie。token 不放入 URL 或浏览器存储。
- `/commerce-admin/configuration` 是官方 Apps 中的配置入口，默认显示 `/ops/plugins`，集中查看
  系统插件状态和可用功能链接。`/ops/plugins` 保持只读；不会把部署环境变量伪装成在线编辑控件。
- 官方 App 页面仍以 iframe 运行现有 `/ops` 功能。安装官方 App 统一了 Saleor 的入口、安装权限
  和 App Bridge 会话，并未把运营业务重写为 Core 插件，也不会自动消除 iframe 或业务服务成本。
- `backend/saleor/plugins` 是 Python Core 插件机制；`settings.py` 注册内置插件
  并通过 `saleor.plugins` entry points 发现外部插件。现有 TypeScript 模块不能
  通过移动到这个目录直接注册、运行。官方将 Core Plugins 定义为旧扩展机制，
  建议新集成使用 Apps。

## 性能判断

移动目录或菜单不改变实际运行的脚本、SQL、网络请求和部署进程，不能据此承诺性能提升。
官方接入的主要收益是复用安装、授权、导航和消息协议，并减少自维护 Dashboard 接入代码。

当前 `CommerceOpsPage` 的 `key={source}` 随运营路径或语言改变而重建 iframe。
新页面先加载 `/commerce-admin/sso`，查询会话状态再跳转目标页面；目标页的
`SaleorOpsSessionSync` 挂载时还会请求令牌并交换会话。这里存在重复加载与认证往返，
应测量后台首次打开及切换页面的请求数量和耗时。它是待优化路径，不是已经确认的性能瓶颈。
优化不得跳过权限撤销、channel 范围校验或令牌过期处理。

店铺端需要分别测量 JS 体积、页面延迟、SQL 和外部调用。
装修渲染器已有动态导入：有发布数据时才加载；配置了存储时读取发布数据仍可能访问数据库。
广告像素、客服组件、统计采集等前台运行逻辑即使其管理页面接入官方 App，也仍需在店铺执行。

## 当前边界与下一步

1. Saleor Core 在安装时从自己的服务器端请求 Manifest URL，因此该 URL 必须能由 Core/API 网络访问。
   本地 Compose 在 Saleor Apps 中使用 `http://dashboard/api/manifest`；生产使用 API/Core 可访问的
   HTTPS URL。Storefront 使用 `SALEOR_OPS_APP_PUBLIC_URL`（回退到 `SALEOR_DASHBOARD_URL`）生成
   浏览器访问的公开 App 路径；本地公开 origin 是 `http://localhost:9000`。Dashboard Nginx 将
   `/api/manifest`、`/commerce-admin` 和 `/ops` 代理给 Storefront。
2. 安装后由 Saleor 读取 Manifest 的权限和七个扩展入口。没有配置 `tokenTargetUrl`：此 App 只在
   已登录的 Dashboard iframe 内使用短时员工 token，不需要独立长期 App token、webhook 或后台轮询。
3. 保留现有 `/ops` 页面、API、Service、存储、品牌/channel 授权和按需加载；官方 App 只提供
   Saleor 原生扩展入口、会话桥接和配置页。
4. App 卸载/停用和业务模块系统暂停是两层状态。`SYSTEM_PLUGINS_DISABLED` 仍是部署级全局配置，
   修改后需在所有 Storefront 实例统一更新并重启；App 的隐藏/卸载不会自动停止后台业务逻辑。
   当前配置页只读展示实际运行配置，未实现在线改写部署环境变量。
5. 本地 Saleor 已验证 App 安装状态、七个 Manifest 扩展入口、配置页和真实员工 SSO；
   生产部署仍要验证权限撤销、logout、受限 channel、App 停用和恢复。再用同一环境
   测量切换与首次打开耗时，不承诺未经测量的提速比例。

## 本地浏览器验收（2026-10-13）

- Saleor GraphQL 返回 `sloer.commerce-operations` 为 active，Manifest 有 7 个
  `APP_PAGE` 扩展，`configurationUrl` 为 `/commerce-admin/configuration`。
- 使用本地 Saleor 员工登录进入 Dashboard 后，App Bridge 真实 handshake 完成；
  `/api/admin-sso/exchange` 验证 staff、Saleor 权限和 channel scope，并设置
  `HttpOnly`、5 分钟会话 Cookie。没有再次登录或跳出 9000 页面。
- Chrome `zh-CN` 下，7 个官方 App 扩展、官方 Apps 配置页、11 个当前权限下可见的
  Dashboard 运营侧栏入口均通过真实浏览器点击或入口导航打开；配置页能进入
  `/ops/plugins`。浏览器记录无页面 JavaScript 错误。
- 22 个运营路由中，19 个在当前单品牌运行配置下返回有效中文页面。品牌概况、洞察、
  上线准备依赖 `STOREFRONT_SITES_JSON`；当前实例未配置多品牌映射，因此在 9000
  中这些详情路由按设计不可用。另以临时内存品牌映射启动隔离检查进程后，这 3 个页面
  均返回 200 并显示中文；没有改动本地部署的品牌配置或业务数据。
- 本地 Storefront 干净 Next.js production build、Dashboard Vite build、Storefront
  TypeScript、Dashboard TypeScript、相关 Storefront 41 项测试、Dashboard 18 项导航与
  locale 测试、目标 Storefront ESLint、Dashboard 目标 ESLint、`docker compose config
--quiet` 和 `git diff --check` 均通过。Dashboard 目标 ESLint 为 0 errors、42 warnings。
  本机 Node 22 与两个项目声明的 Node 24 要求不一致，构建/类型检查输出了 engine warning，
  但命令成功退出；生产 CI 应使用 Node 24。
- Docker Hub 在本次构建时发生匿名认证超时；为继续验证，已将本地新构建的静态产物复制到
  当前运行容器并重载。容器重建/生产发布仍需可用的构建镜像与发布流程。

## 语言与上线边界

- 自研 `/ops` 页已按浏览器或 Dashboard 所选语言切换英文/简体中文；22 个路由在两种语言下均完成独立页面与最终 Dashboard 镜像嵌入验收。店铺 hydration 已修复并通过生产构建回归，Knip 已通过；生产配置与真实外部服务验收仍待完成，见 [运营语言与镜像验收](ops-language-release.md)。
- Saleor `zh-Hans` 资源有 2,333 个消息 ID，而默认资源有 4,667 个；未翻译的原生
  Dashboard 消息仍回退英文。不能声称所有原生 Dashboard 与自研页面都已完成多语言覆盖。
- 本地容器已通过真实 Saleor 登录验收；尚未部署生产，也未对真实外部客服、广告、分析存储
  或翻译服务进行联调。App 暂停/卸载不等同于 `SYSTEM_PLUGINS_DISABLED`。

## 前次核对来源与验证范围（历史记录，以新镜像验收记录为准）

- [Saleor Extensions](https://docs.saleor.io/developer/app-store/overview)：
  Apps 与旧 Core Plugins 的区别、自托管手动安装。
- [Extending Dashboard](https://docs.saleor.io/recipes/extending-dashboard)：
  Manifest、iframe、App Bridge 与权限边界。
- [Installing and Managing Apps](https://docs.saleor.io/developer/extending/apps/installing-apps)：
  安装方式及可选 `tokenTargetUrl` 注册流程。
- 对照当前静态注册表、Core 插件注册、官方 Manifest schema / App SDK、Dashboard
  `AppIFrame` 与本地 App Bridge、SSO 和权限调用链。运行本地测试与页面 HTTP 冒烟；
  没有实际登录运行中的 Saleor，也没有把源码/本地 HTTP 冒烟当作部署安装或生产联调验收。
- 运行检查：Manifest / SSO / locale / authorization 相关 Storefront 测试 46 项通过，
  Dashboard 导航测试 40 项通过，Dashboard TypeScript、Storefront TypeScript、目标 Storefront
  ESLint、Dashboard Vite build 和 Storefront optimized Next.js build 通过；
  `docker compose config --quiet` 通过（仅提示缺少可选 `SUPPORT_AI_WORKER_SECRET`）。
- Storefront production build (`next start :3101`) 上的 22 个 Ops 页面、3 个 `/commerce-admin` App 页面与
  `/api/manifest` 均通过 HTTP 检查；Manifest 返回 JSON、7 个扩展。当前 `:9000` 上 22 个
  Ops 页面也返回 200，但该运行中 Dashboard 的 `/api/manifest` 和 `/commerce-admin` 实际回退
  到 Dashboard 登录 HTML。活动 Nginx 仍是旧配置；Docker CLI 无法连接本机 Docker socket，
  因而无法重建/重启容器来应用仓库 Nginx 配置。9000 运行时代理、App 安装及真实 Saleor SSO
  必须在 Docker 恢复后再验收。

## 新窗口继续

打开本仓库，阅读 [ops-language-release.md](ops-language-release.md) 的续任务提示；保留所有未提交改动，先处理记录中的发布阻断项与用户待确认的修复范围。
