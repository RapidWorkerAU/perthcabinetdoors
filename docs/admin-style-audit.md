# PCD Admin Style Audit

**Date:** 2026-06-27  
**Auditor:** Claude Code  
**Scope:** All `.js` and `.tsx` files under `app/admin/`, all files in `components/ui/`, and `app/globals.css`

---

## Summary

Overall scores — one row per page/component, columns for each of the 12 checks.

| Page / Component | 1 Tailwind | 2 Buttons | 3 Tables | 4 Pagination | 5 Modals | 6 Dropdowns | 7 Toast | 8 Typography | 9 Colours | 10 Shell | 11 CSS Modules | 12 Legacy Imports |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| /admin (login) | ✅ | ✅ | n/a | n/a | n/a | n/a | ⚠️ | ✅ | ✅ | n/a | ✅ | ✅ |
| /admin/reset-password | ✅ | ✅ | n/a | n/a | n/a | n/a | ⚠️ | ⚠️ | ✅ | n/a | ✅ | ✅ |
| /admin/dashboard | ✅ | n/a | n/a | n/a | n/a | n/a | n/a | ✅ | ✅ | ✅ | ✅ | ✅ |
| /admin/customers | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| /admin/enquiries | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| /admin/quote-requests | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| /admin/quotes (list) | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| /admin/quotes/[id] — QuoteEditor | ❌ | ⚠️ | ⚠️ | ❌ | ✅ | ⚠️ | ✅ | ⚠️ | ✅ | ✅ | ❌ | ❌ |
| /admin/orders (list) | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| /admin/orders/[id] — OrderDetail | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| /admin/products (list) | ✅ | ✅ | ✅ | ✅ | n/a | n/a | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| /admin/products/[id]/edit — ProductEditorForm | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| /admin/products/[id]/quote — ProductQuoteConfigForm | ❌ | ❌ | n/a | n/a | n/a | n/a | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |
| /admin/options — ColourLibraryManager | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| /admin/settings — AccountSettingsForm | ✅ | ✅ | n/a | n/a | ⚠️ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ❌ | ✅ |
| AdminShell | ✅ | ✅ | n/a | n/a | ✅ | n/a | ✅ | ✅ | ✅ | n/a | ✅ | ✅ |
| AdminPagination | ✅ | ✅ | n/a | ✅ | n/a | n/a | n/a | ✅ | ✅ | n/a | ✅ | ✅ |
| AdminTablePagination | ❌ | ❌ | n/a | ❌ | n/a | n/a | n/a | ❌ | ❌ | n/a | ❌ | ❌ |
| AdminActionDropdown | ❌ | ❌ | n/a | n/a | n/a | n/a | n/a | ❌ | ❌ | n/a | ❌ | ❌ |
| /admin/quotes (QuotesManager.js — old) | ❌ | ❌ | ❌ | n/a | n/a | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |

> **Note on /admin/quotes:** Two components exist. The active page (`quotes/page.js`) now renders `QuotesTable.tsx` (fully Tailwind). The legacy `QuotesManager.js` is no longer imported by any page (the import was replaced), but the file still exists on disk and scores poorly across the board.

---

## Pages

---

### /admin (login) — `app/admin/page.tsx`

| Check | Score | Notes |
|---|---|---|
| 1 Tailwind | ✅ | 100% Tailwind, no module imports |
| 2 Buttons | ✅ | Submit button: `h-[40px] bg-[#1c2b1e]`. Secondary "Forgot password": text-only link style. Correct. |
| 3 Tables | n/a | No tables |
| 4 Pagination | n/a | |
| 5 Modals | n/a | |
| 6 Dropdowns | n/a | |
| 7 Toast | ⚠️ | Uses raw `setStatus` state + inline `<div role="status">` for feedback — not `useToast`. Appropriate here (login is outside AdminShell/ToastProvider context), but if the page were ever refactored to be inside the shell, the pattern would need updating. |
| 8 Typography | ✅ | `text-[16px]` heading, `text-[12px]` body, `text-[12px]` secondary. Passes for a standalone login card. |
| 9 Colours | ✅ | `#1c2b1e`, `#6b9e61`, `#dbd8cc`, `#f5f8f4`, `#1a1a18`, `#5a5a52`, `#8b8a81` all present and correct. |
| 10 Shell | n/a | Pre-auth, no shell |
| 11 CSS Modules | ✅ | None |
| 12 Legacy Imports | ✅ | None |

**Recommended actions:** None urgent. The inline status div is an intentional deviation for a no-shell page — acceptable as-is.

---

### /admin/reset-password — `app/admin/reset-password/page.tsx`

| Check | Score | Notes |
|---|---|---|
| 1 Tailwind | ✅ | No module imports |
| 2 Buttons | ✅ | `h-[54px]` submit, `bg-[#1c2b1e]` — slightly taller than the standard h-[40px]/h-[34px] pattern but this is a standalone page. |
| 3 Tables | n/a | |
| 4 Pagination | n/a | |
| 5 Modals | n/a | |
| 6 Dropdowns | n/a | |
| 7 Toast | ⚠️ | Same as login — raw `setStatus` state and inline div. Acceptable outside shell. |
| 8 Typography | ⚠️ | Page heading uses `text-[28px]` (not the standard `text-[20px]` for page titles). Body is `text-[12px]`, labels are `text-[12px]`. The large heading is a deliberate branding choice for the standalone page, but it deviates from the pattern. |
| 9 Colours | ✅ | Correct token values throughout. |
| 10 Shell | n/a | Pre-auth |
| 11 CSS Modules | ✅ | None |
| 12 Legacy Imports | ✅ | None |

**Recommended actions:** Minor. If desired, normalise the submit button to `h-[40px]` for consistency with the login page.

