# Legacy Admin Workflow Migration

Phase 5 starts the migration of high-value admin workflows away from legacy CSS-module action and modal patterns.

## Completed In This Pass

- Added `FormSection` and `FieldGrid` shared layout primitives.
- Migrated `ProductQuoteConfigForm.js` off `admin-content.module.css`.
- Replaced `ProductQuoteConfigForm.js` field cards, field grids, inputs, textareas, and save action with shared UI primitives.
- Replaced `ProductEditorForm.js` pricing-row `AdminBulkDeleteButton`, `AdminActionDropdown`, and `AdminConfirmDeleteAction` with `BulkActionBar` and `TextAction`.
- Replaced `ProductEditorForm.js` custom section-edit and media-picker modal backdrops with shared `Modal`.
- Replaced `ProductEditorForm.js` top Back/Save actions with shared `Button`.
- Replaced the remaining `QuoteEditor.js` `AdminActionDropdown` use with `ActionMenu`.
- Deleted `app/admin/_components/AdminActionDropdown.js`.

## Current State

- `ProductQuoteConfigForm.js` no longer depends on the legacy admin stylesheet.
- `ProductEditorForm.js` still depends on `admin-content.module.css` and `product-editor.module.css` for the bespoke preview/editor canvas.
- `QuoteEditor.js` still depends on legacy quote/admin styles and contains several local action/modal patterns.
- `AdminTablePagination.js` still exists because `QuoteEditor.js` imports it for attachments pagination.

## UX Risks To Watch

- Product editor modals now inherit the shared modal header/body/footer spacing. This improves consistency but may need visual QA because the editor content was originally styled for a custom panel.
- Pricing-row delete is immediate inside the unsaved pricing editor. This is acceptable only because the user still needs to save the product section for persistence; use `ConfirmModal` if pricing-row removal becomes immediately persisted.
- The product editor remains desktop-only. That existing behavior was preserved.

## Next Migration Targets

1. Continue decomposing `ProductEditorForm.js` section content into shared `FormSection`, `Input`, `Textarea`, `Button`, and `StatusPill` patterns.
2. Migrate `QuoteEditor.js` line actions and attachment delete confirmation to `ActionMenu`, `TextAction`, and `ConfirmModal`.
3. Replace `AdminTablePagination.js` with `AdminPagination` after the attachments table is migrated.
4. Remove unused product editor handlers once the preview/media workflows are verified.
