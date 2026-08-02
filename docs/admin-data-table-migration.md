# Admin Data Table Migration

Phase 2 standardises recurring admin list screens around `AdminDataTable`.

## Use This Component For

- Admin index screens with searchable, paginated records.
- Lists that need desktop tables and mobile cards.
- Screens with row selection, bulk delete, status pills, and row text actions.
- Loading and empty states inside the same list shell.

## Component Contract

`AdminDataTable` owns the common list structure:

- desktop table shell, header row, checkbox selection, loading rows, empty state
- mobile search/action toolbar, loading cards, empty state, pagination placement
- search input styling and icon treatment
- page-level selected-row mechanics through `selectedIds` and `onSelectedIdsChange`

The caller still owns business-specific content:

- `columns`
- `mobileCard`
- `primaryAction`
- `bulkActions`
- `pagination`
- API calls and mutation state

This keeps the responsive layout consistent without forcing every record type into the same mobile information hierarchy.

## Required Adjacent Components

- `AdminPageHeader` for admin list headings.
- `StatusPill` for boolean or workflow statuses.
- `TextAction` for inline row actions such as edit/delete.
- `BulkActionBar` for selected-row actions. Use `variant="inline"` inside `AdminDataTable` toolbars.
- `AdminPagination` for paginated admin lists.
- `ConfirmModal` before destructive single or bulk delete actions.

## Migration Order

1. Replace local page title markup with `AdminPageHeader`.
2. Move table headers and cells into `AdminDataTableColumn<T>[]`.
3. Move the mobile card body into a `mobileCard` renderer.
4. Replace local search inputs, desktop table, mobile toolbar, mobile cards, loading, and empty states with `AdminDataTable`.
5. Replace custom row action buttons with `TextAction`.
6. Replace custom status badges with `StatusPill`.
7. Replace immediate destructive actions with `ConfirmModal`.
8. Run `npm.cmd run build` and check for stale imports or removed helper functions.

## UX Risks To Decide Per Screen

- Destructive actions now require confirmation. This is safer, but adds one click to deletion workflows.
- Mobile card content must be intentionally ranked per record type. Do not mirror every desktop column if it makes the card hard to scan.
- Bulk selection currently applies to visible page rows, not all filtered records across all pages. If a screen needs "select all results", that should be designed as a separate explicit pattern.
- `AdminDataTable` does not yet own sorting or column visibility. Add those at the component level only when at least two migrated screens need them.
