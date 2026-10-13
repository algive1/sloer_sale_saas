import { createTranslator } from "next-intl";
import en from "../../../messages/ops/en.json";
import zh from "../../../messages/ops/zh.json";
import type { OpsLocale } from "./locale";

const sourceKeys = new Map(
	[...Object.entries(en), ...Object.entries(zh)].map(([key, source]) => [source, key]),
);
// Legacy service diagnostics are already interpolated. Match only declared
// message templates; captured SKUs/channel names remain unmodified data.
const templates = Object.entries(zh).flatMap(([key, source]) => {
	const names = [...source.matchAll(/\{(v\d+)\}/g)].map((match) => match[1]);
	if (!names.length) return [];
	const pattern = source
		.split(/\{v\d+\}/g)
		.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
		.join("(.+?)");
	return [{ key, names, pattern: new RegExp(`^${pattern}$`, "u") }];
});
export type OpsTranslator = (source: string, values?: Record<string, string | number>) => string;
export type OpsI18n = { locale: OpsLocale; t: OpsTranslator };

export function createOpsI18n(locale: OpsLocale): OpsI18n {
	const messages: Record<string, string> = locale === "zh" ? zh : en;
	const translate = createTranslator({ locale, messages });
	return {
		locale,
		t: (source, values) => {
			const key = sourceKeys.get(source);
			if (key) return translate(key, values);
			if (locale === "en") {
				for (const template of templates) {
					const match = template.pattern.exec(source);
					if (match)
						return translate(
							template.key,
							Object.fromEntries(template.names.map((name, index) => [name, match[index + 1]])),
						);
				}
			}
			return source;
		},
	};
}
