# Analytics V3.2：订单催付（自建部署）

## 设计范围

- **人工催付**：在数据总览的「最近订单」点击「催付」，确认后向订单邮箱发送一次事务邮件。按订单 ID 直接读取 Saleor 并在发送前再次检查支付、授权、退款、订单状态。人工阶段每单最多发送一次。
- **自动催付**：在 `/ops/analytics/reminders` 开启。默认**关闭**。首次提醒默认为下单后 24 小时，再次提醒为 72 小时；每日至多 5 封，范围可以在管理页调整。每单每阶段最多一次，且至少相隔 24 小时。
- 自动发送只处理 Salesor **已创建订单**，不把只到达 checkout 的匿名会话视为待支付订单；已付、取消、发货、退货订单均跳过。
- 两种催付都记录在 `ops_reminder_delivery`，包括阶段、尝试时间、发送状态和邮件提供商返回 ID。超时或失败的请求**不自动重试**，防止邮件已经投递但服务器误判后重复发送。
- 手动查看/发货跳转到已存在的 Saleor Dashboard 订单页面，不会在分析模块重写发货及库存逻辑。

## 前置条件

在 **storefront 服务端**配置以下环境变量，不要加 `NEXT_PUBLIC_` 前缀给密钥。

1. `SALEOR_APP_TOKEN`：具备 `MANAGE_ORDERS`，且 API 地址为 `NEXT_PUBLIC_SALEOR_API_URL`。
2. `SALEOR_DASHBOARD_URL`：已经部署的 Saleor 后台根地址，用于「编辑商品」「去发货」「查看」。
3. `ANALYTICS_LIBSQL_URL`、`ANALYTICS_LIBSQL_AUTH_TOKEN`、`ANALYTICS_DASHBOARD_SECRET`：已有分析数据库及 /ops HTTP Basic 认证。
4. `RESEND_API_KEY`、`PAYMENT_REMINDER_FROM`：Resend 账号 API Key 与已验证发件域名。邮件不含营销信息，提供订单自助查询地址。
5. `NEXT_PUBLIC_STOREFRONT_URL`：客户可访问的正式网站域名，用于邮件中的 `/order/find` 链接。
6. `PAYMENT_REMINDER_CRON_SECRET`：另外生成随机长密钥，只供定时任务调用。

启动后访问 `/ops/analytics/reminders`。确认邮件及 Cron 密钥均显示已配置，再勾选启用和保存规则。**仅保存规则不会自行运行；还需要安排定时任务。**

## 自建服务器 Cron

以下示例为每小时执行一次（具体时间由服务器时区决定）。Basic auth 使用你已有的 ANALYTICS_DASHBOARD_SECRET，而 Cron 请求还必须提供 PAYMENT_REMINDER_CRON_SECRET。建议把密钥放在 root-only 环境文件，避免写在 crontab 明文里。

```sh
# /etc/commerce-reminder.env 权限设置为 0600
# ANALYTICS_DASHBOARD_SECRET=...
# PAYMENT_REMINDER_CRON_SECRET=...
# OPS_BASE_URL=https://shop.example.com
set -a
. /etc/commerce-reminder.env
set +a
curl --fail-with-body --silent --show-error --max-time 30 \
  -u "analytics:$ANALYTICS_DASHBOARD_SECRET" \
  -H "x-reminder-cron-secret: $PAYMENT_REMINDER_CRON_SECRET" \
  -X POST "$OPS_BASE_URL/ops/api/analytics/reminders/run"
```

不要直接公开 webhook 或把 Cron 密钥写入客户端 JS。启用生产自动规则前，请先使用测试订单验证邮件格式和状态跳过逻辑。

## 限制与安全

- 自动任务按 Saleor 创建时间倒序逐页扫描（每页 100 笔，单次最多 20 页）；只处理规则期限加 24 小时内的有效订单。返回 JSON 中的 `scanned` 是实际扫描量，`truncated=true` 表示命中分页上限或分页异常，须检查任务日志并考虑更小时间窗口/离线队列。不是全量欠款追缴系统。
- 页面「最近订单」不显示未经验证的付款时间：目前 Saleor 查询只返回下单时间和付款状态，因此付款时间列在未取得准确交易时间前显示 `—`。支付渠道优先显示 Saleor 付款网关名称。
- 订单来源如果无法由首次访问归因匹配则显示 `—`，不能根据支付提供商猜测来源。
- 必须遵循收件人的本地法规、店铺服务条款及适用的事务邮件要求，处理投诉与误催付反馈。
- 如果邮件发送失败、超时或返回不明确，先检查邮件提供商日志，不要绕过唯一键直接再次触发。
- 规则初始关闭；界面控制通过 /ops HTTP Basic 保护，人工 API 另要求自定义请求头；Cron API 另要求独立共享密钥。
- 如果使用项目根目录的 Docker Compose 部署，应在根目录 `.env` 设置 `SALEOR_APP_TOKEN`、`ANALYTICS_LIBSQL_*`、`ANALYTICS_DASHBOARD_SECRET`、`RESEND_API_KEY`、`PAYMENT_REMINDER_FROM`、`PAYMENT_REMINDER_CRON_SECRET`。运行容器的环境变量已显式映射到 `storefront` 服务；只有写在 `storefront/.env.example` 不会让 Docker 运行时自动注入。
