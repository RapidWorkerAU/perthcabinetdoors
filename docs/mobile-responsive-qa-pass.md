# Phase 7 Mobile QA Pass

Date: 2026-08-02

## Scope

Phase 7 covers the mobile responsive risk areas called out in the audit:

- Public home
- Products
- Product detail
- Request quote
- Contact
- Shared public modals
- Public mobile navigation

The admin dashboard, customers, quote requests, quotes, quote editor, product editor, and design tool still need live viewport QA. Source-level risks in those areas remain tracked in the main audit.

## Verification Constraint

The browser automation target was not available in this session. Browser discovery returned no controllable browser instances, so this pass could not capture screenshots or measure live element boxes at 360x740, 390x844, 430x932, 768x1024, 1024x768, and 1440x900.

Verification completed:

- Source-level CSS responsive audit.
- Build verification with `npm.cmd run build`.

## Changes Made

### Public Mobile Navigation

- `app/(site)/frontend.css`
- Mobile menu panel now has `max-height: 100dvh` and `overflow-y: auto`.
- This prevents short mobile landscape screens from trapping links/actions below the viewport.

### Public Modal and Filter Sheet

- `components/PortalModal.module.css`
- Mobile modal footer actions now stack full-width with `min-height: 44px`.
- This reduces cramped side-by-side footer buttons in the products filter sheet and other public modal flows.

### Contact and Request Quote Forms

- `app/(site)/contact/contact.module.css`
- Mobile form controls now use 16px font sizes to reduce iOS focus zoom risk.
- Product editor modal controls in the quote flow now meet the same mobile input-size rule.
- Primary quote/product edit buttons now have safer minimum touch heights.
- Product line card metadata stacks on narrow screens instead of relying on a tight two-column label/value layout.
- Footer contact text can wrap anywhere to avoid email overflow on narrow screens.

### Product Detail

- `app/(site)/products/[slug]/product-detail.module.css`
- Mobile native selects now use 16px text.
- Product enquiry inputs/textareas use 16px text and at least 44px height on mobile.
- Product spec rows stack label/value pairs on narrow screens to avoid clipped right-aligned values.
- Footer contact text can wrap anywhere to avoid email overflow.

## Remaining Manual QA Checklist

Run this when a browser/device is available:

1. Check 360x740, 390x844, 430x932, 768x1024, 1024x768, and 1440x900.
2. Public home: open/close mobile nav, tab through menu, verify all menu links are visible in short landscape.
3. Products: open filters, reset filters, apply filters, verify footer buttons are not clipped.
4. Product detail: test gallery thumbs, colour/profile/edge controls, enquiry form, and lightbox.
5. Request quote: add/edit/remove a product, open image selects, scroll product modal, submit validation errors.
6. Contact: verify all form fields and chooser cards fit without horizontal scroll.
7. Admin pages: verify table mobile cards and modal footer stacking for dashboard, customers, quote requests, quotes, quote editor, product editor, and design tool.

## Exit Status

Source-level Phase 7 remediation is complete and the production build passes.

Live responsive QA is still required before the Phase 7 exit criteria can be considered fully satisfied.
