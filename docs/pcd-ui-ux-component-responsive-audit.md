# PCD UI/UX, Component, and Mobile Responsive Audit

Date: 2026-08-02

Scope: public site, admin portal, quote/order/product workflows, public design tool, and shared components under `components/ui`.

Verification: source audit plus `npm.cmd run build`. The in-app browser backend was unavailable in this session, so mobile findings are based on source/CSS responsive behavior rather than live screenshots.

## Executive Summary

PCD has the start of a component library (`Button`, `Modal`, `Input`, `Textarea`, `Dropdown`, `DataTable`, `Pill`, `Toast`, `EmptyState`, `Skeleton`, `Avatar`), but the app is not consistently using it. The main pattern is that newer admin pages use parts of the library while older or complex workflow pages rebuild controls locally.

Quantitative indicators from source:

| Pattern | Current usage |
|---|---:|
| Raw `<button>` elements in app/components | 502 |
| Shared `<Button>` usages | 15 |
| Raw `<table>` elements | 42 |
| Shared `<DataTable>` usages | 1 |
| Modal/Dialog/Portal modal references | 45 |
| CSS-module or `styles.*` references in JSX | 1,636 |

The highest-risk inconsistency is not one visual detail. It is the existence of several parallel design systems:

1. Public marketing site: custom CSS in `app/(site)/frontend.css`, serif display typography, custom nav/menu/buttons.
2. Public product/request quote area: CSS modules such as `products.module.css` and `contact.module.css`, plus `PortalModal`.
3. Admin shell/newer admin pages: Tailwind utility classes using PCD green/neutral tokens, plus some `components/ui`.
4. Legacy admin/product/quote pages: `admin-content.module.css`, `product-editor.module.css`, `quote-editor.module.css`, legacy dropdown/pagination components.
5. Design tool: separate dark functional UI in `design.module.css` and `design.mobile.module.css`.

This makes the site harder to maintain and weakens UX consistency, especially on mobile where table/card behavior, modal behavior, menus, and action placement vary by page.

## Where Components Are Consistent

### Admin Shell

`app/admin/_components/AdminShell.tsx` is the strongest consistent area. It provides:

- Desktop sidebar with stable icon/text navigation.
- Mobile bottom nav with a More sheet.
- Shared `ToastProvider`.
- Shared `ConfirmModal` for logout.

This should remain the admin navigation reference.

### Newer Admin List Pages

These pages are relatively consistent in layout, typography, and pagination:

- `app/admin/customers/CustomersManager.tsx`
- `app/admin/enquiries/EnquiriesManager.tsx`
- `app/admin/quote-requests/QuoteRequestsManager.tsx`
- `app/admin/quotes/QuotesTable.tsx`
- `app/admin/orders/OrdersManager.tsx`

They generally use:

- `text-[20px]` page titles.
- `text-[13px]` supporting copy and table body text.
- `text-[11px]` uppercase table headers.
- Desktop table plus mobile card patterns.
- `AdminPagination` / `useAdminPagination`.
- PCD admin colors: `#1c2b1e`, `#6b9e61`, `#dbd8cc`, `#edf4eb`, `#faf9f6`.

`CustomersManager.tsx` is the closest reference implementation because it also uses shared `Button`, `Modal`, `Input`, `Textarea`, pagination, and toast.

### Shared Modal

`components/ui/Modal.tsx` is a strong foundation:

- Full-screen form modal on mobile.
- Bottom-sheet style `contentFit` modal on mobile.
- Centered modal on desktop.
- Sticky header/footer structure.
- Radix Dialog focus/ARIA foundation.

This should become the only standard admin modal path, with exceptions explicitly documented for specialised visual previews.

## Where PCD Has Deviated

### Buttons

Current state:

- `components/ui/Button.tsx` exists and is well structured.
- Only 15 shared `<Button>` usages were found.
- 502 raw `<button>` occurrences were found.
- Many raw buttons are not merely text links; they are full CTAs, icon buttons, modal footer buttons, filter pills, action buttons, and mobile action controls.

Consistent:

- Admin customer form modal buttons.
- Some quote-request modal actions.
- Shared modal footer patterns.

