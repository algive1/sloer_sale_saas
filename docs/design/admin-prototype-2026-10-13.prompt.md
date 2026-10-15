# 后台原型最终提示词

生成方式：内置 `image_gen`，`ui-mockup`，非透明背景。用户补充要求为“配色 UI 现代一些，不要有 AI 味”。以下是最终样式重绘提示词。

输入图片是已核对功能的初稿，只用于保留功能与内容。最终采用浅色导航、灰白基底、深色文字与低饱和雾蓝色。

```text
Use case: ui-mockup
Asset type: FINAL high-fidelity Chinese commerce admin style prototype.
Input images: Image 1 is the edit target and FUNCTIONAL/CONTENT reference. It shows the already-audited SLOER Commerce admin screen. Preserve its real feature inventory, seven plugin entry points, existing Chinese navigation labels, numeric examples, chart/table subjects, and one-screen desktop framing. Restyle and refine the UI substantially as specified below.

Primary request: The user wants a more modern color palette and product UI without the stereotypical appearance of AI-generated dashboards. Make this feel like a carefully art-directed, restrained, usable commerce operations product. Deliver ONE complete flat desktop screen of "经营总览". This is a styling prototype, not production software; keep the label "设计预览 · 示例数据" in a small neutral outlined badge.

Visual direction: restrained contemporary product design, light neutral surfaces, confident black typography, extremely subtle steel-blue accents, concise controls, quiet precise borders. Functional information hierarchy, not decoration. The design should feel considered and calm at high data density. Align numbers and columns meticulously.

Palette:
- Whole interface is LIGHT; the sidebar is pale cool gray #f6f7f9, not navy or black.
- Workspace #fafbfc, white module interiors #ffffff.
- Headings and main values #1b1f24; body text #3c434c; secondary labels #66707d.
- Dividers and outlines #e3e7ec.
- A single restrained steel-blue accent #496786, used sparingly for the selected navigation indicator, text links and the trend line. Active sidebar background is a very light gray-blue #e8edf3 with dark text, not a saturated cyan/teal pill.
- Semantic status only: subdued green text for "已付款" and small muted amber text for "待付款" and issues. No saturated colored icon tiles.
- Traffic categorical chart uses five legible desaturated blue-gray tones with labels and numeric percentages; consistent color coding everywhere. No purple, pink, rainbow or teal palette. Use natural=#496786, paid=#7d93ad, Direct=#a1b2c4, Referral=#becbd8, unknown=#dce3ea.

Replace these old design choices:
- Remove teal gradients, shaded 3D logo effect, glow, bright cyan icons, colored square icon holders, icons beside KPI values, big rounded pills and decorative shadows.
- Replace the six independent boxed KPI tiles with ONE open, elegant horizontal six-column metric strip on white, separated by very subtle vertical dividers. All six existing KPI labels and values remain: "访问会话" 24,680; "成交订单" 864; "转化率" 3.50%; "净成交额" $64,800.00; "客单价" $75.00; "弃单结账" 186. Values should be large, clean and tabular, labels small and dark gray, no tiny sparklines or fake change percentages.
- Reduce module corners to 5-6px, controls to 4-5px, crisp 1px borders, essentially no shadows. Small outline icons only where they serve navigation or actions.
- Use clear type hierarchy and disciplined 8px spacing increments rather than uniform decorated cards. Let the report tables look like tables, with subtle row separators and generous enough cell padding. One neutral font family, Chinese similar to Noto Sans SC, Latin/numerals similar to the existing dashboard font; no serif display typography.

Composition:
Sidebar remains about 250px at a logical 1600px viewport, now light and quiet. Retain flat S mark and "SLOER Commerce" with small gray "Admin" text, a collapse icon, small navigation search "搜索功能…" and exact original groups in original order: 首页; 订单 with 订单列表 / 智能催付; 商品; 客户 with 会话工作台; 营销; 数据分析 with 经营总览 selected / 实时数据 / 流量分析 / 结账分析 / 商品分析; 在线商店 with 品牌站点 / 主题装修 / 商品详情页模板 / AI 多语言; 销售渠道; 应用 with 已安装应用 / 广告投递 / SEO 与 Merchant Feed; 设置. Use meaningful indentation and subtle section spacing. All seven existing plugins must remain visible. Bottom account is neutral "管理员" with AD initials, no email or other personal data. Every first-level icon is the same thin monochrome family.

One top toolbar, white and lightly separated, with one clear global search "搜索订单、商品、客户…", the small example-data label, 简体中文 and AD account. Do not invent notification bells or services.
Page heading "经营总览" in a confident medium-weight size about 28-30 logical px, small breadcrumb "数据分析 / 经营总览", brief subtitle "销售、转化、流量与商品表现"; platform scope "平台全部品牌汇总" in plain muted text, not another colored chip. Display "USD · UTC". Right-aligned compact segmented "7 天 / 30 天 / 90 天", active option dark graphite with white text, and understated "实时数据" link.

Below KPI strip:
Report row 1: conversion funnel, traffic composition, Top sources. All equal height, but widths can be gently adjusted to make the traffic table more readable. Conversion funnel uses seven thin solid steel-blue bars, sample counts from the reference, with plain labels and aligned numbers. Traffic donut flat and precise, five muted blue-gray segments at 40.2%, 28.8%, 15.6%, 10.3%, 5.1%; central "24,680" / "会话"; five labels 自然 / 付费 / Direct / Referral / 未知; dot colors identical in legend and table. Preserve its table header "渠道 | 流量 | 加购 | 订单 | 转化率 | 收入" and sample table rows from the reference. Top source table retains 来源 / 会话 / 订单 / 转化率 and Google / Meta / Direct / TikTok / Referral. Plain text "详情" / "查看全部" top-right actions, no decorative floating buttons.

Report row 2: business trend and checkout health. Trend is a slender steel-blue line on a clean white plot with light horizontal gridlines, no gradient or area glow, dates 10/07 to 10/13. Keep local compact 近7日 and USD controls. Financial summary is an unboxed four-column row separated by one subtle horizontal rule: 总销售额 $68,400 / 退款 $3,600 / 运费 — / 净销售额 $64,800. Checkout health is a clean 2x2 plain-text metric layout with no icon tiles, showing 开始结账 1,260 / 选择支付 1,050 / 支付失败事件 42 / 弃单会话 186. A small inline amber "需核对的支付失败事件" and 查看原因 link, not a large warning card.

Report row 3: 商品表现 and 地区与市场. Keep compact tabs 具体商品 / 商品分类 and all original table columns. Neutral tiny placeholder thumbnails, example product names and SKU text; no unrelated photography. Regions show separate currency examples, exactly "USD 31,200", "GBP 16,400", "JPY 9,800", no incorrect symbols and no cross-currency total.
Last report: 最近订单, clean full-width dense native-looking table, three demo rows, no added customer personal data. Original headers and examples remain; payment dates exactly 2026-10-13 14:28 and 2026-10-13 11:05; pending time "—". Status words are readable and understated. Pending payment action "催付" is disabled in subdued gray with "需邮件配置". Keep 查看 action. Small footer "原型示例，非实时经营数据".

Constraints: Preserve real current project functions and all seven plugin contexts. No invented marketplace, per-store plugin activation, standalone AI image app, fake notifications, predictions or extra implementation claims. Keep one shell and one navigation, not duplicate embedded sidebars. Full-frame flat desktop UI; no device, no browser frame, no collage, no perspective. Sharp accurate Simplified Chinese, crisp readable type. No dark sidebar, no cyan/teal saturation, no purple or pink, no gradient, no glassmorphism, no oversized rounded rectangles, no emojis, no decorative 3D shapes, no floating badge stacks. The result should look like a disciplined human-designed production admin, with fewer visual decorations and stronger information hierarchy.
```

