import { PRIVATE_PAGE_METADATA } from "@/lib/pcd-seo";

// NOINDEX FOR A CLIENT PAGE, WHICH CANNOT EXPORT METADATA ITSELF.
//
// /launch is the pre-launch gate. It is "use client", and a client component may
// not export metadata, so the only place to say noindex for it is a layout
// beside it. This file exists for that one line and nothing else.
//
// robots.txt already disallows /launch. That is not enough on its own: a
// disallowed address can still be listed if something links to it, and only
// noindex stops that. See lib/pcd-seo.js.
export const metadata = { ...PRIVATE_PAGE_METADATA };

export default function LaunchLayout({ children }) {
  return children;
}