Deviated:

- `QuotesTable.tsx` uses a raw `New quote` button.
- `EnquiriesManager.tsx` uses a raw modal footer Close button.
- `ProductsTable.tsx` uses raw button/link CTA styles.
- `ProductEditorForm.js`, `ProductQuoteConfigForm.js`, `QuoteEditor.js`, `OrderDetail.js`, `ProjectsManager.js`, and design-tool components define local button systems.
- Public site buttons use separate CSS classes such as `landing-button`, `tileBtn`, `submitBtn`, and mobile menu action classes.

Recommendation:

Create a strict button taxonomy:

- `Button`: filled/outline/neutral/danger, sizes `sm/md/lg`, icon-left/right, loading.
- `IconButton`: square button with required `aria-label` and optional tooltip.
- `TextAction`: inline table/card action, with variants `default`, `success`, `danger`.
- `FilterChip` / `SegmentedButton`: for status filters and selection pills.
- `PublicCTA`: customer-facing CTA style, separate from admin but still standardised.

### Icon and Text Buttons

Current problems:

- Icon libraries are consistent in admin (`@tabler/icons-react`), but icon sizing varies: 14, 15, 16, 17, 18, 20px.
- Some icon-only buttons are accessible (`aria-label` present), while others depend on visible text or custom CSS.
- Text actions are inconsistent: sometimes underlined links, sometimes colored buttons, sometimes raw text in tables.
- Destructive actions sometimes confirm inline, sometimes delete immediately, sometimes use `ConfirmModal`.

Risk:

- Users must relearn action hierarchy per page.
- Destructive actions have inconsistent affordance and confirmation safety.
- Icon-only buttons can fail accessibility if labels are missed during future changes.

Recommendation:

Standardise:

- Icon-only action: 32px or 40px square depending context.
- Table row text action: `TextAction`.
- Destructive flow: always `ConfirmModal` unless it is a reversible draft-only action.
- More/action menu: one `ActionMenu` component, not local dropdowns.

### Tables

Current state:

- 42 raw `<table>` usages.
- One `DataTable` usage.
- Multiple pages manually rebuild the same desktop table plus mobile cards pattern.

Consistent:

- Customers, enquiries, quote requests, quotes, orders have visually similar admin table patterns.
- `AdminPagination` is consistently used on newer list pages.

Deviated:

- `components/ui/DataTable.tsx` uses a different color system: teal `#2d9692`, slate-ish `#1a2533`, `#3d4d5f`.
- Admin list pages use PCD green/neutral: `#1c2b1e`, `#6b9e61`, `#dbd8cc`.
- Product list lacks the same mobile card behavior as other admin list pages.
- Quote request preview has its own nested line-item table.
- Public quote/project views render separate table-like layouts.

Risk:

- The shared `DataTable` is not visually aligned to the admin design language, which likely explains low adoption.
- Every list page hand-codes desktop and mobile behavior, increasing defects and drift.

Recommendation:

Replace or restyle `DataTable` as `AdminDataTable` with:

- PCD token colors.
- Built-in toolbar.
- Built-in empty/loading states.
- Built-in selectable rows.
- Built-in mobile card renderer.
- Built-in `AdminPagination`.
- Standard row action slot.

Then migrate customers/enquiries/quote requests/quotes/orders/products/projects/hardware/materials/options onto it.

### Modals and Sheets

Current state:

- `components/ui/Modal.tsx` is strong, but there are multiple modal systems.
- Public product filters use `components/PortalModal.tsx`.
- Request quote line editor uses a custom CSS-module modal in `RequestQuoteFormClient.js`.
- Design tool uses `design.module.css` modal classes and mobile full-screen sheets.
- Several custom dropdowns use `createPortal` and local positioning.

Consistent:

- Admin shell More sheet and logout confirmation.
- Customer modal.
- Quote-request and enquiry preview modals partially.

Deviated:

- `PortalModal` is separate from `components/ui/Modal`.
- `ProductEditorForm.js` uses legacy/custom modal patterns.
- `AccountSettingsForm.tsx` uses raw portal preview overlay.
- Design tool has its own modal architecture.

