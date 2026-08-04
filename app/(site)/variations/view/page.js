import VariationApprovalClient from "../VariationApprovalClient";

export const metadata = {
  title: "Order Variation | Perth Cabinet Doors",
};

export default function VariationViewPage() {
  return (
    <main className="min-h-screen bg-[#f5f8f4] px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <VariationApprovalClient />
      </div>
    </main>
  );
}
