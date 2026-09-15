import { pageMetadata } from "@/lib/pcd-seo";
import PublicDesignClient from "./PublicDesignClient";

// The planner is not kitchen-only: people lay out laundries, wardrobes, offices
// and living room storage in it. The copy names a few rooms rather than
// assuming one, so nobody bounces thinking it will not suit their job.
export const metadata = {
  title: "Design your space | Perth Cabinet Doors",
  description:
    "Lay out a kitchen, laundry, wardrobe or any room, try door and benchtop colours, and see it in 3D. Free, no account needed.",
  // In the sitemap, so it carries a canonical. The planner is a tool rather
  // than a page of prose, and it is still the answer to "can I plan a kitchen
  // online", which is worth being found for. See lib/pcd-seo.js.
  ...pageMetadata({
    path: "/design",
    title: "Design your space | Perth Cabinet Doors",
    description:
      "Lay out a kitchen, laundry, wardrobe or any room, try door and benchtop colours, and see it in 3D. Free, no account needed.",
  }),
};

// Full-bleed, app-like planner. It renders its own fixed full-screen shell, so
// the page itself adds no site nav or header chrome.
export default function PublicDesignPage() {
  return <PublicDesignClient />;
}
