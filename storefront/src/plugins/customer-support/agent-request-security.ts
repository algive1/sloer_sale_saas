/** A Chatwoot agent API token is a powerful privileged credential.
 * Basic Auth auto-attaches to requests; mutations need an explicit
 * same-origin browser request with a non-simple custom header. */
export function isTrustedAgentMutation(input: {
  origin: string | null;
  requestUrl: string;
  fetchSite: string | null;
  actionHeader: string | null;
}): boolean {
  try {
    return Boolean(
      input.origin &&
      input.origin === new URL(input.requestUrl).origin &&
      (!input.fetchSite || input.fetchSite === "same-origin") &&
      input.actionHeader === "conversation"
    );
  } catch { return false; }
}
