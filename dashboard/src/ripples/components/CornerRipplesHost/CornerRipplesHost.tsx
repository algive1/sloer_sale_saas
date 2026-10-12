import { IS_CLOUD_INSTANCE } from "@dashboard/config";
import { allCornerRipples } from "@dashboard/ripples/cornerRipples/allCornerRipples";
import { selectActiveCornerRipple } from "@dashboard/ripples/cornerRipples/selectActiveCornerRipple";
import { useRippleStorage } from "@dashboard/ripples/hooks/useRipplesStorage";

/**
 * Mounts at most one corner video announcement. Queued (not-yet-active) entries
 * stay unmounted so their TTL does not start until they become visible.
 */
export const CornerRipplesHost = (): JSX.Element | null => {
  const { getShouldShow } = useRippleStorage();
  const active = selectActiveCornerRipple(allCornerRipples, getShouldShow);

  // On self-hosted installations we show real local commerce figures on Home.
  // Do not cover business navigation with a Cloud-only Pulse sales video.
  if (!IS_CLOUD_INSTANCE || !active) {
    return null;
  }

  const { Component, model } = active;

  return <Component key={model.ID} model={model} />;
};
