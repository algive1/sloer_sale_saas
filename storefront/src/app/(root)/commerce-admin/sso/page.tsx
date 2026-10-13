import { Suspense } from "react";
import { SaleorOpsSsoBridge } from "./sso-bridge";

export default function CommerceAdminSsoPage() {
	return (
		<Suspense fallback={<div className="grid min-h-dvh place-items-center bg-background text-foreground" aria-busy="true" />}>
			<SaleorOpsSsoBridge />
		</Suspense>
	);
}
