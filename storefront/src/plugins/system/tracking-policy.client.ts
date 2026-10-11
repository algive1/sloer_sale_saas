"use client";

/** Public booleans supplied by the request-time server slot; never deployment secrets. */
export type ClientTrackingPolicy = Readonly<{ collectAnalytics: boolean; trackAds: boolean }>;
let policy: ClientTrackingPolicy | null = null;
const pending: Array<(policy: ClientTrackingPolicy) => void> = [];
const MAX_PENDING = 100;

export function clientAnalyticsActive(): boolean { return policy?.collectAnalytics === true; }
export function clientAdsActive(): boolean { return policy?.trackAds === true; }

/** Wait for the server policy rather than enabling destinations during hydration. */
export function withClientTrackingPolicy(run: (policy: ClientTrackingPolicy) => void): void {
  if (typeof window === "undefined") return;
  if (policy) run(policy);
  else if (pending.length < MAX_PENDING) pending.push(run);
}

export function configureClientTrackingPolicy(next: ClientTrackingPolicy | null, initialize?: () => void): void {
  policy = next;
  if (!next) { pending.length = 0; return; }
  // Establish consent/first-touch before replaying early component events.
  initialize?.();
  for (const run of pending.splice(0)) run(next);
}
