# Modal and Sheet Consolidation

Phase 4 standardises modal behavior while preserving deliberate public/design styling where needed.

## Standard Modal Family

- `Modal`: shared Radix-backed dialog for admin and reusable public wrappers.
- `ConfirmModal`: destructive or decision confirmations.
- `PortalModal`: public-facing compatibility wrapper that now delegates behavior to `Modal`.

## Shared Behavior Now Expected

- Escape closes the modal through one mechanism.
- Focus is trapped and restored by Radix Dialog.
- Background interaction is blocked by the shared overlay.
- Form/edit modals use `layout="form"` and become full-screen on mobile.
- Compact action/confirm modals use `layout="sheet"` or legacy `contentFit`.

## Phase 4 Changes

- Added explicit `layout="form" | "sheet"` to `Modal` while keeping `contentFit` backward-compatible.
- Converted `components/PortalModal.tsx` to wrap `Modal` instead of implementing its own dialog mechanics.
- Public product filters, product lightbox, quote attachment modal, and launch enquiry modal now share modal mechanics through `PortalModal`.

## Exceptions To Keep For Now

- Design tool modals can remain custom until a dedicated design-tool accessibility pass. They are canvas/workspace-specific and use different mobile interaction patterns.
- `ColourPickerModal` is shared across public/admin/design color workflows and should be migrated only after image/color-picker behavior is separately specified.
- Large editor modals in `QuoteEditor.js`, `ProductEditorForm.js`, and `ColourLibraryManager.tsx` need targeted migration because they mix data entry, custom tables, portals, and legacy styles.

## Remaining Risks

- Some public modal visuals may subtly shift because the shared wrapper now owns header/footer placement.
- `PortalModal.module.css` still contains older overlay/dialog classes for compatibility and should be pruned after visual QA.
- Custom launch/design/quote modal CSS remains in the codebase even where no longer used by the migrated wrapper.
