import { getQuoteConfig } from "../../../lib/quote-config";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const product = searchParams.get("product");

  const payload = await getQuoteConfig(product);

  return Response.json({ ok: true, ...payload });
}
