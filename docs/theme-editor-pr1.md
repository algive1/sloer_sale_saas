# Theme Editor — PR 1 operator experience

## Scope

This increment **does not** replace Puck or create a new page system. It upgrades the existing homepage editor:
- Brand/Channel-scoped product and collection search with thumbnails; no manual Slug required in normal operations.
- A selected-product spotlight module, rendered by Next server components using live Saleor catalog data and an in-site product detail URL.
- Upload JPG/PNG/WebP up to 5 MB through Saleor's existing authenticated `fileUpload` GraphQL mutation, or choose a photo already attached to a channel-published product.
- Existing homepage JSON documents, drafts, concurrency checks, publish and locale/brand selectors remain intact.

The storefront does not run the operator catalog picker or upload route. Those only exist under protected `/ops/themes/*` URLs.

## Configuration

Image upload requires the server-only `SALEOR_APP_TOKEN` and a publicly usable HTTPS URL returned by Saleor's media storage. The app token must never be prefixed with `NEXT_PUBLIC_`. In HTTP-only development environments, media uploads may fail the HTTPS validation; existing product photos can still be selected.

The uploader validates the file signature and filename extension and rejects SVG/HTML. File storage and delivery are handled by Saleor; this PR does not add a separate media service.

The selector only fetches items from the chosen Saleor Channel. Ensure operations Basic auth / operator RBAC and trusted Host rewriting remain enabled at the reverse proxy. A Saleor App media upload is global: platform-wide media ownership rules and independent per-brand galleries are still future enhancements.

## Test and release gate

Run `cd storefront && pnpm verify`; then manually test:
1. Select brand A, choose an existing collection by name, save and publish, check storefront.
2. Add the selected-product block, select a Saleor product and verify the price and product detail link.
3. Upload allowed images and reject HTML/SVG, spoofed image types, large files and requests without operations credentials.
4. Repeat on brand B to verify no products from A appear in B's selector.
5. Verify desktop/mobile Puck preview, draft protection, revisions and no changes to checkout.

No AI model, credentials, chatbot, or code execution is introduced. The persisted typed Puck document and stable per-block IDs are the intended extension point for later AI-generated drafts / module edits. PDP, collection and landing page authoring are separate upcoming PRs.
