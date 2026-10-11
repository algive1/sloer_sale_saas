# Analytics V3.2：订单催付（自建部署）

## 设计范围

- **人工催付**：在数据总览的「最近订单」点击「催付」，确认后向订单邮箱发送一次事务邮件。按订单 ID 直接读取 Saleor 并在发送前再次检查支付、授权、退款、订单状态。人工阶段每单最多发送一次。
- **自动催付**：在 `/ops/analytics/reminders` 开启。默认**关闭**。首次提醒默认为下单后 24 小时，再次提醒为 72 小时；每品牌滚动24小时至多 5 封，范围可以在管理页调整。每单每阶段最多一次，且至少相隔 24 小时。
- 自动发送只处理 Salesor **已创建订单**，不把只到达 checkout 的匿名会话视为待支付订单；已付、取消、发货、退货订单均跳过。
- 两种催付都记录在 `ops_reminder_site_delivery`，包括阶段、尝试时间、发送状态和邮件提供商返回 ID。超时或失败的请求**不自动重试**，防止邮件已经投递但服务器误判后重复发送。
- 手动查看/发货跳转到已存在的 Saleor Dashboard 订单页面，不会在分析模块重写发货及库存逻辑。

## 前置条件

在 **storefront 服务端**配置以下环境变量，不要加 `NEXT_PUBLIC_` 前缀给密钥。

1. `SALEOR_APP_TOKEN`：具备 `MANAGE_ORDERS`，且 API 地址为 `NEXT_PUBLIC_SALEOR_API_URL`。
2. `SALEOR_DASHBOARD_URL`：已经部署的 Saleor 后台根地址，用于「编辑商品」「去发货」「查看」。
3. `ANALYTICS_LIBSQL_URL`、`ANALYTICS_LIBSQL_AUTH_TOKEN`：已有分析数据库。`/ops` 认证使用 legacy 模式下的 `ANALYTICS_DASHBOARD_SECRET`，或启用 `OPS_OPERATORS_JSON` 后的 `platform_admin` 账号。
4. `RESEND_API_KEY`、`PAYMENT_REMINDER_FROM`：Resend 账号 API Key 与已验证发件域名。邮件不含营销信息，提供订单自助查询地址。
5. `NEXT_PUBLIC_STOREFRONT_URL`：客户可访问的正式网站域名，用于邮件中的 `/order/find` 链接。
6. `PAYMENT_REMINDER_CRON_SECRET`：另外生成随机长密钥，只供定时任务调用。

启动后访问 `/ops/analytics/reminders`。确认邮件及 Cron 密钥均显示已配置，再勾选启用和保存规则。**仅保存规则不会自行运行；还需要安排定时任务。**

## 自建服务器 Cron

以下示例为每小时执行一次（具体时间由服务器时区决定）。Basic auth 在 legacy 模式使用 `analytics` / `ANALYTICS_DASHBOARD_SECRET`；开启 `OPS_OPERATORS_JSON` 后**必须改用一组 `platform_admin` 凭证**，旧凭证不会回退。Cron 请求还必须提供 `PAYMENT_REMINDER_CRON_SECRET`。建议把密钥放在 root-only 环境文件，避免写在 crontab 明文里。

```sh
# /etc/commerce-reminder.env 权限设置为 0600
# OPS_BASIC_USER=analytics               # 启用 OPS_OPERATORS_JSON 后改成 platform_admin 的 username
# OPS_BASIC_PASSWORD=...                  # 对应的 Basic password (legacy 模式可使用 ANALYTICS_DASHBOARD_SECRET)
# PAYMENT_REMINDER_CRON_SECRET=...
# OPS_BASE_URL=https://shop.example.com
set -a
. /etc/commerce-reminder.env
set +a
curl --fail-with-body --silent --show-error --max-time 300 \
  -u "$OPS_BASIC_USER:$OPS_BASIC_PASSWORD" \
  -H "x-reminder-cron-secret: $PAYMENT_REMINDER_CRON_SECRET" \
  -X POST "$OPS_BASE_URL/ops/api/analytics/reminders/run"
```

不要直接公开 webhook 或把 Cron 密钥写入客户端 JS。启用生产自动规则前，请先使用测试订单验证邮件格式和状态跳过逻辑。

## 限制与安全

