import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { createOpsI18n } from "./i18n";
import { OPS_LOCALE_HEADER, resolveOpsUiLocale } from "./locale";

export const getOpsI18n = cache(async () => {
	const requestHeaders = await headers();
	return createOpsI18n(
		resolveOpsUiLocale(requestHeaders.get(OPS_LOCALE_HEADER), requestHeaders.get("accept-language")),
	);
});