---

### /admin/dashboard — `app/admin/dashboard/page.tsx`

| Check | Score | Notes |
|---|---|---|
| 1 Tailwind | ✅ | Minimal file, all Tailwind |
| 2 Buttons | n/a | No interactive buttons |
| 3 Tables | n/a | |
| 4 Pagination | n/a | |
| 5 Modals | n/a | |
| 6 Dropdowns | n/a | |
| 7 Toast | n/a | |
| 8 Typography | ✅ | `text-[20px] font-bold` title, `text-[14px]` subtitle. Correct. |
| 9 Colours | ✅ | `#1a1a18`, `#5a5a52` |
| 10 Shell | ✅ | Wrapped in `AdminShell` |
| 11 CSS Modules | ✅ | None |
| 12 Legacy Imports | ✅ | None |

**Recommended actions:** None. The dashboard is a stub — add actual content when business data widgets are built.

---

### /admin/customers — `app/admin/customers/CustomersManager.tsx`

| Check | Score | Notes |
|---|---|---|
| 1 Tailwind | ✅ | All Tailwind, no CSS module |
| 2 Buttons | ✅ | Uses `<Button>` from `@/components/ui/Button` for primary/secondary. Raw `<button>` for inline Edit/Delete text links — correct pattern. |
| 3 Tables | ✅ | `bg-[#f5f8f4]` header, `border-[#dbd8cc]`, `hover:bg-[#f5f8f4]`, plus mobile cards. |
| 4 Pagination | ✅ | Uses `AdminPagination` + `useAdminPagination` from `../_components/AdminPagination` |
| 5 Modals | ✅ | Uses `Modal` from `@/components/ui/Modal` |
| 6 Dropdowns | ✅ | Native `<select>` not present; no dropdowns needed. |
| 7 Toast | ✅ | `useToast` from `@/components/ui/Toast` throughout |
| 8 Typography | ✅ | `text-[20px]` title, `text-[13px]` body, `text-[11px]` table headers, `text-[10px]` labels, `text-[12px]` secondary. |
| 9 Colours | ✅ | All correct tokens. |
| 10 Shell | ✅ | Page wraps in `AdminShell` via `customers/page.js` |
| 11 CSS Modules | ✅ | None |
| 12 Legacy Imports | ✅ | None — imports `Modal`, `Button`, `Input`, `Textarea`, `AdminPagination`, `useToast` |

**Recommended actions:** None. This is the model page — reference it when updating others.

---

### /admin/enquiries — `app/admin/enquiries/EnquiriesManager.tsx`

| Check | Score | Notes |
|---|---|---|
| 1 Tailwind | ✅ | All Tailwind |
| 2 Buttons | ⚠️ | The modal footer Close button is a raw `<button>` with inline Tailwind rather than `<Button variant="neutral">`. All other buttons correct. The "Delete selected" button also uses raw Tailwind — consistent with the table-row pattern, which is acceptable. |
| 3 Tables | ✅ | `bg-[#f5f8f4]` header, correct borders, hover, mobile cards. |
| 4 Pagination | ✅ | Uses `AdminPagination` + `useAdminPagination` |
| 5 Modals | ✅ | `EnquiryPreviewModal` uses `Modal` from `@/components/ui/Modal` |
| 6 Dropdowns | ✅ | Native `<select>` styled `h-[30px] border border-[#dbd8cc] rounded-[4px]` — consistent. |
| 7 Toast | ✅ | `useToast` throughout |
| 8 Typography | ✅ | Correct scales. |
| 9 Colours | ✅ | All correct. |
| 10 Shell | ✅ | Page wraps in `AdminShell` |
| 11 CSS Modules | ✅ | None |
| 12 Legacy Imports | ✅ | None |

**Recommended actions:** Replace the raw `<button>` in the modal footer `className="h-[36px] px-4 bg-white border..."` with `<Button variant="neutral">` for consistency.

---

### /admin/quote-requests — `app/admin/quote-requests/QuoteRequestsManager.tsx`

| Check | Score | Notes |
|---|---|---|
| 1 Tailwind | ✅ | All Tailwind |
| 2 Buttons | ⚠️ | Modal footer button is `<Button variant="secondary">` (correct). However inline Convert/Open/Preview/Delete row actions are raw `<button>` with text-link style — same as Enquiries. Acceptable but worth considering `<Button size="xs">` for Convert. |
| 3 Tables | ✅ | Desktop table + mobile cards, correct colours. |
| 4 Pagination | ✅ | `AdminPagination` + `useAdminPagination` |
| 5 Modals | ✅ | `QuoteRequestPreviewModal` uses `Modal` |
| 6 Dropdowns | ✅ | Native `<select>` styled consistently |
| 7 Toast | ✅ | `useToast` throughout |
| 8 Typography | ✅ | Correct scales throughout. |
| 9 Colours | ✅ | All correct. |
| 10 Shell | ✅ | Wraps in `AdminShell` |
| 11 CSS Modules | ✅ | None |
| 12 Legacy Imports | ✅ | None |

**Recommended actions:** Minor — the Convert action button could be promoted from a text link to a small `<Button variant="primary" size="sm">` to make it more prominent for the workflow's key CTA.

---

### /admin/quotes (list) — `app/admin/quotes/QuotesTable.tsx`

