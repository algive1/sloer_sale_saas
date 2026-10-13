"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { createOpsI18n } from "./i18n";
import { resolveOpsUiLocale } from "./locale";

export function useOpsI18n() {
	const locale = resolveOpsUiLocale(useLocale());
	return useMemo(() => createOpsI18n(locale), [locale]);
}
