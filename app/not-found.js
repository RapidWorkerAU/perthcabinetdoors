import PublicNotFound, { notFoundMetadata } from "@/components/public/PublicNotFound";

// THE 404 FOR A URL THAT MATCHES NO ROUTE AT ALL.
//
// Which is most wrong turns, and every dead link from outside the site. Next
// uses a different not-found boundary for this than for a notFound() raised
// inside a route group, and only the group one existed, so until now a plain
// wrong address got Next's own bare "404: This page could not be found." on a
// white page with no nav, no branding and no way onwards.
//
// The page is the same one the site group shows. See
// components/public/PublicNotFound.
//
// NO VISIT MARKER HERE, and none is needed. This boundary renders inside the
// root layout only, so app/(site)/layout.js and the SiteTracker it mounts never
// run, and there is nothing to tell not to count. The marker in
// app/(site)/not-found.js is the one that matters, and the note there explains
// why.

export const metadata = notFoundMetadata;

export default function RootNotFound() {
  return <PublicNotFound />;
}
