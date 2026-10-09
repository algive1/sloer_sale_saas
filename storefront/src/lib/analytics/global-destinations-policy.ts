/**
 * Global merchant tags are single-brand configuration.
 * Never emit to one merchant's Meta/TikTok/Google destination from all domains
 * in a shared multi-brand deployment. A future per-site registry can replace
 * this safety gate with verified, site-selected destinations.
 */
export function globalMerchantTagsAllowed(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.dataset.multibrand !== "true";
}
