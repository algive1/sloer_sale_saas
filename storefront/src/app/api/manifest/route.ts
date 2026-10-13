import { createManifestHandler } from "@saleor/app-sdk/handlers/next-app-router";
import { createCommerceOpsManifest } from "@/lib/ops/saleor-app-manifest";

export const GET = createManifestHandler({
	manifestFactory: () => createCommerceOpsManifest(),
});