Risk:

- Inconsistent focus handling, scroll locking, mobile sizing, close behavior, and footer action placement.
- Modal bottom sheets and full-screen mobile modals do not behave uniformly.

Recommendation:

Keep one admin modal component family:

- `Modal`
- `ConfirmModal`
- `Drawer` or `Sheet`
- `FullscreenModal`

Keep a public `PublicModal` only if brand styling requires it, but make it share the same accessibility/focus/scroll behavior.

### Text and Font

Current state:

- `app/globals.css` defines `Plus Jakarta Sans` as `--font-sans`.
- `app/(site)/frontend.css` redefines `--pcd-font-ui` as Arial and `--pcd-font-display` as Georgia.
- Legacy modules still reference old PCD font variables.
- Design tool uses inherited font but separate dark UI sizing.
- Public landing page intentionally uses a serif display language.

Consistent:

- Admin list pages generally use the same compact scale.
- Public landing page has a coherent editorial style.

Deviated:

- Shared UI components use teal/slate-era text tokens and Tailwind arbitrary values.
- Public site and admin use different font systems.
- Legacy product editor and quote editor use CSS-module typography.
- Some mobile inputs are below 16px outside the design tool, creating iOS zoom risk.

Risk:

- Brand feels fragmented between public site, quote forms, and admin.
- Operators moving between admin pages see typography jumps.
- Small mobile form text can reduce usability and trigger browser zoom behavior.

Recommendation:

Define explicit type scales:

- Admin: page title 20px, section title 15px, body 13px, secondary 12px, table header 11px uppercase.
- Public: hero/display, section heading, body, label, CTA.
- Form mobile inputs: minimum 16px where native iOS focus behavior matters.

### Menu Types

Current menu types:

- Public desktop nav plus mobile full-screen menu.
- Admin desktop sidebar plus mobile bottom nav + More sheet.
- Row action dropdowns in `DataTable`.
- Legacy `AdminActionDropdown`.
- Custom comboboxes in quote/product/request quote flows.
- Design tool view menu, wall picker, item strips, modal menus.
- Dropdown component in `components/ui/Dropdown.tsx`.

Inconsistencies:

- Same table action need is handled by text links, inline confirm links, action dropdowns, and bottom sheets.
- Same filter need is handled by status pills, sidebar checkboxes, mobile filter modal, custom chips, and native selects.
- Same select/combobox need is handled by native selects, `Dropdown`, custom portals, and image picker menus.
- `components/ui/Dropdown.tsx` currently has build warnings: `role="combobox"` missing `aria-controls`/`aria-expanded`, and `role="option"` missing `aria-selected`.

Recommendation:

Standard menu families:

- `AdminNav`: sidebar/bottom nav only.
- `ActionMenu`: row/actions menu.
- `Dropdown`: simple select/multi-select with fixed ARIA contract.
- `ImagePickerDropdown`: visual option picker for colours/profiles/edges.
- `FilterBar` and `FilterSheet`: same data model, responsive shell swap.

## Repeated Sections That Should Become Standard Components

These are repeated enough to justify library components.

| Repeated section | Seen in | Proposed component |
|---|---|---|
| Admin page heading with title/subtitle/actions | Most admin pages | `AdminPageHeader` |
| Status filter pill bar with counts | Enquiries, quote requests, quotes, likely orders/projects | `StatusFilterBar` |
| Desktop table + mobile cards + pagination | Customers, enquiries, quote requests, quotes, orders, products, projects | `AdminDataTable` |
| Bulk selection toolbar/delete selected | Customers, enquiries, quote requests, quotes, products, projects | `BulkActionBar` |
| Row text actions | Most admin tables | `TextAction` / `RowActions` |
| Status pills | Customers, quotes, orders, products, projects, quote requests | `StatusPill` mapped by status domain |
| Empty/loading states | Tables, cards, design tool, product forms | `EmptyState`, `LoadingState` |
| Form card/field grid | Customers modal, settings, product quote config, public request quote | `FormSection`, `FieldGrid` |
| Modal footer actions | Admin modals | `ModalActions` or stronger `Modal` footer API |
| Mobile filter sheet | Products library, DataTable, public filters | `FilterSheet` |
| Image/colour/profile option dropdowns | Quote editor, request quote, design tool, product editor | `ImageOptionPicker` |
| Public CTA buttons | Landing, products, quote request, contact | `PublicButton` / `PublicCTA` |
| Public footer | Products page, landing page, likely other public pages | `PublicFooter` |

