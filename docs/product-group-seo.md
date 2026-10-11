# 商品规格结构化数据

多规格商品使用原生 Saleor 的商品 ID、规格 ID/SKU、当前市场价格、库存与选择属性生成 ProductGroup。链接使用现有 `?variant=<规格ID>`，页面维持父商品 canonical。内容来自服务器 HTML；不需要搜索引擎执行浏览器埋点或读取私有后台。

## 数据条件和后台处理

- 原生商品编辑器填写每个规格的唯一 SKU、当前市场价格、库存和实际选择属性。运营在品牌商品检查页查看缺失 SKU、市场价格、库存和图片问题，继续通过原生入口修改；保存后等待现有缓存刷新或原生商品 webhook 失效。
- 明确映射属性 slug：`color`/`colour`、`size`/`shoe-size`/`ring-size`、`material`、`pattern`。品牌自定义属性须在 `storefront/src/config/seo-product-variants.ts` 显式登记；不从翻译名称猜颜色或尺码。
- 仅完整的 2–200 规格矩阵可以输出。复用原生规格选择器的两页有界缓存查询；未知数量、超过上限、不完整 SKU/价格/库存/图片/属性、未映射的变化属性或查询失败，保留已有 Product/AggregateOffer，不输出不完整 ProductGroup。
- 每个规格的 Offer 使用真实币种/价格及自身库存。卖家和网址沿用可信 Channel 品牌配置，制造商品牌只取真实商品属性；未知品牌不替换成店铺名称。
- 不生成评价、评分、GTIN、配送/退货承诺。配置实际政策及商家账户后另行验收这些事实；结构化数据不保证搜索展示或 AI 引用。

## 验证和上线

单元测试覆盖品牌范围、编码后的 ID 深链接、不同规格库存、完整矩阵条件、未知属性、缺失资料、查询失败和内联 JSON 的安全转义。真实 Saleor CI 核对初始 HTTP HTML 的 ProductGroup 与原生价格/SKU，并通过浏览器打开首尾两个规格链接，验证实际尺码预选；生产构建检查 Suspense/PPR 边界。

正式品牌上线前用实际域名检查 HTML/canonical/规格预选，用 Rich Results Test 和 Merchant Center 检查商品与 Feed 的一致性。CI fixture 并不代替真实 Merchant 审核或目标国缓存/库存验收。

参考：[Google 商品规格结构化数据](https://developers.google.com/search/docs/appearance/structured-data/product-variants)。
