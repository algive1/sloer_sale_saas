import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { CurrentUserOrdersPaginatedDocument, CurrentBrandOrdersPaginatedDocument } from "@/gql/graphql";
import { brandSitesConfigured } from "@/config/brand-sites";
import { currentBrandOrderFilter } from "@/lib/brand/customer-orders.server";
import { executeAuthenticatedGraphQL } from "@/lib/graphql";
import { hasAuthSession } from "@/lib/auth/has-auth-session";
import { graphqlLanguageCodeVariables } from "@/lib/graphql-locale";
import { OrderRow } from "@/ui/components/account/order-row";
import { buildOrderRowLabels } from "@/ui/components/account/order-row-labels";
import { LinkWithChannel } from "@/ui/atoms/link-with-channel";
import { Button } from "@/ui/components/ui/button";
import { accountRoutes } from "@/ui/components/account/routes";
import { AccountOrdersListSkeleton } from "@/ui/components/account/account-skeleton";

const ORDERS_PER_PAGE = 10;

type Props = {
	params: Promise<{ locale: string }>;
	searchParams: Promise<{ after?: string }>;
};

export default function AccountOrdersPage({ params, searchParams }: Props) {
	return (
		<Suspense fallback={<AccountOrdersListSkeleton />}>
			<AccountOrdersContent params={params} searchParams={searchParams} />
		</Suspense>
	);
}

async function AccountOrdersContent({ params, searchParams }: Props) {
	const [{ locale }, { after }] = await Promise.all([params, searchParams]);
	const t = await getTranslations({ locale, namespace: "account.orders" });
	const tErrors = await getTranslations({ locale, namespace: "account.errors" });
	const tOrder = await getTranslations({ locale, namespace: "account" });
	const tStatus = await getTranslations({ locale, namespace: "account.orderStatus" });

	if (!(await hasAuthSession())) {
		return <AccountOrdersError title={t("title")} message={t("signInRequired")} />;
	}

  const brandWhere = brandSitesConfigured() ? await currentBrandOrderFilter() : null;
  if (brandSitesConfigured() && !brandWhere) {
    return <AccountOrdersError title={t("title")} message={tErrors("loadOrdersFailed")} />;
  }
  const variables = { first: ORDERS_PER_PAGE, after: after || null, ...graphqlLanguageCodeVariables(locale) };
  const result = brandWhere
    ? await executeAuthenticatedGraphQL(CurrentBrandOrdersPaginatedDocument, {
        variables: { ...variables, where: brandWhere }, cache: "no-cache",
      })
    : await executeAuthenticatedGraphQL(CurrentUserOrdersPaginatedDocument, {
        variables, cache: "no-cache",
      });

	if (!result.ok) {
		return <AccountOrdersError title={t("title")} message={tErrors("loadOrdersFailed")} />;
	}

	if (!result.data.me) {
		return <AccountOrdersError title={t("title")} message={t("signInRequired")} />;
	}

	const ordersConnection = result.data.me.orders;
	const orders = ordersConnection?.edges ?? [];
	const pageInfo = ordersConnection?.pageInfo;
	const totalCount = ordersConnection?.totalCount ?? 0;

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-balance text-h1">{t("title")}</h1>
				<p className="mt-1 text-sm text-muted-foreground">{t("count", { count: totalCount })}</p>
			</div>

			{orders.length === 0 ? (
				<div className="rounded-lg border border-dashed p-8 text-center">
					<p className="text-muted-foreground">{t("empty")}</p>
				</div>
			) : (
				<>
					<div className="space-y-2">
						{orders.map(({ node: order }) => (
							<OrderRow
								key={order.id}
								order={order}
								localeSlug={locale}
								labels={buildOrderRowLabels(tOrder, tStatus, order)}
							/>
						))}
					</div>

					{pageInfo?.hasNextPage && pageInfo.endCursor && (
						<div className="flex justify-center pt-2">
							<LinkWithChannel href={`${accountRoutes.orders}?after=${pageInfo.endCursor}`}>
								<Button variant="outline-solid">{t("loadMore")}</Button>
							</LinkWithChannel>
						</div>
					)}
				</>
			)}
		</div>
	);
}

function AccountOrdersError({ title, message }: { title: string; message: string }) {
	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-balance text-h1">{title}</h1>
			</div>
			<div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
				{message}
			</div>
		</div>
	);
}
