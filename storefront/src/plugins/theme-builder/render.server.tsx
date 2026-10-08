import "server-only";
import { Render } from "@puckeditor/core";
import { createPublishedThemeConfig } from "./config.server";
import type { ThemeData } from "./template";

/** Loaded only for an existing published theme. */
export function PublishedThemeHomepage({ channel, locale, data }: {
  channel: string;
  locale: string;
  data: ThemeData;
}) {
  return <Render config={createPublishedThemeConfig(channel, locale)} data={data} />;
}