## Mobile Responsive Audit

### What Is Working

- Public nav switches to a mobile menu under 680px.
- Admin shell switches to fixed bottom nav on mobile.
- Shared `Modal` has deliberate mobile behavior.
- Most newer admin list pages provide mobile cards.
- Request quote form has separate mobile product cards.
- Design tool has a dedicated mobile stylesheet and full-screen modal pattern.
- `design.mobile.module.css` correctly uses 16px inputs to avoid iOS zoom in its modal forms.

### Key Mobile Inconsistencies and Errors

1. Product admin list lacks the same dedicated `md:hidden` mobile card layout found in customers/enquiries/quotes/orders. It relies on horizontal table scrolling, which is weaker for repeated admin use.

2. Mobile action placement varies by list:
   - Customers: Edit/Delete text links.
   - Enquiries: Preview/Delete text links plus status select.
   - Quote requests: Preview/Convert/Open/Delete text links.
   - Quotes: button-like Open/View/Duplicate controls.
   - Products: table pattern, not card pattern.

3. Modal behavior varies:
   - Shared admin Modal: full-screen or bottom sheet depending `contentFit`.
   - Public PortalModal: separate implementation.
   - Request quote line editor: custom overlay.
   - Design tool: custom full-screen modal sheet.

4. Mobile filters vary:
   - Public products has a full-screen filter modal.
   - `DataTable` has filter/sort icon buttons and sheets.
   - Admin status filters remain horizontal wrapping pill bars.

5. Mobile touch target sizes are mixed:
   - Good examples: 40px/44px nav and modal close buttons.
   - Risk examples: 28px row action buttons, 30px selects, text-only Delete/Edit links, compact table controls.

6. Mobile typography is not governed by one scale:
   - Admin mobile cards use 12-14px heavily.
   - Design mobile uses 16px for form fields.
   - Public forms may still use module CSS values below 16px.

7. Some mobile menus are not focus-trapped consistently:
   - Radix-based `Modal` is stronger.
   - Public mobile nav and custom product/request-quote modals need stricter focus/escape/scroll-lock review.

8. Global `overflow-x: clip/hidden` hides symptoms of overflow. This prevents visible horizontal page scroll, but it can mask clipped controls, dropdowns, and table content on mobile.

9. The public navigation mobile menu uses raw anchors and a custom fixed overlay. It has `aria-expanded`/`aria-controls`, which is good, but should also lock background scroll and trap focus while open.

10. Build warnings show several navigation anchors should be Next `Link` components. This is not just code polish: it affects client-side routing consistency and perceived responsiveness.

## UX/UI Industry Standard Assessment

PCD is functional and has strong domain depth, especially in quote, product, and design workflows. Compared with mature SaaS/admin/product-commerce experiences, the biggest gap is consistency and systemisation, not feature quantity.

### Strengths

- Deep workflow coverage: quotes, orders, payments, projects, design, products, materials, public quote flow.
- Admin information density is generally appropriate for operational work.
- Newer list pages are compact and scannable.
- The design tool has mobile-specific thinking rather than pretending desktop layout will fit.
- Public product pages use real product imagery/assets and helpful configuration flows.

### Weaknesses Against Industry Standards

1. Component adoption is too low.
   Mature products standardise buttons, tables, menus, modals, filters, and status pills. PCD repeatedly rebuilds them.

2. Interaction hierarchy is inconsistent.
   Primary actions, secondary actions, destructive actions, inline actions, and menu actions change per page.

3. Accessibility is uneven.
   Some shared components are good, but custom menus/modals and the shared Dropdown ARIA warnings need attention.

4. Mobile admin UX is inconsistent.
   Some list pages become cards, some remain tables, and actions vary. Industry-standard mobile admin experiences preserve workflow consistency across entity types.

