import { requireAdminApiContext } from "../../../../lib/admin-api";
import { generateOrderForm } from "../../../../lib/pcd-order-form";

// The Excel order form, built fresh every time it is asked for.
//
// Built rather than stored on purpose. A file sitting in /public goes stale the
// first time somebody adds a colour, and a customer filling in a six month old
// copy is a customer ordering something we have stopped stocking. Reading the
// libraries on every download means the form a customer opens is the same list
// the quote editor works from.
//
// It takes about a second to build, which is fine for a button somebody presses
// a few times a week, and it is never wrong.

export const dynamic = "force-dynamic";

export async function GET() {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;

  try {
    const { buffer, fileName } = await generateOrderForm(context.supabase);
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "Could not build the order form." },
      { status: 500 }
    );
  }
}
