import PublicDesignClient from "./PublicDesignClient";

export const metadata = {
  title: "Design your kitchen — Perth Cabinet Doors",
  description: "Lay out your kitchen, try door and benchtop colours, and see it in 3D — free, no account needed.",
};

// Full-bleed, app-like planner — it renders its own fixed full-screen shell, so
// the page itself adds no site nav/header chrome.
export default function PublicDesignPage() {
  return <PublicDesignClient />;
}
