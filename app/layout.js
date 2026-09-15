import "./globals.css";

import ClearLaunchAccessCookie from "./ClearLaunchAccessCookie";
import { SITE_URL } from "@/lib/pcd-seo";

export const metadata = {
  // METADATABASE IS WHAT MAKES EVERY OTHER URL ON THE SITE ABSOLUTE.
  //
  // Canonical tags and Open Graph images have to be absolute addresses. Without
  // this, Next resolves them against localhost at build time and warns, and the
  // tags ship pointing at a machine nobody can reach. Every page that sets a
  // canonical or an image is relying on this one line. See lib/pcd-seo.js.
  metadataBase: new URL(SITE_URL),
  title: "Perth Cabinet Doors",
  description: "Custom cabinet doors made in Perth",
  icons: {
    icon: "/images/favicon.ico",
    shortcut: "/images/favicon.ico",
    apple: "/images/favicon.ico",
  },
  // The default card for anything that does not set its own, so a link pasted
  // into a message is never a bare blue string.
  openGraph: {
    type: "website",
    siteName: "Perth Cabinet Doors",
    locale: "en_AU",
    url: "/",
    title: "Perth Cabinet Doors",
    description: "Custom cabinet doors made in Perth",
    images: [{ url: "/images/kitchen.jpg", width: 1200, height: 630, alt: "Perth Cabinet Doors" }],
  },
  twitter: { card: "summary_large_image" },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    // suppressHydrationWarning on <html> ONLY.
    //
    // Browser extensions write their own attributes onto <html> before React
    // loads — a screen recorder adding data-scribe-recorder-ready is the one
    // that turns up in our console. React then compares the server HTML to what
    // it finds, sees an attribute it never rendered, and warns on every load.
    // Nothing in this codebase sets it and nothing can stop an extension doing
    // it, so the warning is pure noise that trains people to ignore the console.
    //
    // Scoped deliberately to this one element: it silences attribute mismatches
    // on <html> and nothing else, so a real hydration bug anywhere inside the
    // app still shouts exactly as loudly as before.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script async src="https://www.googletagmanager.com/gtag/js?id=AW-17868932250" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'AW-17868932250');
`,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Montserrat:wght@500;600;700&family=Source+Sans+3:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ClearLaunchAccessCookie />
        {children}
      </body>
    </html>
  );
}
