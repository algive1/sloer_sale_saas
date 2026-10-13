import { type PermissionEnum } from "@dashboard/graphql";
import { type Sprinkles } from "@saleor/macaw-ui-next";
import { type ReactNode } from "react";

export interface SidebarMenuItem {
  label?: string | ReactNode;
  id: string;
  url?: string;
  /** External Commerce Ops destination (never passed to React Router). */
  externalUrl?: string;
  /** Direct destination for main group label; chevron remains expandable. */
  primaryExternalUrl?: string;
  /** Internal destination for a primary group label. */
  primaryUrl?: string;
  /** Use exact pathname matching only for summary routes with child pages. */
  exactMatch?: boolean;
  matchUrls?: string[];
  permissions?: PermissionEnum[];
  type: "item" | "itemGroup" | "divider";
  icon?: ReactNode;
  onClick?: () => void;
  children?: SidebarMenuItem[];
  paddingY?: Sprinkles["paddingY"];
  endAdornment?: ReactNode;
  separatorBefore?: boolean;
  labelStyle?: "default" | "settings";
  /** Expand this group on mount even when nothing inside it is active. */
  defaultExpanded?: boolean;
}