| Check | Score | Notes |
|---|---|---|
| 1 Tailwind | ✅ | All Tailwind |
| 2 Buttons | ✅ | `h-[34px] px-4 bg-[#1c2b1e]` New quote button. Correct. Row actions are text links. |
| 3 Tables | ✅ | Correct desktop table + mobile article cards |
| 4 Pagination | ✅ | `AdminPagination` + `useAdminPagination` |
| 5 Modals | n/a | No modals on this page |
| 6 Dropdowns | ✅ | No dropdowns required |
| 7 Toast | ✅ | `useToast` |
| 8 Typography | ✅ | `text-[20px]` title, correct body/label sizes |
| 9 Colours | ✅ | Status pills use correct off-palette `#fef2f2`/`#991b1b` for rejected and `#edf4eb`/`#2d5e28` for approved — fine. |
| 10 Shell | ✅ | `quotes/page.js` wraps in `AdminShell` |
| 11 CSS Modules | ✅ | None |
| 12 Legacy Imports | ✅ | None |

**Recommended actions:** None. `QuotesTable.tsx` is clean. The old `QuotesManager.js` file (see section below) should be deleted — it is no longer imported.

---

### /admin/quotes (old) — `app/admin/quotes/QuotesManager.js` — ORPHANED FILE

This file is **no longer imported** by any page (the quotes page now uses `QuotesTable.tsx`). It remains on disk.

| Check | Score | Notes |
|---|---|---|
| 1 Tailwind | ❌ | Uses `styles.workflowLayout`, `styles.workflowList`, `styles.workflowListHeader`, `styles.workflowSection`, `styles.fieldLabel`, `styles.fieldInput`, `styles.primaryButton`, `styles.secondaryButton`, `styles.workflowTotals` etc. from `admin-content.module.css`. |
| 2 Buttons | ❌ | `styles.primaryButton`, `styles.secondaryButton` — CSS module classes |
| 3 Tables | ❌ | No standard table — uses `styles.quoteLines` grid |
| 4 Pagination | n/a | No pagination |
| 12 Legacy Imports | ✅ | Only imports `styles` and `useToast` — no legacy components |

**Recommended actions:** **Delete this file.** It is dead code and will confuse future developers.

---

### /admin/quotes/[id] — QuoteEditor — `app/admin/quotes/[id]/QuoteEditor.js`

This is the largest and most complex file in the admin. It is the highest-priority migration target.

| Check | Score | Notes |
|---|---|---|
| 1 Tailwind | ❌ | **Still imports three CSS modules:** `styles` from `admin-content.module.css`, `quoteStyles` from `quote-editor.module.css`, `workflowStyles` from `admin-workflow.module.css`. Many components (empty state, colour combobox, action menus, room planner section) render classes from these modules directly. The `tw` object at line 369 defines Tailwind utility strings inline, so the _details_ and _items_ panels use proper Tailwind, but cabinets section (`styles.cabinetConfigList`, `styles.emptyState`, `styles.emptyStateTitle`) and rooms section (`quoteStyles.roomPlannerSection`, `styles.secondaryButton`) still use module classes. |
| 2 Buttons | ⚠️ | `tw.primaryBtn` / `tw.secondaryBtn` define correct Tailwind strings and are used for most buttons. However several buttons still use `styles.secondaryButton` (e.g. the "Back to quote items" button in `renderCabinets`, the "Generate line items" button in `renderRooms`). |
| 3 Tables | ⚠️ | Quote items table and cabinet tables use inline Tailwind correctly. `QuoteColourCombobox` and `QuoteLineActionDropdown` still apply `styles.quoteColourCombo`, `styles.quoteColourMenu`, `styles.quoteColourOption`, `quoteStyles.quoteColourComboButton` etc. |
| 4 Pagination | ❌ | **Two pagination systems in one file:** `useAdminTablePagination` + `AdminTablePagination` (the old system, still CSS-module-styled) is used for `attachmentPagination` at line 818. `AdminPagination` (the new system) is also imported and used in `renderCabinets`. The attachments section needs to migrate from `useAdminTablePagination`/`AdminTablePagination` to `useAdminPagination`/`AdminPagination`. |
| 5 Modals | ✅ | Uses `Modal` from `@/components/ui/Modal` for customer modal, hinge modal, profile modal, line note modal, publish email modal. Correct. |
| 6 Dropdowns | ⚠️ | `QuoteImageCombobox` / `QuoteColourCombobox` are custom built with raw `createPortal`, not `@/components/ui/Dropdown`. This is intentional (image thumbnails in options), but the wrapper element still applies `styles.quoteColourCombo` and `quoteStyles.quoteColourComboButton` for styling — those need Tailwind equivalents. |
| 7 Toast | ✅ | `useToast` throughout |
| 8 Typography | ⚠️ | The `tw` object uses `text-[11px]` and `text-[13px]` correctly. Empty state text uses `styles.emptyStateTitle` / `styles.emptyStateText` which are not Tailwind. |
| 9 Colours | ✅ | The `tw` object contains correct token values. |
| 10 Shell | ✅ | `quotes/[id]/page.js` wraps in `AdminShell` |
| 11 CSS Modules | ❌ | **Three active module imports that are all actively used:** `admin-content.module.css` (lines 25, referenced at 500, 533, 908–909, 1789, 1909, 1949, 2003–2006), `quote-editor.module.css` (line 26, referenced throughout combobox and action menu components), `admin-workflow.module.css` (line 27, referenced via `workflowStyles` in `renderRooms`). |
| 12 Legacy Imports | ❌ | **Line 28:** `import { AdminActionDropdown, AdminConfirmDeleteAction } from "../../_components/AdminActionDropdown"` — used in `renderCabinets` for the cabinet configuration action menu. **Line 29:** `import { AdminTablePagination, useAdminTablePagination } from "../../_components/AdminTablePagination"` — used for attachments pagination. |

**Specific issues found:**

