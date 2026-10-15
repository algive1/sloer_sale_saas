const opsPagePathPatterns = [
  /^\/ops\/analytics(?:\/(?:realtime|traffic|checkout|products|destinations|reminders))?\/?(?:\?pageType=product)?$/,
  /^\/ops\/sites(?:\/[A-Za-z0-9_-]+(?:\/(?:insights|catalog|fulfillment|realtime|readiness|tracking))?)?\/?(?:\?[^#]*)?$/,
  /^\/ops\/themes\/?(?:\?pageType=product)?$/,
  /^\/ops\/support(?:\/settings)?\/?$/,
  /^\/ops\/merchant\/?$/,
  /^\/ops\/plugins\/?$/,
  /^\/ops\/settings\/?$/,
  /^\/ops\/translations\/?$/,
];

export function isCommerceOpsPagePath(path: string | null): path is `/ops${string}` {
  return Boolean(path && opsPagePathPatterns.some(pattern => pattern.test(path)));
}
