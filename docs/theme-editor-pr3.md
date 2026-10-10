# Theme editor PR 3 — operator starter layouts and saved-template library

This change extends the existing Puck editor without changing the Saleor
commerce model, draft/publish database schema, or AI integration scope.

## What changes

- New fashion, jewelry and minimal layouts with editor-ready Hero, Collection,
  Product, Editorial, Story blocks. Existing homepage drafts stay unchanged.
- Native, accessible FAQ section (existing `FaqSection` on public SSR);
  only 3 FAQ entries are editable initially, so the component remains simple.
- A template dropdown and an operator-owned saved-template panel inside Puck:
  save current draft as template, list templates, apply to current unsaved
  page, and delete. Applying a template never auto-publishes.
- Same-brand isolation: saved templates are keyed by site ID, Saleor Channel,
  locale and page type. A new libSQL table avoids rewriting existing homepage
  and PDP templates; a scope can hold at most 40 snapshots.
- The Puck page document remains validated by one allowlisted data validator,
  including restrictions for product detail pages (no homepage hero or
  transaction controls). Template data is never evaluated as executable code.

## Design intent for future AI extension

Future AI-generated content is submitted as *proposed Puck page documents* or
targeted component patches. It must pass the same validation and be applied
to the draft in the editor; publishing still requires explicit merchant action.
There is **no AI service, key, or model SDK** in this PR.

## Scope / follow-up

Built-in designs are textual layout presets; media and products are selected via
the existing Saleor picker. This increment does not ship shoppable videos,
review management, product-specific template assignments, or global media
rights workflow. Further module coverage remains planned.

## Checks

- Puck and server-rendered FAQ use the exact same persisted fields.
- Saving a template creates a new immutable snapshot, not a published layout.
- Applying a saved template marks the current page dirty and requires a separate
  draft save / publish action.
- Templates are visible only for their brand/channel/locale/page type.
- Delete affects the template library, not the current draft or published page.
- Validate full-stack CI and Chromium end-to-end tests before merging.
