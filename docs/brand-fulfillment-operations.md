# 品牌发货与货代交接

入口：品牌经营概况 → 发货与货代交接，或 `/ops/sites/{siteId}/fulfillment`。

## 操作流程

1. 选择当前品牌的市场，读取未发货/部分发货订单。每页25笔，未付清订单也显示，但不可导出。
2. 核对SKU、订单数量、已发数量、剩余数量和现有物流记录。个人管理员可打开原生订单/发货页。
3. 选择本次交给货代的订单，并确认收件资料只用于履约。导出前再次读取原生付款状态、品牌归属、地址和剩余数量；任何订单发生变化/缺资料时整批拒绝，请刷新核对。
4. 下载CSV，核对后交给货代。CSV一行对应一条剩余实物订单行，不包含无需物流的数字商品。整单重量及单位保持原生值，**不是本次部分发货的包裹重量**；实际包装重量/仓库/发货数量在原生后台确认。
5. 在原生后台创建/确认发货，回填承运商单号，按原生通知流程操作。退款/部分退款也沿用原生能力。CSV导出不会创建发货、扣库存、退款或发通知；重复导出不会重复创建发货。

## 权限与配置

- 队列页面/API仅接受平台管理员或被分配到该品牌的分析员；分析员不展示地址、导出控件或原生全局后台入口。
- CSV导出仅限 `OPS_OPERATORS_JSON` 中的个人平台管理员；共享 `analytics` 账户不能导出。POST必须满足同源及专用请求头，且明确用途确认。
- `OPS_FULFILLMENT_SALEOR_TOKEN` 是服务器专用凭证，需要原生 `MANAGE_ORDERS`，不返回浏览器；可兼容服务器 `SALEOR_APP_TOKEN`。建议单独配置，最小授权，并限制原生API网络访问。
- `SALEOR_DASHBOARD_URL` 指向原生后台根地址；原生后台仍独立认证/授权。此页不会给员工新增Core权限。
- `ANALYTICS_LIBSQL_URL` / `ANALYTICS_LIBSQL_AUTH_TOKEN` 存储导出记录。数据库未配置、写失败或写入结果未确认时不返回含收件资料的文件。
- API使用 `private, no-store`，按可信品牌市场查询，并再次核对每条返回订单的Channel。列表只读最小地址存在性字段，API投影不包含姓名、电话、地址。

## 导出格式与记录

最多25笔订单/500行。包含订单/行ID、单号、品牌市场、SKU/名称、剩余实物数量、整单重量及单位、收件人、公司、国家/省/市/邮编/街道/电话，不包含邮箱。文本单元格防止CSV公式执行；电话以文本保存。

审计仅记录准备导出的UUID、品牌、市场、个人管理员、时间、订单/行数和订单ID集合摘要；不保存原始CSV或收件信息。最近20条记录按当前品牌/市场读取。记录表示**文件已准备**，不证明浏览器下载、货代接收、通知投递或实际发货成功。

队列按 `UNFULFILLED` / `PARTIALLY_FULFILLED` 查询并检查实时 `isPaid`。Saleor 3.23.40 原生 `ready_to_fulfill` 筛选仍依赖旧Payment表，不能据此排除新Transactions API的已付款订单。

## 验收与剩余范围

本地通过全量源码检查（176个文件/1076项单元测试、12项原生品牌保护测试），以及真实Next HTTP → Hrana → SQLite 的2项浏览器/API测试；本地Saleor源响应是隔离测试fixture。CI另用真正Saleor 3.23.40数据库、原生应用凭证和Transactions API订单验证读取/导出/后台入口。

A19尚未整体完成：货代CSV单号回填/导入、异常物流跟进、退货申请/人工审批、失败通知重试记录，以及真实货代/原生部分发货退款和顾客查单验收仍需后续补齐。此批不连接货代账户或发送客户通知。

Queue export selection now excludes physical remaining lines with missing/whitespace SKU; native fulfillment links stay available for an otherwise paid shippable order. Fresh export still rechecks SKU and returns 409 on changes. Native Transactions smoke chooses an actually stocked physical variant with a SKU from the original fixture; incomplete fixture variants remain visible for catalog/fulfillment negative checks.
