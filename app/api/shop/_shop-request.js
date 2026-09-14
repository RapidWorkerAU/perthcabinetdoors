// What the shop's two endpoints accept, declared once.
//
// A shop line is a quote builder line plus the two things only the shop asks
// (which product page, and the hinges we supply). Everything is re-checked on
// the server by lib/pcd-shop.js; this only refuses what is not even the right
// shape, so a bad request fails loudly here rather than oddly further in.

import { z } from "zod";

const size = z.union([z.number(), z.string()]).optional();

export const shopLineSchema = z.object({
  id: z.string().max(80),
  product: z.string().max(40),
  panelUse: z.string().max(40).optional(),
  thickness: z.string().max(10).optional(),
  colourLibraryId: z.string().max(60).optional(),
  height: size,
  width: size,
  qty: z.union([z.number(), z.string()]),
  bandedEdges: z.array(z.string().max(10)).max(4).nullable().optional(),
  preDrill: z.boolean().optional(),
  holeType: z.string().max(40).optional(),
  hingeQty: z.string().max(20).optional(),
  hingeSide: z.string().max(10).optional(),
  hingeFromBottomMm: size,
  hingeFromTopMm: size,
  hingeMiddlesMm: z.array(z.union([z.number(), z.string()])).max(6).optional(),
  hingeMiddlesTouched: z.boolean().optional(),
  supplyHinges: z.boolean().optional(),
  hingeHardwareId: z.string().max(60).optional(),
});

export const priceRequestSchema = z.object({
  lines: z.array(shopLineSchema).max(100),
  postcode: z.string().max(10).optional(),
});

export const checkoutRequestSchema = z.object({
  lines: z.array(shopLineSchema).min(1).max(100),
  details: z.object({
    name: z.string().max(120),
    email: z.string().max(200),
    phone: z.string().max(40),
    street: z.string().max(200),
    suburb: z.string().max(80),
    postcode: z.string().max(10),
  }),
  expectedTotalIncGst: z.number().nullable().optional(),
  previousQuoteId: z.string().max(60).optional(),
});
