# Product audit remediation — 2026-10-10

Baseline: `edce62dfabaaaa4e3c9b3b7595aeba94f365b28b` (PR #36).
Audit IDs refer to the product review delivered on 2026-10-10.

## Batch 1: brand facts and outbound reminder safety

| Item | Code change | Remaining acceptance |
| --- | --- | --- |
| A05 | Read the real `brand` attribute; omit unknown manufacturer in PDP JSON-LD and feed | Inspect rendered PDP/feed against live Saleor |
| A06 | Scope Offer/AggregateOffer domain and seller by Channel's configured brand; unknown scope emits no JSON-LD | Two-domain rendered-page acceptance and production cache refresh |
| A04 | Block all global reminder sending in multi-brand mode and explain the restriction to operators | Brand-scoped sender/rules/language/order queries/logs remain to implement |

The changes add no database reads to shopping pages, retain existing checkout
behavior, and do not modify Saleor Core. A04's guard is deliberate containment;
it must not be marked as a completed multi-brand communication workflow.

### Dependency repair and verification

The original frozen installation rejected 11 old lockfile entries with
`ERR_PNPM_TRUST_DOWNGRADE`. This blocker is resolved:

- Checkout now uses the official `typed-document-node` generator already used
  transitively by the storefront. No application imported the removed generated
  URQL hooks; server actions and document exports remain the checkout interface.
- Re-resolved the lockfile under the unchanged `no-downgrade`, minimum-release-age
  and exotic-subdependency policies. The old Relay/fbjs/ua-parser-js chain is gone.
  Existing security overrides are now represented in the lockfile too.
- Pinned React, React DOM and their Node/React types to their prior locked versions
  to prevent unrelated framework upgrades during resolution.
- Corrected Husky installation and hook working directory for this repository's
  `storefront/` subdirectory. Native fallback install scripts remain denied:
  pnpm 10 uses `ignoredBuiltDependencies`, pnpm 11 uses `allowBuilds: false`.
- `pnpm install --frozen-lockfile` now succeeds. Both GraphQL generators and
  TypeScript checking pass against the vendored Saleor schema. Vitest passes
  150 files / 914 tests; native brand safety checks cover 12 cases.
- The first full lint run surfaced 14 errors in existing UI code. Repairs use
  Embla external-store subscriptions, render-time input resets, observable
  shipping-load state, cancelled translation list requests and a narrower
  Chatwoot configuration error boundary. No lint rule was disabled.

The native regression suite is included in `pnpm run verify` and source CI as
`test:brand-safety`. Full `pnpm run verify` passes after the UI fixes (ESLint: 0 errors, 27 existing warnings).
Live backend build, two-domain rendering and browser checkout remain CI gates;
the local environment has no Docker executable. Existing peer-range warnings
remain for auth-sdk/Next and lucide-react/React; these were not upgraded here.

References: [TypedDocumentNode](https://the-guild.dev/graphql/codegen/plugins/typescript/typed-document-node)
and [Husky subdirectory setup](https://typicode.github.io/husky/how-to.html#project-not-in-git-root-directory).

## Batch 4: A01/A02/A15 — shared customer identity containment (PR #40)

In a multi-brand deployment, Saleor Core `User` identities and address books
are global even if storefront order queries filter by Channel. A brand picker or
per-Channel query cannot authorize viewing/changing another brand's customer
profile, default address or password.

This batch blocks global profile/account/login/register/reset operations at
request and server-action boundaries whenever `STOREFRONT_SITES_JSON` is
present. Checkout renders guest-only controls, does not hydrate `me.addresses`
or autoattach a customer and forces `saveAddress=false` for guest checkout.
Server-side checkout ID and order Host validation continue unchanged. For
single-brand deployments, original signed-in behavior remains available.

**This is risk containment, not completion of A01/A02 or SaaS isolation.**
Long-term per-brand member accounts, customer address ownership, Saleor Core
GraphQL permissions, plugin credentials and third-party data boundaries are
still required before commercial multi-tenant use. Guest checkout requires
live full-flow CI. Production payment credentials were not tested here.

## Batch 5: public catalog listing API Host boundary (PR #42)

The shared `/api/listing` JSON route previously validated its requested
Channel against the **union of all Saleor storefront Channels**. A browser on
one brand host could request a different brand's Channel directly, bypassing
page-route and Merchant-feed host validation.

The API now verifies the requested Channel belongs to the configured brand
for the trusted HTTP `Host`, **before channel discovery and catalog/cache
reads**. Foreign Channels and unknown hosts return 404 with `private,
no-store`, including requests that spoof `x-forwarded-host`. Existing
single-brand behavior and the own-brand filtered/sorted/paginated listing
contract are unchanged. Added route unit tests and real two-domain
Playwright regression coverage.

**Remaining:** This protects the Paper BFF endpoint, **not** the public
Saleor GraphQL catalog or checkout API. Direct GraphQL tenant isolation and
customer/shopper identities are still launch blockers.

## Next batches

1. Complete live backend build and browser acceptance for the first batch.
2. A01/A02/A15: unify operator identity, action permissions and server-authorized
   brand scope; retain the distinction between own-brand operation and independent
   SaaS tenants. Do not substitute a brand picker for authorization.
3. A03/A07/A08: actual merchant acquiring eligibility, transaction acceptance,
   launch readiness and tested deployment recovery. External merchant credentials
   and production infrastructure must be verified separately.
4. A04/A14/A17: per-brand reminders, ad destinations, and Chatwoot/WhatsApp context.
5. A09–A13/A19–A21: unified operations, safe brand CRUD, catalog publishing,
   multi-page decoration, localization coverage, fulfillment and content quality.
6. A16/A18/A22–A24: reporting definitions, live AI acceptance, privacy/security,
   plugin contracts and measured reliability/performance. A25 external merchant
   commercialization stays deferred until tenant isolation passes.

No audit item is considered production-verified merely because this file or a PR
exists. Each follow-up should record its actual verification and remaining limits.

## A04：按品牌恢复付款提醒（2026-10-11）

- 新增显式品牌发件人/邮件语言配置，链接从可信品牌域名生成，不回退全局身份。
- 独立规则、滚动24小时额度、最近发送记录与后台切换；仅平台管理员可操作。
- Saleor 列表查询按 channel，单笔发送前核对实时 channel/支付/规则；并发 claim 约束额度及防重复。
- 新品牌默认关闭；旧全局规则仅保留单品牌兼容范围，旧日志阻止同一订单重复发送。
- 测试覆盖 SQLite、GraphQL schema 和运营 UI/API；邮件提供商为模拟响应，真实投递及 Cron 运维仍需部署验收。

## A07 / A08：上线证据与发布恢复闸门（2026-10-11）

- A07：按品牌/域名/市场列出必要检查；独立管理员记录正式或测试环境、责任人、时间、证据、有效期和版本。记录追加而非覆盖；CAS 防并发覆盖。相关配置、市场启停、首页发布变化使旧记录失效；不可读取的服务或未通过必要项阻断本页上线判定。测试/沙盒记录不能算正式上线验收。
- A08：全部应用先在隔离数据库副本上完成迁移预演和构建；再停止写入、备份数据库/媒体/配置并实际恢复验证，之后才迁移生产。保留镜像 ID、旧镜像和私有 manifest；失败后不自动恢复生产数据库。外部状态要求有效备份/恢复凭据。
- 边界：上线页不自动切换 DNS/公开流量；远程支付/配送/政策变化需递增配置版本。外部恢复凭据中 Chatwoot/对象存储部分为运营确认，不是工具代为验证。正式收单、邮件、客服、异地恢复及实际生产基础设施仍须实测，不能凭源码标记完成。
- 说明：[品牌验收](brand-launch-readiness.md)、[发布恢复](release-recovery.md)。全量源码检查、数据库恢复 CI 和真实页面/API 回归结果将在 PR 中记录。

## A14 / A15：品牌广告与实时、原生订单范围（2026-10-11）

- 显式品牌服务端 GA4/Meta/TikTok 账户，Host/Channel 与已验签订单范围校验；不回退全局账户。广告要求显式同意，GA4 的广告用途同意保持拒绝。
- SQLite 原子 claim 按品牌/接收端防重复，失败与不确定回执持久记录；管理员后台按品牌查看状态，不返回密钥或客户标识。
- 实时8类SQL查询在聚合前按品牌过滤；品牌分析员页面、API、10秒自动刷新均沿用同一授权范围；全品牌入口仅管理员可读。
- 品牌概况新增原生 Saleor 最近订单，逐市场查询并核对返回归属，完整合并排序；未支付事件不冒充到账收入。
- 边界：真实广告账户及会话关联尚未验收；多品牌浏览器全局像素仍关闭，品牌浏览器/Google Ads 全漏斗尚需补齐。原生后台的员工权限和外部商户隔离不由本页替代。说明：[广告与实时数据](brand-ad-destinations.md)。

## A11 / A21：商品发布清单与内容检查（2026-10-11）

- 品牌商品检查读取原生数据；列出主图、真实品牌、SKU、重量、价格、库存策略及市场发布问题，提供原生编辑入口。仅投影本品牌市场；分页25商品/最多50规格，超过上限明示未完整检查。
- 市场矩阵展示价格/发布/购买状态；未来时间、停用市场、未知库存不冒充当前可售。缺配送/翻译/政策需继续在品牌上线页验收。
- 实物商品CSV资料模板、品牌市场/重复行/字段格式校验及错误下载；下载文本防止公式执行。此批不写商品、不下载图片，不宣称已完成批量导入或全库冲突校验。
- 商品内容质量检查属于A21第一步，尚不替代死链/重定向中心、ProductGroup/配送/退货事实建模及真实Merchant诊断。说明：[商品检查](catalog-publishing-checks.md)。

## A19：品牌发货队列与货代交接（2026-10-11）

- 品牌队列按可信市场读取原生未发货/部分发货订单，列出付款与SKU剩余数量；避免旧Payment筛选遗漏Transactions订单。分析员只读脱敏列表，个人管理员使用原生订单/发货入口。
- 个人管理员明确用途确认后导出货代CSV；实时重读每笔付款、品牌、地址和余量，整批拒绝异常/变化的订单。仅剩余实物行，25订单/500行上限，单元格防公式执行。
- 成功写入不含地址/电话的个人导出记录后才返回文件；按品牌/市场显示最近准备记录。导出不创建发货、不扣库存、不发送客户通知。
- 边界：单号CSV回填、异常物流、退货申请审批、通知失败重试与真实部分发货退款/顾客查单仍待补齐。源码全量检查1076项单元测试、12项原生保护通过；本地2项浏览器/API测试使用模拟Saleor源、实际SQLite，CI原生验收结果在PR记录。说明：[发货与交接](brand-fulfillment-operations.md)。

## A23 — optional module pause, first lifecycle batch

- Added a strict server deployment policy and an authenticated Ops mutation gate, plus direct module checks for theme writes/deletes, reminders, support bot queue/worker and translation queue/review/publish. No registry database lookup on shopper requests.
- Request-time theme/support slots fall back/omit optional extensions; admin plugin page separates integration/extraction/runtime state and explicitly labels analytics/ads/SEO as not covered by this first batch.
- Invalid policy fails closed for the four supported modules. Historical records remain readable. Readiness config digest includes policy changes. Stored data is retained; pause does not cancel already in-flight provider calls or uninstall third-party services.
- Negative tests verify no SQL/network while paused, retained worker authentication, direct write rejection and theme fallback. Native CI additionally runs the same production build with runtime pause enabled, without rebuilding. Actual check results are recorded after completion; no external provider calls are made.
- A23 remains partial until analytics/ads/merchant-feed pause and migration/version/rollback acceptance are implemented. See system-plugins.md for deployment and recovery semantics.

A23 local validation: `verify` passed (178 files / 1087 unit tests + 12 native brand guard tests; ESLint 0 errors / 27 existing warnings). Three local HTTP/browser E2E tests passed; the actual Saleor catalog check is deliberately skipped in the fixture environment and must pass in native CI with the same production build.

Final A19 acceptance: PR #58 cbdbed17 passed all six CI workflows, including real Saleor 3.23.40 fulfillment CSV/audit/UI checks, and was merged to main 49dbea3. PR #59 c714542 also passed all six workflows including same-production-build pause/native catalog checks; its merge reconciliation is revalidated before merging. No external provider acceptance is implied.

## A21：原生商品规格 ProductGroup

- 初始服务器 HTML 输出完整原生规格矩阵、SKU、每规格价格/库存与真实预选链接；父商品 canonical 不随规格改变。
- 明确配置选择属性 slug，不推断缺失品牌、评价或配送退货承诺；缺资料、未知变化维度、超上限或源查询失败回退已有 Product/AggregateOffer。
- 保留静态 PDP shell，只在服务器 Suspense 槽位复用原生选择器的有界缓存查询，最多200规格，不新增 GraphQL 全量火流。
- 本地 verify 通过（180文件/1095单元测试及12原生品牌保护）；真实原生生产构建、初始HTML和浏览器首尾规格预选待本批CI。后台资料继续使用原生编辑器与品牌商品检查入口。A21政策事实、死链/重定向及真实Merchant验收仍未完成。说明：product-group-seo.md。

## A23：分析、广告及 Merchant Feed 暂停

- 七个扩展ID均支持系统暂停。新增采集、退款分析与广告投递/claim在SQL和服务调用前停止，历史报告和投递回执保留范围授权；退款webhook先验签，暂停返回明确503供重试。
- 浏览器收到服务器请求时两个公开布尔值；未知状态不先启用，最多100个早到事件仅在内存等待同意/首次来源初始化后重放。暂停时不挂载外部像素/Vercel采集、不写事件和新来源存储；两类均暂停时跳过结账的可选营销资料补全。
- seo-merchant仅暂停可选Feed，原生商品metadata/canonical/JSON-LD/sitemap保留；CDN旧Feed需部署时按域名清缓存，已下载的第三方副本不由此删除。
- 本批合并verify通过184文件/1106单元及12原生保护（0 lint错误/27既有警告）；同生产构建的原生商品/SEO和浏览器暂停验证待本批CI。A23独立版本/迁移兼容与回滚验收仍待补齐，暂停不等于安装/卸载。

PR #59 final acceptance: all six checks passed at 2ea3629 and merged to main 3753ed4.

## A23：版本化插件存储契约和发布前校验

- 声明七个模块API/存储契约v1和17个现有表。源码DDL漂移、错误字段类型/品牌主键、未知必填字段/触发器、未来装修文档版本、重复事件及未知翻译状态会阻止发布。
- 外部恢复回执明确plugins预期；空数组只声明未预期插件数据，不算已恢复活跃模块。读取副本实际字节并复核SHA，再校验SQLite/契约；预检查在构建/停写之前，最终备份再次检查，私有manifest保留版本/hash和未初始化表。
- 只读检查保留真实数据及加密模型凭据；不调用AI、不读取密钥、不迁移生产libSQL。已知旧分析列只报告运行时补列，不能冒充迁移演练通过。
- 本地7项真实SQLite契约负例和10项发布测试（2项Docker验收留CI）；CI恢复闸门扩展覆盖plugins源码。独立破坏性迁移和目标旧版本应用验收、真实provider/密钥恢复仍待完成。

PR #60 final acceptance: 26539e1 passed all five applicable CI workflows, including native initial ProductGroup HTML, variant prices/SKUs/deep links and all seven pause/core SEO tests; merged to main68e4ecb. Release recovery workflow was path-filtered for that batch and is extended by this storage-contract batch.

## A19：货代单号预检及原生回填（2026-10-12）

- PR #61六项CI通过并合并5ebd29b；继续使用版本化快照契约保护部署。
- 新增个人管理员物流页与CSV模板/上传/预检/确认/逐笔结果/下载/历史。单批最多10笔，可信品牌/channel，重新读取原生付款/实物/履约状态；不同已有单号拒绝。专用凭证与可写审计为必要条件。
- 原生履约更新不创建发货、不调用货代，notifyCustomer=false；原子占位阻止Ops重复提交。未知回执停止批次、不自动重发，同目标原生值一致可核对审计。原生API无CAS，后台并发处理限制明确，跨服务批次不能冒充原子事务。
- 三个核心运营表与活动占位索引纳入恢复检查，插件自身仍是7模块/17表。只读快照检查不迁移真实provider；本地verify与浏览器/原生CI结果以本批PR记录为准。异常物流、RMA、通知重试和真实顾客查单仍待完成。


## A21：Sitemap 分页完整性与有界生成（2026-10-12）

- 修复缺失游标导致静默漏收录、重复游标无限循环、GraphQL部分数据被当作完整目录的问题；保持品牌Host、市场和语言范围。未知Host返回404。
- 每页请求超时、资源级时间/页数上限、地址唯一与合并XML大小检查；超限或上游错误拒绝成功输出，不截断。大目录分片/index仍待实现。
- 新增原生生产构建下的商品totalCount独立核对，开发101商品fixture已触发实际第二页；全量verify与原生CI以本批PR最终记录为准。政策事实、死链/重定向、正式Search Console/Merchant验收仍未完成。说明：[Sitemap完整性](sitemap-integrity.md)。

PR #62 final acceptance: 58a85bba passed all six CI workflows including native fulfillment/tracking writeback and Docker/Postgres recovery; merged to main dce09f2.


PR #63 final acceptance: be6e9656 passed all four applicable workflows including native product totalCount/per-language sitemap discovery checks; merged48c6fe7.

## A17：品牌 WhatsApp 入口与客服加载恢复（2026-10-12）

- 可选运行时配置选择品牌与独立公开号码，未配置品牌无回退；拒绝跨品牌/共享号码/格式注入/额外凭证。前台固定问候、无来源转发，渲染不查询顾客/订单或连接WhatsApp；与Chatwoot独立诊断、共享customer-support暂停。
- Chatwoot SDK/ready等待15秒，异常恢复按钮、重试复用已加载有效SDK；卸载清理计时器/监听，已有SDK语言同步。
- Ops配置诊断真实区分号码校验与正式消息收发。8项新增单元、本地实际组件超时/重试与375px Next后台各1项通过，完整verify和原生生产CI以本批PR最终记录为准。经过认证的订单上下文、会话同步和真实服务/人工接管仍待完成；入口不等于WhatsApp Business API已集成。说明：[客服配置与边界](customer-support.md)。

## A11：CSV 原生 SKU、市场与币种核对（2026-10-12）

PR #64 final acceptance: 4a295c2 passed all six workflows including native production support HTML/brand/auth/mobile checks and recovery gates; merged510a94a. Real Chatwoot/WhatsApp service acceptance remains pending.

- 在格式校验之外增加原生全局SKU精确查询，不再把任意不存在SKU或格式正确的错误币种当作原生资料通过。商品与规格必须同时分配该品牌市场，市场启用且币种一致；缺失/重复/其他品牌SKU统一提示，不返回其他品牌资料。
- 去重后100 SKU/请求，整批20秒预算；分页未完整、GraphQL部分错误或异常身份拒绝整批。格式失败不读取原生；严格UTF-8/流式1MB上限独立于客户端Content-Length。
- 管理员上传、两种状态和错误下载复用现有品牌商品页。全量verify及真实Saleor/生产构建以本批PR记录为准；本地Next/API和375px实际操作2项通过，原生响应使用本地fixture，仅CI承担真实后端验收。
- 本批全部只读，没有创建/更新商品；价格精度/库存/重量/图片、提交时重读、实际bulk写入与恢复、大规格完整分页仍待完成。说明：[商品检查与导入前核对](catalog-publishing-checks.md)。

## A21：Sitemap index 与游标分片（2026-10-12）

- 根地图改为索引，按语言/可信市场/资源/页段分片，每片最多1000URL；索引扫描保存游标范围和摘要，实际分片读取自己的有界页面，不拼接全目录URL矩阵。
- 保留严格部分错误/分页完整性、原生缓存标签、XML条数/UTF-8大小保护；未知Host/外品牌ID拒绝，目录错误503且不当空结果。原生CI跟随index读取所有分片，再独立核对原生商品总数，不弱化原有双品牌断言。
- 500页/资源和时间预算继续保留；特别大/高频更新目录的快照导出、原生跨请求一致性与正式Search Console/峰值验收仍未完成。本批验证及合并结论见PR。说明：[Sitemap分片与边界](sitemap-integrity.md)。

PR #65 final acceptance: 68c2479 passed all five applicable CI workflows, including real Saleor native SKU/market/currency preflight and recovery gates; merged5387a86. Actual bulk writes remain pending.
