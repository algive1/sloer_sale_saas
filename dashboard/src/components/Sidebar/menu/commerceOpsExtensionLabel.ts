import { commerceOpsNavigation } from "./commerceOpsNavigation";

/** Translate only this same-origin system App; other Apps own their labels. */
export function commerceOpsExtensionLabel({
  appUrl,
  extensionUrl,
  dashboardOrigin,
  locale,
}: {
  appUrl: string | null | undefined;
  extensionUrl: string;
  dashboardOrigin: string;
  locale: string;
}): string | null {
  if (!appUrl) return null;

  try {
    const app = new URL(appUrl);

    if (app.username || app.password || app.search || app.hash) return null;

    if (app.origin !== dashboardOrigin || app.pathname.replace(/\/$/, "") !== "/commerce-admin") {
      return null;
    }

    const extension = new URL(extensionUrl, app.origin);

    if (extension.origin !== app.origin || extension.pathname !== "/app") return null;

    const entry = commerceOpsNavigation.find(
      item => item.path === extension.searchParams.get("path"),
    );

    return entry ? (locale.toLowerCase().startsWith("zh") ? entry.zh : entry.en) : null;
  } catch {
    return null;
  }
}