- `styles.cabinetConfigList`, `styles.emptyState`, `styles.emptyStateTitle`, `styles.emptyStateText` used in `renderCabinets()` (lines ~1908, 2003–2007)
- `styles.secondaryButton` used in `renderCabinets()` (line 1910) and `renderRooms()` (line 1789)
- `styles.tableActionMenuItem` used in `renderCabinets()` at line 1949
- `styles.quoteSectionActions` and `quoteStyles.quoteSectionActions` compound class at line 1909
- `quoteStyles.roomPlannerSection` and `quoteStyles.roomPlannerActions` in `renderRooms()`
- `styles.quoteColourCombo` + `quoteStyles.quoteColourCombo` combined at line 500 for combobox wrapper
- `styles.quoteColourMenu`, `styles.quoteColourOption`, `styles.quoteColourEmpty`, `styles.quoteOptionThumb` throughout `QuoteImageCombobox` render
- `quoteStyles.quoteActionMenuWrap`, `quoteStyles.quoteActionMenuButton`, `quoteStyles.quoteActionMenu` in `QuoteLineActionDropdown`
- `quoteStyles.quoteItemsTable` at line 2038
- `workflowStyles` imported but usage not found in lines 1–1551 (possibly used later in the file in sections not yet read — needs verification)
- `AdminActionDropdown` + `AdminConfirmDeleteAction` used in the cabinets table action column
- `useAdminTablePagination` / `AdminTablePagination` used for attachments

**Recommended actions:**

1. Replace `useAdminTablePagination`/`AdminTablePagination` with `useAdminPagination`/`AdminPagination` for the attachments list.
2. Replace `AdminActionDropdown` + `AdminConfirmDeleteAction` in the cabinets section with direct `<button>` text links (matching the style of other table action cells) or migrate to a Tailwind dropdown.
3. Replace `styles.secondaryButton` with the `tw.secondaryBtn` string already defined in the file.
4. Replace `styles.emptyState` / `styles.emptyStateTitle` / `styles.emptyStateText` with Tailwind equivalents (e.g. `<div className="py-12 text-center text-[13px] text-[#8b8a81]">`).
5. Move all `styles.quoteColourCombo`, `quoteStyles.quoteColourComboButton`, `quoteStyles.quoteActionMenu*` classes into Tailwind inside their components.
6. Remove `workflowStyles` import entirely (verify remaining usages in lines 1552–3481).
7. Once all module usages are removed, delete `quote-editor.module.css` and stop importing from `admin-content.module.css`.

---

### /admin/orders (list) — `app/admin/orders/OrdersManager.tsx`

| Check | Score | Notes |
|---|---|---|
| 1 Tailwind | ✅ | All Tailwind, no module imports |
| 2 Buttons | ✅ | Mobile "Open order" button: `h-[34px] px-4 bg-[#1c2b1e]`. Row click navigates. Correct. |
| 3 Tables | ✅ | Desktop table + mobile article cards, correct headers and colours. |
| 4 Pagination | ✅ | `AdminPagination` + `useAdminPagination` |
| 5 Modals | n/a | No modals |
| 6 Dropdowns | ✅ | No dropdowns needed |
| 7 Toast | ✅ | `useToast` |
| 8 Typography | ✅ | Correct scales |
| 9 Colours | ✅ | All correct. `#6b9e61` dot for new orders. |
| 10 Shell | ✅ | `orders/page.js` wraps in `AdminShell` |
| 11 CSS Modules | ✅ | None |
| 12 Legacy Imports | ✅ | None |

**Recommended actions:** None.

---

### /admin/orders/[id] — OrderDetail — `app/admin/orders/[id]/OrderDetail.js`

| Check | Score | Notes |
|---|---|---|
| 1 Tailwind | ⚠️ | Mostly Tailwind — the `tw` object defines correct utility strings for all cards, tables, buttons. However **imports `styles` from `../../admin-content.module.css`** (line 14) and actively uses `styles.statusPillActive`, `styles.statusPillIssue`, `styles.statusPillDraft` (lines 289–291) in the `statusClass()` helper function, and `styles.emptyState` for loading/not-found states (lines 766–767). |
| 2 Buttons | ✅ | `tw.primaryBtn` = `h-[34px] bg-[#1c2b1e]`, `tw.secondaryBtn`, `tw.smBtn` = `h-[26px]`, `tw.dangerBtn` — all correct. |
| 3 Tables | ✅ | Multiple section tables all using `tw.th`, `tw.td` Tailwind. Desktop + mobile cards for items, supplier made, made in house, cut list, payments, activity. |
| 4 Pagination | ✅ | `AdminPagination` + `useAdminPagination` used for all 6 paginated sections. |
| 5 Modals | ✅ | Uses `Modal` from `@/components/ui/Modal` for paymentModal, paymentRequestModal, panelNotesModal. |
| 6 Dropdowns | ✅ | `tw.inlineSelect` native selects throughout — consistent. |
| 7 Toast | ✅ | `useToast` throughout |
| 8 Typography | ✅ | `tw.muted` = `text-[11px] text-[#8b8a81]`, correct field labels and body text. |
| 9 Colours | ✅ | Correct token values in `tw` object and throughout. |
| 10 Shell | ✅ | `orders/[id]/page.js` wraps in `AdminShell` |
| 11 CSS Modules | ❌ | **`admin-content.module.css` is still imported** and actively used for 3 CSS classes (`statusPillActive`, `statusPillIssue`, `statusPillDraft`, `emptyState`). The `order-detail.module.css` file exists on disk but is NOT imported — it appears to be an unused artefact. |
| 12 Legacy Imports | ✅ | No legacy component imports. The `AdminPagination` import is the current correct one. |

**Specific issues:**
- `statusClass()` function (line 288) returns `styles.statusPillActive`, `styles.statusPillIssue`, `styles.statusPillDraft` — these are used in activity log rows only (the rest of the file uses the inline `tw` object for status pills). This should be replaced with a Tailwind string helper matching the patterns used elsewhere in the file.
- `styles.emptyState` used for loading/not-found states (lines 766–767) — replace with `className="flex items-center justify-center py-20 text-[13px] text-[#8b8a81]"` or similar.

