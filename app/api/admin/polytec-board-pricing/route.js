// The Polytec decorative board rate card: read by the web shop to price every
// decorative board piece, and edited in Settings. One row, cleaned both ways by
// lib/pcd-polytec-board-pricing.js.

import { requireAdminApiContext } from "../../../../lib/admin-api";
import {
  POLYTEC_BOARD_SQL_FILE,
  getPolytecBoardCard,
  savePolytecBoardCard,
} from "../../../../lib/pcd-polytec-board-pricing-store";

export async function GET() {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;
  try {
    const result = await getPolytecBoardCard(context.supabase);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Could not load the decorative board rate card." }, { status: 500 });
  }
}

export async function PUT(request) {
  const context = await requireAdminApiContext();
  if (context.error) return context.error;
  try {
    const payload = await request.json();
    const result = await savePolytecBoardCard(context.supabase, payload?.card || {});
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message = error?.message?.includes("pcd_polytec_board_pricing")
      ? `The decorative board rate card table is not there yet. Run ${POLYTEC_BOARD_SQL_FILE}.`
      : error?.message || "Could not save the decorative board rate card.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