5. Legacy design systems remain active.
   `ProductEditorForm.js`, `ProductQuoteConfigForm.js`, legacy quote/editor modules, project pages, and design tool modules all carry separate UI grammar.

6. Public and admin brand systems are not clearly separated.
   Public editorial typography is fine, but shared tokens should still govern spacing, CTAs, modals, and forms.

7. Error/loading/empty feedback is fragmented.
   Toasts, inline status, raw loading rows, empty divs, and custom error panels coexist.

8. Complex pages have high cognitive load.
   Product editor, quote editor, design right panel, and request quote line modal pack many controls. They need stronger grouping, progressive disclosure, and standard action placement.

### UX Risk Register

| Risk | Severity | Where | Why it matters |
|---|---|---|---|
| Component drift across core workflows | High | Admin lists, product editor, quote editor, projects | Slows users and increases defects |
| Mobile inconsistency | High | Admin products, quote/product/request flows | Mobile users face different models per page |
| Destructive actions inconsistent | High | Tables, editors, legacy dropdowns | Accidental deletes or hesitation |
| Accessibility gaps in custom menus/dropdowns | High | `Dropdown`, custom portals, public nav, request quote modal | Keyboard/screen reader failures |
| Product editor legacy UI | High | `ProductEditorForm.js` | High-value workflow looks and behaves differently |
| Shared `DataTable` off-brand | Medium | `components/ui/DataTable.tsx` | Prevents adoption and duplicates table code |
| Too many modal systems | Medium | Admin/public/design | Focus, scroll, mobile behavior drift |
| Typography fragmentation | Medium | Public/admin/legacy/design | Weakens perceived polish |
| Build warnings accumulating | Medium | Public nav, design/editor files | Quality signal and future regression risk |
| Global overflow clipping | Medium | Site-wide | Can hide mobile defects rather than solve them |

## Strict Sequential Improvement Plan

### Phase 1: Foundation and Rules

Goal: lock the design system before migrating more pages.

1. Define component standards in a short `docs/ui-system-rules.md`.
2. Decide official admin tokens and update shared components away from teal/slate to PCD green/neutral.
3. Add `IconButton`, `TextAction`, `StatusPill`, `AdminPageHeader`, `StatusFilterBar`, `BulkActionBar`.
4. Fix `components/ui/Dropdown.tsx` ARIA warnings.
5. Define destructive-action rules: delete always goes through `ConfirmModal` unless explicitly reversible.

Exit criteria:

- Shared components match PCD admin colors.
- Build has no shared-component ARIA warnings.
- New work has a clear component decision tree.

### Phase 2: Admin Lists and Tables

Goal: stop rebuilding tables and mobile cards.

1. Create/rework `AdminDataTable`.
2. Include desktop table, mobile cards, loading, empty, search, status filter slot, bulk selection, row action slot, and pagination.
3. Migrate Customers first as the reference.
4. Migrate Enquiries, Quote Requests, Quotes, Orders, Products, Projects, Hardware, Benchtop Materials.
5. Remove local table/card/pagination duplication after each migration.

Exit criteria:

- No core admin list page hand-codes desktop table plus mobile cards.
- Products has a proper mobile card layout.
- Row actions use the same text/menu/action patterns everywhere.

### Phase 3: Buttons, Menus, and Destructive Actions

Goal: make every action predictable.

1. Replace full CTA raw buttons with shared `Button`.
2. Replace table action text with `TextAction`.
3. Replace legacy `AdminActionDropdown` with `ActionMenu` or explicit `RowActions`.
4. Replace inline delete confirmations with `ConfirmModal`.
5. Standardise icon-only buttons to `IconButton`.

Exit criteria:

- Raw `<button>` remains only for semantically special cases or inside shared components.
- `AdminActionDropdown.js` can be deleted.
- Destructive flows are consistent.

### Phase 4: Modal and Sheet Consolidation

Goal: one modal behavior model.