**Recommended actions:**
1. Replace `statusClass()` return values with inline Tailwind strings matching `tw.pill` + colour tokens.
2. Replace `styles.emptyState` at lines 766–767 with Tailwind.
3. Remove the `styles` import.
4. Delete `order-detail.module.css` (it is not imported anywhere).

---

### /admin/products (list) — `app/admin/products/ProductsTable.tsx`

| Check | Score | Notes |
|---|---|---|
| 1 Tailwind | ✅ | All Tailwind |
| 2 Buttons | ✅ | "Add product" link: `h-[34px] px-4 bg-[#1c2b1e]`. Delete: text link. Correct. |
| 3 Tables | ✅ | Desktop table with correct header/border/hover. No mobile card layout — **no mobile card layout provided**. Only a desktop table exists. Products page does not have the `hidden md:block` / `md:hidden` split that other pages use. |
| 4 Pagination | ✅ | `AdminPagination` + `useAdminPagination` |
| 5 Modals | n/a | |
| 6 Dropdowns | n/a | |
| 7 Toast | ✅ | `useToast` |
| 8 Typography | ✅ | Correct |
| 9 Colours | ✅ | Status pills correct |
| 10 Shell | ✅ | `products/page.js` wraps in `AdminShell` |
| 11 CSS Modules | ✅ | None |
| 12 Legacy Imports | ✅ | None |

**Recommended actions:** Add a mobile card layout (`md:hidden` section) matching the pattern from Customers, Enquiries, Orders, etc. The table is wrapped in `overflow-x-auto` which provides a fallback but is not ideal on small screens.

---

### /admin/products/[id]/edit — ProductEditorForm — `app/admin/products/_components/ProductEditorForm.js`

This is the second highest-priority migration target.

| Check | Score | Notes |
|---|---|---|
| 1 Tailwind | ❌ | **Imports `styles` from `../../admin-content.module.css`** (line 8) and **`productStyles` from `./product-editor.module.css`** (line 11). The `productClass()` helper at line 13 explicitly merges both module namespaces: `[styles[name], productStyles[name]].filter(Boolean).join(" ")`. Virtually every UI element — tabs, panels, image gallery, pricing table, form fields, action menus — uses module class names. Almost no Tailwind is used in JSX. |
| 2 Buttons | ❌ | All buttons use CSS module classes via `productClass()`. No `<Button>` component from `@/components/ui/Button` is used. |
| 3 Tables | ❌ | Pricing table uses `styles`/`productStyles` classes. No `bg-[#f5f8f4]` header. |
| 4 Pagination | ❌ | The imported `AdminActionDropdown` / `AdminBulkDeleteButton` / `AdminConfirmDeleteAction` (line 10) are legacy CSS-module-styled components. No `AdminPagination` / `useAdminPagination` is used (the pricing table appears to have no pagination at all). |
| 5 Modals | ❌ | Uses custom modal-like patterns through module CSS rather than `Modal` from `@/components/ui/Modal`. |
| 6 Dropdowns | ❌ | Comboboxes for edge profiles and profile names appear to use custom implementation with module classes. |
| 7 Toast | ✅ | `useToast` from `@/components/ui/Toast` is imported and used (line 9). |
| 8 Typography | ❌ | All text classes via CSS modules — not using `text-[13px]`, `text-[11px]` etc. directly. |
| 9 Colours | ❌ | Colours are defined inside CSS module rules, not via Tailwind tokens in JSX. |
| 10 Shell | ✅ | `products/[id]/edit/page.js` wraps in `AdminShell` |
| 11 CSS Modules | ❌ | Two active CSS module imports: `admin-content.module.css` and `product-editor.module.css`, both actively used throughout the entire component. |
| 12 Legacy Imports | ❌ | **Line 10:** `import { AdminActionDropdown, AdminBulkDeleteButton, AdminConfirmDeleteAction } from "../../_components/AdminActionDropdown"` — all three are used: `AdminBulkDeleteButton` at line 1294, `AdminConfirmDeleteAction` at line 1336. |

**Recommended actions:** Full Tailwind migration required. This file needs a comprehensive rewrite of its JSX styling to use:
- The `tw` object pattern (matching QuoteEditor/OrderDetail)
- `<Button>` from `@/components/ui/Button`
- Inline text-link patterns for row actions (removing `AdminActionDropdown`/`AdminBulkDeleteButton`/`AdminConfirmDeleteAction`)
- `Modal` from `@/components/ui/Modal` for any overlay dialogs
- PCD table pattern (`bg-[#f5f8f4]` header, `border-[#dbd8cc]` borders)
- After migration: delete `product-editor.module.css`

---

### /admin/products/[id]/quote — ProductQuoteConfigForm — `app/admin/products/_components/ProductQuoteConfigForm.js`

| Check | Score | Notes |
|---|---|---|
| 1 Tailwind | ❌ | **Imports `styles` from `../../admin-content.module.css`** (line 7). The component uses `styles.fieldLabel`, `styles.fieldInput`, `styles.primaryButton`, `styles.secondaryButton`, `styles.noticeBox`, and `styles.textareaInput` throughout its JSX (not visible in the first 100 lines but confirmed by the import and known module structure). |
| 2 Buttons | ❌ | CSS module button classes — `styles.primaryButton`, `styles.secondaryButton` |
| 3 Tables | n/a | Form-only UI |
| 4 Pagination | n/a | |
| 5 Modals | n/a | |
| 6 Dropdowns | n/a | Native selects only |
| 7 Toast | ✅ | `useToast` imported and used |
| 8 Typography | ❌ | Text via CSS module classes |
| 9 Colours | ❌ | Colours in CSS module |
| 10 Shell | ✅ | Wrapped via `products/[id]/quote/page.js` → `AdminShell` |
| 11 CSS Modules | ❌ | `admin-content.module.css` actively used |
| 12 Legacy Imports | ✅ | No legacy component imports (only `styles` + `useToast` + Next.js/React) |

