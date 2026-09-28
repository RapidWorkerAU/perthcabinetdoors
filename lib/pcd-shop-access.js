// WHO CAN USE THE SHOP RIGHT NOW. Server only.
//
// The switch is in Settings > Shop and Site Messages (lib/pcd-site-settings.js).
// Open: everybody. Closed: signed-in staff only, so the shop can be checked
// before it is opened; everyone else is shown the closed page and the price and
// checkout endpoints refuse them.
//
// Asked once a request: the settings row is read, and only when the shop is
// closed is the visitor's sign-in checked, because that is a round trip to the
// auth server that an open shop does not need.

import { cache } from "react";
import { isAdminRequest } from "./admin-api";
import { readPublicSiteSettings } from "./pcd-site-settings-store";

/**
 * @returns {Promise<{ open: boolean, staff: boolean, allowed: boolean, settings: object }>}
 *   `staff` is only worked out while the shop is closed; it is false while it
 *   is open, because nothing then depends on it.
 */
export const shopAccess = cache(async () => {
  const settings = await readPublicSiteSettings();
  const open = settings.shop_open === true;
  const staff = open ? false : await isAdminRequest();
  return { open, staff, allowed: open || staff, settings };
});

/** What the price and checkout endpoints answer while the shop is closed. */
export function shopClosedResponse() {
  return Response.json({ ok: false, closed: true, error: "Our online shop is closed right now." }, { status: 403 });
}