- 自动任务按 Saleor 创建时间倒序逐页扫描（每页 100 笔，每渠道单次最多 20 页）；只处理规则期限加 24 小时内的有效订单。返回 JSON 中的 `scanned` 是实际扫描量，`truncated=true` 表示命中分页上限或分页异常，须检查任务日志并考虑更小时间窗口/离线队列。不是全量欠款追缴系统。
- 页面「最近订单」不显示未经验证的付款时间：目前 Saleor 查询只返回下单时间和付款状态，因此付款时间列在未取得准确交易时间前显示 `—`。支付渠道优先显示 Saleor 付款网关名称。
- 订单来源如果无法由首次访问归因匹配则显示 `—`，不能根据支付提供商猜测来源。
- 必须遵循收件人的本地法规、店铺服务条款及适用的事务邮件要求，处理投诉与误催付反馈。
- 如果邮件发送失败、超时或返回不明确，先检查邮件提供商日志，不要绕过唯一键直接再次触发。
- 规则初始关闭；界面控制通过 /ops HTTP Basic 保护，人工 API 另要求自定义请求头；Cron API 另要求独立共享密钥。
- 如果使用项目根目录的 Docker Compose 部署，应在根目录 `.env` 设置 `SALEOR_APP_TOKEN`、`ANALYTICS_LIBSQL_*`、`ANALYTICS_DASHBOARD_SECRET`（legacy）或 `OPS_OPERATORS_JSON`（新账号）、`RESEND_API_KEY`、`PAYMENT_REMINDER_FROM`、`PAYMENT_REMINDER_CRON_SECRET`。运行容器的环境变量已显式映射到 `storefront` 服务；只有写在 `storefront/.env.example` 不会让 Docker 运行时自动注入。

## 多品牌配置与后台操作

在已配置 `STOREFRONT_SITES_JSON` 的部署中，必须额外提供以下服务器配置。不能用全局 `PAYMENT_REMINDER_FROM` 或全局网站 URL 替代品牌身份。

```dotenv
PAYMENT_REMINDER_SITES_JSON='[{"siteId":"fashion","from":"Fashion <orders@fashion.example>","locale":"de"},{"siteId":"jewelry","from":"Jewelry <orders@jewelry.example>","locale":"fr"}]'
```

- `siteId` 必须存在于品牌注册表；每品牌仅一项。发件域名必须属于该品牌的域名或子域名，还需在 Resend 验证。支持邮件语言 `en/de/fr/es/zh`，必须显式指定。畸形 JSON、重复项、未知品牌、跨品牌发件域名、错误语言均禁止发送，不回退到全局配置。
- 复用平台的 `RESEND_API_KEY`，适用于同一经营方管理的多个品牌。品牌独立发件人不代表独立邮件账户或完整 SaaS 租户隔离。
- 未配置邮件身份的品牌保持禁止发送。新品牌规则默认关闭；单品牌旧规则和历史只迁移到保留的 `legacy:single` 范围，不能自动启用任何品牌。旧发送尝试也阻止相同订单被迁移后重复催付。
- `/ops/analytics/reminders` 由 `platform_admin` 管理。选择品牌后查看发件人、域名、语言、渠道、规则和最近40次发送记录。邮件身份为部署配置，只读；保存按钮写入当前品牌规则。缺少配置时仍可保存关闭规则，且允许停用已经开启的规则。`brand_analyst` 无访问/修改权限。
- 人工催付从 Saleor **重新读取**订单，依据真实 `channel.slug` 解析品牌；客户端传来的品牌仅用于核对，不能授权、改变归属或覆盖邮件参数。缺少 channel、未知渠道和品牌不匹配均不发送。
- 自动 Cron 顺序运行品牌范围，各渠道独立分页，按品牌共享滚动24小时额度。Saleor 查询包含可信 `channel` 参数，返回记录也重新核对渠道；发送时再次核对实时归属、支付状态、规则是否停用及到期时间。
- 规则和日志分别存放在 `ops_reminder_site_rule` / `ops_reminder_site_delivery`。数据库原子写入同时约束品牌额度、订单阶段唯一性、跨阶段冷却和不确定尝试。失败尝试也占用额度；失败/发送中记录禁止另一个阶段绕过防重复保护。
- 邮件提供商成功但日志更新失败时保持“结果待核查”，不会标记确定失败或自动重发。后台错误只保存受控代码，不保存上游异常中的密钥/客户资料。已提交邮件服务不等于客户已收到。
- 使用 [Resend Idempotency-Key](https://resend.com/changelog/idempotency-keys) 作为额外保护，使用 SHA-256 固定长度键；长期防重复仍依赖数据库唯一约束，而非提供商24小时保留期。
- Cron 返回总量和 `sites` 各品牌结果，`reason` / `truncated` 应纳入运行监控。单品牌发生错误仍检查其他品牌；扫描窗口或分页上限意味着不会全量追缴历史订单。

### 验收范围

- SQLite 回归覆盖独立规则、旧数据迁移、真实渠道核对、品牌日志、并发重复请求、并发额度、失败占用、发送成功日志失败、阶段到期与24小时冷却。
- 构建后的后台 E2E 覆盖认证、跨站请求阻断、按品牌保存规则、浏览器切换与刷新持久化。CI 不配置真实邮件密钥，不发送邮件。
- 本地邮件调用使用模拟响应。生产启用前需验证 Resend 域名、真实收件、实际 Saleor 权限与服务器 Cron 调度。