## 最终局部校正

```text
Use case: ui-mockup
Asset type: final typography and brand-mark cleanup of the LIGHT SLOER Commerce admin prototype.
Input images: Image 1 is the EDIT TARGET. Preserve the entire light interface, every layout, every chart, every navigation item, spacing, typography, all table contents outside the specified three cells, example-data badge, footer, and image dimensions.
Primary request: Change ONLY two tiny locations:
A. At the upper left, replace the shiny teal 3D-looking S icon with a FLAT two-dimensional S monogram. A thin graphite rounded-square outline, a simple dark graphite letter "S" inside, white background. Absolutely no gradient, cyan, bevel, highlight, glow or shadow. Do not change the adjacent "SLOER Commerce" wordmark or Admin text.
B. In the "地区与市场" table (middle-right, immediately above the recent-orders table), the last "收入" column has three currency codes already displayed correctly: USD, GBP and JPY. Keep those codes where they are. Delete the "$" symbol in ALL THREE numeric amounts. Render the separate numeric amounts exactly: "31,200" on the United States row, "16,400" on the United Kingdom row, "9,800" on the Japan row. Thus each row visually reads "USD 31,200", "GBP 16,400", "JPY 9,800". There must be zero dollar symbols in this one regional table; do not change dollar signs anywhere else in the image.
Constraints: These are the only edits. Do NOT recolor charts or the rest of the sidebar. Do not restyle anything else. Preserve the crisp modern light-gray, white and muted steel-blue appearance. Do not add any new decorative graphics, controls, labels or data.
```

## 日元金额单字符校正

```text
Use case: ui-mockup
Input image 1: edit target. Preserve every pixel and the entire interface except ONE currency-symbol glyph.
Make just one tiny textual edit. Locate the "地区与市场" table in the lower right. Its third data row is "日本", with the code "JPY" toward the right and a final amount "$9,800" in the last cell. This is around x=1430,y=860 in the 1512x1040 image. Remove the single dollar sign before 9,800 in THIS JAPAN ROW ONLY. The final row must read "JPY    9,800". The last cell is exactly "9,800", with no dollar sign, no yen sign, no other currency symbol.
Do not change the United States or United Kingdom rows, which already correctly show "USD 31,200" and "GBP 16,400". Do not change any other dollar sign elsewhere in the UI. Do not change any layout, typography, color, logo, chart, number, Chinese label, footer or any other content. Keep the clean light modern style and the exact same image size and framing. Only erase that ONE erroneous "$" glyph on the Japan row.
```
