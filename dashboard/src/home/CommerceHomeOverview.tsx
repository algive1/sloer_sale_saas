import { gql, useQuery } from "@apollo/client";
import { useUser } from "@dashboard/auth/useUser";
import { PermissionEnum } from "@dashboard/graphql";
import { Box } from "@saleor/macaw-ui-next";
import { useIntl } from "react-intl";
import { Link } from "react-router-dom";

import { summarizeHomeOrders, type HomeOrder } from "./commerceHomeMetrics";
import styles from "./CommerceHomeOverview.module.css";

interface RecentOrdersResult {
  orders: {
    totalCount: number | null;
    edges: { node: HomeOrder }[];
  } | null;
}

/** Uses Saleor's authenticated staff GraphQL session, not a public token.
 * The 100 most recent orders are a SAMPLE, not the shop's net sales totals.
 * The actual Saleor Pulse app, if installed, keeps using its official home tab.
 */
const RECENT_ORDERS = gql`
  query CommerceAdminHomeRecentOrders {
    orders(first: 100, sortBy: { field: CREATION_DATE, direction: DESC }) {
      totalCount
      edges {
        node {
          id
          created
          status
          paymentStatus
          total { gross { amount currency } }
        }
      }
    }
  }
`;

export const CommerceHomeOverview = () => {
  const { user } = useUser();
  const locale = useIntl().locale.toLowerCase();
  const zh = locale.startsWith("zh");
  const canReadOrders = Boolean(user?.userPermissions?.some(
    permission => permission.code === PermissionEnum.MANAGE_ORDERS,
  ));
  const { data, loading, error, refetch } = useQuery<RecentOrdersResult>(RECENT_ORDERS, {
    skip: !canReadOrders,
    fetchPolicy: "cache-and-network",
    pollInterval: canReadOrders ? 60_000 : 0,
  });
  const orders = data?.orders?.edges?.map(edge => edge.node) ?? [];
  const sampled = summarizeHomeOrders(orders, new Date());
  const max = Math.max(1, ...sampled.days.map(d => d.count));
  const fmtMoney = (amount: number, currency: string) => {
    try { return new Intl.NumberFormat(zh ? "zh-CN" : "en-US", { style: "currency", currency }).format(amount); }
    catch { return `${amount.toFixed(2)} ${currency}`; }
  };
  const cards = [
    {
      label: zh ? "历史订单总数" : "All-time orders",
      value: data?.orders?.totalCount?.toLocaleString() ?? "—",
      note: zh ? "Saleor 全店订单数量" : "All orders across Saleor",
    },
    {
      label: zh ? "最新订单样本" : "Recent order sample",
      value: loading && !data ? "…" : sampled.sampledOrders.toLocaleString(),
      note: zh ? "仅最近最多 100 笔" : "Latest 100 orders at most",
    },
    {
      label: zh ? "样本待发货" : "Sample awaiting fulfillment",
      value: sampled.awaitingFulfillment.toLocaleString(),
      note: zh ? "来自上述样本" : "Within the recent sample",
    },
    {
      label: zh ? "样本待付款" : "Sample pending payment",
      value: sampled.pendingPayment.toLocaleString(),
      note: zh ? "来自上述样本" : "Within the recent sample",
    },
  ];

  return (
    <Box className={styles.root} data-test-id="commerce-home-overview">
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>SLOER · COMMERCE OVERVIEW</div>
          <h1 className={styles.heading}>{zh ? "欢迎回来 · 经营概览" : "Welcome back · Commerce overview"}</h1>
          <p className={styles.subheading}>
            {zh ? "自托管实时订单概览（不是官方 Saleor Pulse）。每分钟自动更新。" :
              "Self-hosted commerce metrics (not official Saleor Pulse). Refreshed every minute."}
          </p>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.action} onClick={() => void refetch()} disabled={!canReadOrders || loading}>
            {zh ? "刷新" : "Refresh"}
          </button>
          <Link to="/orders" className={styles.action}>{zh ? "全部订单 ↗" : "All orders ↗"}</Link>
        </div>
      </div>

      {!canReadOrders ? (
        <div className={styles.notice}>
          {zh ? "当前账号没有订单查看权限，因此不会显示经营数据。请联系管理员授权。" :
            "Your staff account has no order permissions; commerce data is hidden."}
        </div>
      ) : error ? (
        <div role="alert" className={styles.notice}>
          {zh ? "无法读取 Saleor 订单数据，请检查 GraphQL 服务与当前账号权限。" :
            "Could not read Saleor orders. Check GraphQL and staff permissions."}
        </div>
      ) : (
        <>
          <section className={styles.cards} aria-label={zh ? "经营指标" : "Commerce metrics"}>
            {cards.map(card => (
              <article className={styles.card} key={card.label}>
                <p className={styles.cardTitle}>{card.label}</p>
                <div className={styles.cardNumber}>{card.value}</div>
                <p className={styles.cardNote}>{card.note}</p>
              </article>
            ))}
          </section>
          <section className={styles.grid}>
            <article className={styles.panel}>
              <h2 className={styles.panelTitle}>{zh ? "近七天订单 · 最新样本" : "Last 7 days · recent sample"}</h2>
              <div className={styles.chart}>
                {sampled.days.map(day => (
                  <div className={styles.barGroup} key={day.date}>
                    <span className={styles.barCount}>{day.count}</span>
                    <div className={styles.bar} style={{ height: `${Math.max(3, day.count / max * 112)}px` }} />
                  </div>
                ))}
              </div>
              <div className={styles.chartLabel}>
                {sampled.days.map(day => <span key={day.date}>{day.date.slice(5)}</span>)}
              </div>
            </article>
            <article className={styles.panel}>
              <h2 className={styles.panelTitle}>{zh ? "样本订单金额 · 按币种" : "Sample gross totals · per currency"}</h2>
              {sampled.currencies.length ? sampled.currencies.map(value => (
                <div key={value.currency} className={styles.money}>{fmtMoney(value.amount, value.currency)}</div>
              )) : <p className={styles.footer}>{zh ? "尚无订单样本" : "No orders in the sample"}</p>}
              <p className={styles.footer}>
                {zh ? "金额未经退款和折扣后调整；不跨币种汇总。完整财务分析请使用运营数据中心。" :
                  "Gross sample amounts, not net sales or refund-adjusted revenue; currencies are separate."}
              </p>
            </article>
          </section>
        </>
      )}
      <p className={styles.footer}>
        {zh ? "官方 Saleor Pulse 如已安装，会继续通过原生首页扩展显示；当前页面由自建 Saleor GraphQL 提供真实数据。" :
          "The official Saleor Pulse, if installed, remains available through its native home extension."}
      </p>
    </Box>
  );
};
