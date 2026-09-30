import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const expected = process.env.CATALOGUE_REVALIDATE_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!expected || !supplied) return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  revalidateTag("public-catalogue", "max");
  revalidateTag("public-store-seo", "max");
  return Response.json({ revalidated: true }, { headers: { "Cache-Control": "no-store" } });
}
