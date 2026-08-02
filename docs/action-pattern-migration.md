# Action Pattern Migration

Phase 3 standardises admin actions so users see the same hierarchy everywhere.

## Standard Components

- `Button`: full CTA buttons such as Add, Save, Create, Convert, Send.
- `TextAction`: inline row/card actions such as Open, Edit, Preview, Duplicate, Delete.
- `IconButton`: icon-only controls with a required label.
- `ActionMenu`: overflow row actions when visible text actions would crowd the row.
- `BulkActionBar`: selected-row actions.
- `ConfirmModal`: destructive confirmation.

## Rules

1. Destructive actions use `ConfirmModal`; do not use inline "Confirm delete" or browser `window.confirm`.
2. Bulk destructive actions use `BulkActionBar` first, then `ConfirmModal`.
3. Row-level common actions should be visible `TextAction` controls.
4. Use `ActionMenu` only when there are too many row actions or the table is dense.
5. Raw styled `<button>` should stay inside shared components or one-off semantic controls only.

## Phase 3 Decisions

- Product and quote deletes now require modal confirmation.
- Project row actions now use `ActionMenu` instead of `AdminActionDropdown`.
- Product and quote list headers, status pills, filter pills, and primary actions now use shared components where practical without changing table layout.

## Remaining Work

- `AdminActionDropdown.js` has been removed after migrating project, product-editor, and quote-editor consumers.
- Several legacy areas still use browser `window.confirm`, especially hardware, benchtop materials, and design project deletion.
