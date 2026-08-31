import "./frontend.css";
import SiteTracker from "./SiteTracker";

// Every public page hangs off this layout, so this is the one place the visit
// counter has to be mounted. It renders nothing and it is deliberately not in
// app/layout.js: that one also wraps the admin, and counting ourselves reading
// our own screens would be the largest number on the panel within a week.
export default function SiteLayout({ children }) {
  return (
    <>
      <SiteTracker />
      {children}
    </>
  );
}