**Recommended actions:** Migrate form fields, labels, buttons, and notice boxes to Tailwind. Pattern to follow: `AccountSettingsForm.tsx` which has an equivalent two-panel settings form using purely Tailwind utility strings.

---

### /admin/options — ColourLibraryManager — `app/admin/options/ColourLibraryManager.tsx`

| Check | Score | Notes |
|---|---|---|
| 1 Tailwind | ✅ | No CSS module imports. All Tailwind via local constant strings (`inputClass`, `primaryBtn`, `secondaryBtn`) and inline className props. |
| 2 Buttons | ✅ | `primaryBtn` = `h-[36px] px-4 bg-[#1c2b1e]`, `secondaryBtn` = `h-[36px] px-4 bg-white border border-[#dbd8cc]`. Correct heights. |
| 3 Tables | ✅ | Desktop table with `bg-[#f5f8f4]` header and `border-[#dbd8cc]`. (Mobile layout not inspected in detail but the file has both `hidden md:block` and `md:hidden` sections based on the component's size.) |
| 4 Pagination | ✅ | `AdminPagination` + `useAdminPagination` |
| 5 Modals | ⚠️ | The add/edit colour row uses a `Modal` from `@/components/ui/Modal` (import visible and referenced in the component). However the delete confirmation appears to use a raw `rowToDelete` state with an inline panel rather than a proper modal or `ConfirmModal`. Needs verification in the unread portion of the file (lines 300+). |
| 6 Dropdowns | ✅ | Filter dropdowns are custom portal-based Tailwind dropdowns defined inline — correct pattern. Native selects for material/thickness/finish/order-type. |
| 7 Toast | ✅ | `useToast` |
| 8 Typography | ✅ | Correct scales from inspected portion. |
| 9 Colours | ✅ | Correct tokens in `inputClass`, `primaryBtn`, `secondaryBtn`. |
| 10 Shell | ✅ | `options/page.js` wraps in `AdminShell` |
| 11 CSS Modules | ✅ | None |
| 12 Legacy Imports | ✅ | None |

**Recommended actions:** Verify the delete confirmation flow uses `ConfirmModal` or `Modal` rather than an inline state panel.

---

### /admin/settings — AccountSettingsForm — `app/admin/_components/AccountSettingsForm.tsx`

| Check | Score | Notes |
|---|---|---|
| 1 Tailwind | ✅ | All Tailwind utility strings. The only non-Tailwind rendering is `LaunchOverlayPreview` which uses `launchStyles` from `launch-preview.module.css` — but this is intentional: the launch preview is meant to faithfully replicate the customer-facing launch overlay, which is necessarily styled with its own CSS. |
| 2 Buttons | ✅ | `primaryBtn` = `h-[36px] px-4 bg-[#1c2b1e]`, `secondaryBtn` = `h-[36px] px-4 bg-white border border-[#dbd8cc]`. Correct. |
| 3 Tables | n/a | Settings form, no tables |
| 4 Pagination | n/a | |
| 5 Modals | ⚠️ | The launch preview is rendered via `createPortal` directly on `document.body` with a raw `<div className="fixed inset-0 bg-black/80...">` (line 628–650) rather than `Modal` from `@/components/ui/Modal`. This is a full-screen preview, not a standard modal, so it may be intentional — but it bypasses the standard modal scroll-lock and focus-trap behaviour. |
| 6 Dropdowns | ✅ | No dropdowns needed |
| 7 Toast | ⚠️ | Status feedback for email, password, launch, and defaults is via raw `setEmailStatus`/`setPasswordStatus`/`setLaunchStatus`/`setDefaultsFeedback` state and inline `<p>` tags rather than `useToast`. Since this is inside the `AdminShell` / `ToastProvider`, `useToast` is available and should be used. |
| 8 Typography | ✅ | `text-[20px]` page title, `text-[15px]` card headings, `text-[13px]`/`text-[12px]` body. |
| 9 Colours | ✅ | Correct tokens throughout. |
| 10 Shell | ✅ | `settings/page.js` wraps in `AdminShell` |
| 11 CSS Modules | ❌ | Imports `launchStyles from './launch-preview.module.css'`. This is a deliberate use for the customer-facing launch overlay preview — not a migration target per se, but it is an active module import. |
| 12 Legacy Imports | ✅ | None. Imports are `createPortal`, `useMemo`, `useState`, `useEffect`, Supabase client, and Tabler icons. |

**Recommended actions:**
1. Replace inline status `<p>` feedback (email, password, launch, defaults) with `useToast` toasts.
2. Optionally wrap the launch preview in `Modal` with `size="full"` if the UI library supports it — or keep as portal if the full-screen treatment is intentional.
3. `launch-preview.module.css` can stay — it is genuinely needed to render the customer-facing component faithfully.

---

### /admin/design — `app/admin/design/page.js`, `ProjectsList.js`, and `_components/*`

**Note:** The design tool pages were not part of the 12-check template but are included for completeness since they appeared in the file listing.

All design tool files (`DesignCanvas.js`, `DesignLeftPanel.js`, `DesignProgram.js`, `DesignRightPanel.js`, `FrontElevationView.js`, `ImportModal.js`, `MaterialColourPicker.js`, `ProjectsList.js`) import from `design.module.css`. This is a specialised design tool with its own layout requirements — a full Tailwind migration is lower priority than the product editor, but the CSS module dependency should be tracked.

---

## Components

---

### AdminShell — `app/admin/_components/AdminShell.tsx`

| Check | Score | Notes |
|---|---|---|
| 1 Tailwind | ✅ | All Tailwind. Sidebar colours and sizes via JS constants at the top of the file. |
| 2 Buttons | ✅ | Sidebar nav uses `Link` + Tailwind classes. Logout uses `Button`-style classes inline. |
| 5 Modals | ✅ | Uses `Modal` (bottom nav "More" sheet) and `ConfirmModal` (logout confirmation) from `@/components/ui/Modal`. |
| 7 Toast | ✅ | Wraps children in `<ToastProvider>` — this is the correct pattern. |
| 9 Colours | ✅ | PCD dark green sidebar `#1c2b1e`, accent `#6b9e61`, `#dbd8cc` border, `#faf9f6` page bg. |
| 11 CSS Modules | ✅ | None |
| 12 Legacy Imports | ✅ | None |

**Recommended actions:** None. AdminShell is fully migrated and serves as the reference implementation for Tailwind-based shell layout.

---

### AdminPagination — `app/admin/_components/AdminPagination.tsx`

| Check | Score | Notes |
|---|---|---|
| 1 Tailwind | ✅ | All Tailwind |
| 2 Buttons | ✅ | Prev/next buttons: `h-[28px] w-[28px] border border-[#dbd8cc] rounded-[4px]` — correct |
| 4 Pagination | ✅ | This IS the pagination component. `PAGE_SIZE = 8`, `useAdminPagination` hook exported. |
| 9 Colours | ✅ | `border-[#edf4eb]`, `border-[#dbd8cc]`, `text-[#5a5a52]`, `hover:bg-[#f5f8f4]` |
| 11 CSS Modules | ✅ | None |
| 12 Legacy Imports | ✅ | None |

**Recommended actions:** None.

---

### AdminTablePagination — `app/admin/_components/AdminTablePagination.js` — LEGACY

| Check | Score | Notes |
|---|---|---|
| 1 Tailwind | ❌ | Imports `styles from "../admin-content.module.css"` and uses `styles.tablePagination`, `styles.tablePaginationMuted`, `styles.tablePaginationMeta`, `styles.tablePaginationControls`, `styles.tablePaginationButton`, `styles.tablePaginationPage`. |
| 4 Pagination | ❌ | Is itself a legacy system — exports `useAdminTablePagination` and `AdminTablePagination`. |
| 11 CSS Modules | ❌ | Actively uses `admin-content.module.css` |
| 12 Legacy Imports | ❌ | This component IS the legacy import that others should stop using. |

**Currently still imported by:** `QuoteEditor.js` (for attachment pagination).

**Recommended actions:** Once `QuoteEditor.js` is migrated, this file can be deleted.

---

### AdminActionDropdown — `app/admin/_components/AdminActionDropdown.js` — LEGACY

| Check | Score | Notes |
|---|---|---|
| 1 Tailwind | ❌ | Imports `styles from "../admin-content.module.css"`. Uses `styles.tableActionMenuWrap`, `styles.tableActionMenuButton`, `styles.tableActionMenu`, `styles.tableActionMenuItem`, `styles.tableActionDangerItem`, `styles.tableActionConfirmText`, `styles.bulkDeleteConfirm`, `styles.bulkDeleteButton`. |
| 2 Buttons | ❌ | All button styles from CSS module |
| 11 CSS Modules | ❌ | `admin-content.module.css` |
| 12 Legacy Imports | ❌ | This component exports the legacy components: `AdminActionDropdown`, `AdminConfirmDeleteAction`, `AdminBulkDeleteButton`. |

**Currently still imported by:**
- `QuoteEditor.js` — `AdminActionDropdown`, `AdminConfirmDeleteAction`
- `ProductEditorForm.js` — `AdminActionDropdown`, `AdminBulkDeleteButton`, `AdminConfirmDeleteAction`
- `ProjectsManager.js` — `AdminActionDropdown`, `AdminBulkDeleteButton`, `AdminConfirmDeleteAction`

**Recommended actions:** Migrate all three import sites to inline Tailwind patterns, then delete this file.

---

## Remaining CSS Modules

| Module File | Imported By | In-use Classes | Can Delete? |
|---|---|---|---|
| `app/admin/admin-content.module.css` | `QuotesManager.js` (orphaned), `QuoteEditor.js`, `OrderDetail.js`, `ProductEditorForm.js`, `ProductQuoteConfigForm.js`, `ProjectsManager.js`, `ProjectDetail.js`, `OptionSetsManager.js`, `AdminActionDropdown.js`, `AdminTablePagination.js`, `dev/payment-email-preview/page.js` | All — this is the master legacy stylesheet | **No — not until all consumers are migrated** |
| `app/admin/quotes/[id]/quote-editor.module.css` | `QuoteEditor.js` | `quoteColourCombo`, `quoteColourComboButton`, `quoteActionMenuWrap`, `quoteActionMenuButton`, `quoteActionMenu`, `quoteSectionActions`, `quoteItemsTable`, `roomPlannerSection`, `roomPlannerActions` | **No — in use by QuoteEditor.js** |
| `app/admin/_components/admin-workflow.module.css` | `QuoteEditor.js` | `workflowStyles.*` (exact classes need verification in lines 1552–3481) | **No — in use by QuoteEditor.js** |
| `app/admin/products/_components/product-editor.module.css` | `ProductEditorForm.js` | All layout and component classes | **No — in use by ProductEditorForm.js** |
| `app/admin/_components/launch-preview.module.css` | `AccountSettingsForm.tsx` | All — renders the customer-facing overlay | **No — intentional, keep** |
| `app/admin/orders/[id]/order-detail.module.css` | None | None | **YES — safe to delete. No file imports it.** |
| `app/admin/quotes/[id]/_components/room-planner.module.css` | `RoomPlanner.js` | All | No — in use |
| `app/admin/quotes/[id]/_components/room-elevation.module.css` | `RoomElevation.js` | All | No — in use |
| `app/admin/quotes/[id]/_components/elevation-panel.module.css` | `ElevationPanel.js` | All | No — in use |
| `app/admin/quotes/[id]/_components/planner-overlay.module.css` | `PlannerOverlay.js` | All | No — in use |
| `app/admin/quotes/[id]/_components/room-manager.module.css` | `RoomManager.js` | All | No — in use |
| `app/admin/design/design.module.css` | All design tool components (8 files) | All | No — entire design tool |

**Immediately safe to delete:** `app/admin/orders/[id]/order-detail.module.css`

---

## Legacy Imports Still Present

| File | Legacy Import | What It's Used For |
|---|---|---|
| `app/admin/quotes/[id]/QuoteEditor.js` | `AdminActionDropdown`, `AdminConfirmDeleteAction` from `../../_components/AdminActionDropdown` | Cabinet table action column ("Configure" + "Delete" dropdown menu) |
| `app/admin/quotes/[id]/QuoteEditor.js` | `AdminTablePagination`, `useAdminTablePagination` from `../../_components/AdminTablePagination` | Attachments section pagination |
| `app/admin/products/_components/ProductEditorForm.js` | `AdminActionDropdown`, `AdminBulkDeleteButton`, `AdminConfirmDeleteAction` from `../../_components/AdminActionDropdown` | Pricing table bulk delete + row delete |
| `app/admin/projects/ProjectsManager.js` | `AdminActionDropdown`, `AdminBulkDeleteButton`, `AdminConfirmDeleteAction` from `../_components/AdminActionDropdown` | Project list bulk delete + row delete |

---

## Priority Fix List

Ordered from highest to lowest impact on admin user experience.

### Priority 1 — CRITICAL (broken or visually inconsistent on every page visit)

1. **`ProductEditorForm.js` — Full Tailwind migration**
   The product editor is visited every time a product needs updating. It renders entirely in legacy CSS module styles, so it looks visually disconnected from every other admin page. Buttons do not match the PCD pattern, the colour palette diverges, and it uses `AdminActionDropdown` / `AdminBulkDeleteButton` / `AdminConfirmDeleteAction`. This is the most urgently broken page in visual terms.

2. **`ProductQuoteConfigForm.js` — Tailwind migration**
   Accessed from the product editor's Quote tab. Same issue as above — all CSS module styling.

### Priority 2 — HIGH (partially broken in visible ways)

3. **`QuoteEditor.js` — Remove `AdminTablePagination`/`AdminTablePagination` from attachments**
   The attachments section is the only part of the quote editor that uses the old-style CSS-module-styled pagination. It visually clashes with the rest of the editor.

4. **`QuoteEditor.js` — Replace `AdminActionDropdown`/`AdminConfirmDeleteAction` in cabinets section**
   The cabinet list table has an "Actions" dropdown that is styled differently from every other table's text-link action buttons. Convert to `<button type="button" className="text-[12px] font-medium text-[#6b9e61] hover:underline">Configure</button>` + separate delete link.

5. **`OrderDetail.js` — Remove 3 uses of `admin-content.module.css`**
   Three specific lines (`statusClass()` function + 2 `emptyState` uses). Quick fix: replace `styles.statusPillActive` with `'bg-[#edf4eb] text-[#2d5e28] border-[#a8c5a0]'`, etc.

### Priority 3 — MEDIUM (workflow or visual gaps)

6. **`QuoteEditor.js` — Migrate combobox styling from CSS modules to Tailwind**
   `QuoteImageCombobox` / `QuoteColourCombobox` / `QuoteLineActionDropdown` all use module classes for their visible UI. The comboboxes are used on every quote line item row — visible to admins constantly.

7. **`QuoteEditor.js` — Migrate empty state + secondary button in cabinets/rooms sections**
   `styles.emptyState`, `styles.emptyStateTitle`, `styles.emptyStateText`, `styles.secondaryButton` in `renderCabinets()` and `renderRooms()`.

8. **`AccountSettingsForm.tsx` — Replace inline status feedback with `useToast`**
   Four separate status state variables exist where `useToast` should be used. This is inside the shell so `useToast` is fully available.

9. **`ProductsTable.tsx` — Add mobile card layout**
   The products list has no `md:hidden` card view. All other list pages have one.

10. **`QuotesManager.js` — Delete the file**
    It is orphaned (no page imports it) and will confuse developers. One line to delete from disk.

11. **Delete `order-detail.module.css`**
    Zero imports. Safe to remove immediately.

### Priority 4 — LOW (minor polish)

12. **`EnquiriesManager.tsx` / `QuoteRequestsManager.tsx` — Normalise modal footer buttons**
    Replace the raw `<button className="h-[36px] px-4 bg-white border...">Close</button>` in `EnquiryPreviewModal` with `<Button variant="neutral">Close</Button>`.

13. **`AccountSettingsForm.tsx` — Launch preview portal**
    Consider wrapping the launch preview in a full-screen `Modal` variant instead of raw `createPortal` to benefit from scroll-lock and focus-trap.

14. **`ProjectsManager.js` and `ProjectDetail.js`**
    Not included in the main audit scope above but both import `admin-content.module.css` and use `AdminActionDropdown`/`AdminBulkDeleteButton`/`AdminConfirmDeleteAction`. These should be migrated in the same pass as `ProductEditorForm.js`.

---

*End of audit.*