1. Extend `Modal` API if needed: `sheet`, `fullscreen`, `dangerConfirm`, `form`.
2. Migrate public `PortalModal` behavior or wrap it with shared focus/scroll logic.
3. Migrate request quote line editor to a standard public modal/sheet.
4. Migrate product editor custom modals.
5. Document design-tool exceptions or adapt them to shared accessibility utilities.

Exit criteria:

- Standard focus trap, close behavior, scroll lock, and footer placement.
- Mobile modal behavior is predictable across public/admin.

### Phase 5: Legacy Admin Workflow Migration

Goal: remove old CSS module dependency from high-value admin workflows.

1. Migrate `ProductEditorForm.js` first.
2. Migrate `ProductQuoteConfigForm.js`.
3. Finish `QuoteEditor.js` cleanup: remove unused legacy imports, migrate colour/image dropdown styling, remove old CSS modules where possible.
4. Migrate `ProjectsManager.js` and `ProjectDetail.js`.
5. Delete orphaned/unused legacy files after import checks.

Exit criteria:

- `ProductEditorForm.js` and `ProductQuoteConfigForm.js` no longer depend on `admin-content.module.css` or `product-editor.module.css`.
- `AdminTablePagination.js` and `AdminActionDropdown.js` are removed after consumers are migrated.

### Phase 6: Public Site Componentisation

Goal: keep public branding but standardise reusable UX.

1. Convert public nav anchors to Next `Link`.
2. Create `PublicButton`, `PublicSection`, `PublicFooter`, `PublicProductCard`, `PublicFilterSheet`.
3. Standardise public CTA, filter, product tile, and modal behavior.
4. Review public mobile nav for focus trap and scroll lock.
5. Align public form controls with mobile input-size rules.

Exit criteria:

- Public pages keep brand character but no longer duplicate basic controls.
- Build warnings for public navigation are removed.

### Phase 7: Mobile QA Pass

Goal: verify actual mobile behavior after standardisation.

1. Test key viewports: 360x740, 390x844, 430x932, 768x1024, 1024x768, 1440x900.
2. Verify no clipped text/buttons in nav, tables/cards, modals, dropdowns, forms.
3. Verify touch targets are at least 40px for primary mobile controls, 44px where feasible.
4. Verify form inputs do not trigger iOS zoom.
5. Verify dropdowns and modals remain visible within viewport and scroll correctly.
6. Verify keyboard/focus behavior for menus and modals.

Exit criteria:

- Responsive QA checklist passes for public home, products, product detail, request quote, contact, admin dashboard, customers, quote requests, quotes, quote editor, product editor, design tool.

### Phase 8: Quality Gates

Goal: prevent regression.

1. Add lint rules or code review checks against importing legacy UI modules in new pages.
2. Add simple component examples or Storybook-like demo page if desired.
3. Add Playwright visual smoke tests for public nav, admin list, modal, mobile card list, and design tool shell.
4. Track component adoption counts over time.

Exit criteria:

- New pages must use shared components by default.
- Build warnings trend toward zero.
- Responsive regressions are caught before manual review.

## Highest Priority Fixes

1. Restyle or replace `components/ui/DataTable.tsx` with a PCD-token `AdminDataTable`.
2. Migrate `ProductEditorForm.js`; it is the largest visible legacy admin workflow.
3. Add mobile cards to `ProductsTable.tsx`.
4. Fix `Dropdown.tsx` ARIA warnings.
5. Create `TextAction`, `IconButton`, `StatusPill`, and `StatusFilterBar`.
6. Replace legacy `AdminActionDropdown` consumers.
7. Consolidate modal/sheet behavior across admin and public quote/product flows.
8. Convert public nav anchors to Next `Link` and add scroll-lock/focus handling to mobile nav.

## Build Verification Notes

`npm.cmd run build` completed successfully.

Important warning themes:

- Public site uses raw `<a>` for internal navigation in several places.
- `components/ui/Dropdown.tsx` has ARIA warnings.
- Several admin/design files have missing hook dependencies and unused code.
- `QuoteEditor.js` has unused legacy imports including `workflowStyles` and `AdminTablePagination`.
- `ProductEditorForm.js` has multiple unused handlers and hook dependency warnings.

These do not block build today, but they indicate the same maintenance drift visible in the UI audit.
