# PCD UI System Rules

Date: 2026-08-02

These rules define Phase 1 defaults for building new UI and migrating existing UI.

## Scope

The shared `components/ui` layer is admin-first. Public-facing pages may use separate public components where the brand treatment needs to differ, but they should still share accessibility, focus, modal, and responsive behavior.

## Tokens

Use the PCD admin palette for admin shared components:

| Purpose | Value |
|---|---|
| Page background | `#faf9f6` |
| Surface | `#ffffff` |
| Soft surface | `#f5f8f4` |
| Soft accent | `#edf4eb` |
| Border | `#dbd8cc` |
| Light border | `#edf4eb` |
| Primary text | `#1a1a18` |
| Secondary text | `#5a5a52` |
| Muted text | `#8b8a81` |
| Primary green | `#1c2b1e` |
| Accent green | `#6b9e61` |
| Accent dark | `#2d5e28` |
| Danger | `#b42318` |
| Warning | `#dcbf55` |
| Success | `#16a34a` |

Do not introduce teal/slate-era colors in admin components unless there is a deliberate domain reason.

## Typography

Admin UI should use the compact operational scale:

| Use | Class |
|---|---|
| Page title | `text-[20px] font-bold` |
| Section/card title | `text-[15px] font-semibold` |
| Body/table text | `text-[13px]` |
| Form input text | `text-[14px]`, or `text-[16px]` on mobile-specific form controls where iOS zoom is a risk |
| Secondary/meta text | `text-[12px]` |
| Table headers/labels | `text-[11px] font-semibold uppercase tracking-[0.06em]` |

## Buttons

Use `Button` for all full button CTAs.

Use `IconButton` for square icon-only controls. Icon-only controls must have an accessible label.

Use `TextAction` for inline table/card actions such as Open, Edit, Preview, Duplicate, Delete.

Avoid raw styled `<button>` for reusable UI patterns. Raw buttons are acceptable inside shared components or for one-off semantic wrappers that are not visually styled.

## Destructive Actions

Destructive actions must use a confirmation step unless the action is reversible and clearly scoped.

Default pattern:

1. Row/table action uses `TextAction variant="danger"`.
2. Confirmation uses `ConfirmModal`.
3. Bulk delete uses `BulkActionBar` plus `ConfirmModal`.

Do not mix immediate delete, inline confirm text, and modal confirmation within the same section.

## Tables

Admin entity lists should use the shared table pattern:

- Desktop table.
- Mobile card renderer.
- Consistent empty/loading states.
- `AdminPagination`.
- Shared row action pattern.
- Shared bulk action pattern.

Until `AdminDataTable` exists, new list pages should follow `CustomersManager.tsx`.

## Modals and Sheets

Use `Modal` and `ConfirmModal` for admin dialogs.

Mobile behavior:

- Form/edit modals: full-screen.
- Compact confirmations/actions: bottom sheet via `contentFit`.
- Footer actions stack on mobile and align right on desktop.

Custom portal modals must be justified by a visual preview or specialised canvas workflow.

## Menus and Dropdowns

Use `Dropdown` for simple single/multi-select menus.

Use a dedicated image-option picker for colors, profiles, edges, and any option that needs a thumbnail.

Use one row action menu pattern where a menu is necessary. Prefer visible `TextAction` controls for common table actions.

## Mobile Rules

- Primary mobile touch targets should be at least 40px high, with 44px preferred for nav and modal close controls.
- Forms should avoid input font sizes below 16px where iOS zoom is likely.
- Every admin desktop table must have a mobile card strategy unless it is a specialist dense comparison table.
- Do not rely on global `overflow-x` clipping to hide layout problems.

## Accessibility Rules

- Icon-only controls require `aria-label`.
- Dropdown/listbox options require `aria-selected`.
- Combobox triggers require `aria-expanded` and `aria-controls`.
- Modal-like overlays must trap focus, restore focus on close, and lock background scroll unless explicitly documented.
- Internal links in Next pages should use `Link` unless there is a deliberate browser-navigation reason.
