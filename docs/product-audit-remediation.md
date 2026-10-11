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
