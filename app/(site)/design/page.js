import PublicDesignClient from "./PublicDesignClient";

// The planner is not kitchen-only: people lay out laundries, wardrobes, offices
// and living room storage in it. The copy names a few rooms rather than
// assuming one, so nobody bounces thinking it will not suit their job.
export const metadata = {
  title: "Design your space | Perth Cabinet Doors",
  description:
    "Lay out a kitchen, laundry, wardrobe or any room, try door and benchtop colours, and see it in 3D. Free, no account needed.",
};

// Full-bleed, app-like planner. It renders its own fixed full-screen shell, so
// the page itself adds no site nav or header chrome.
export default function PublicDesignPage() {
  return <PublicDesignClient />;
}
