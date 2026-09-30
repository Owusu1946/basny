import { and, asc, eq, inArray, lte, or, sql } from "drizzle-orm";
import { catalogueProduct, catalogueProductMedia, catalogueProductVariant } from "@basny-web/db/schema/catalogue";
import { restockSubscription } from "@basny-web/db/schema/customer";
import type { Context } from "./context";

export async function hashRestockToken(token: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Queue one-time alerts only after inventory writes commit. Delivery is retried by the server worker. */
export async function queueAvailableRestockAlerts(context: Context, variantIds: string[]) {
  if (!variantIds.length) return;
  const available = await context.db.select({ id: catalogueProductVariant.id }).from(catalogueProductVariant)
    .where(and(inArray(catalogueProductVariant.id, [...new Set(variantIds)]), sql`${catalogueProductVariant.stock} - ${catalogueProductVariant.reservedStock} > 0`));
  if (!available.length) return;
  await context.db.update(restockSubscription).set({ status: "queued", nextAttemptAt: new Date(), updatedAt: new Date() })
    .where(and(inArray(restockSubscription.variantId, available.map((item) => item.id)), eq(restockSubscription.status, "active")));
}

/** A row lease plus Resend idempotency makes delivery safe across process replicas and retries. */
export async function deliverRestockAlerts(context: Pick<Context, "db" | "email" | "storeUrl">, batchSize = 20) {
  if (!context.email.apiKey || !context.email.from) return;
  for (let index = 0; index < batchSize; index += 1) {
    const claimed = await context.db.transaction(async (tx) => {
      const now = new Date();
      const [row] = await tx.select().from(restockSubscription).where(or(
        and(eq(restockSubscription.status, "queued"), lte(restockSubscription.nextAttemptAt, now)),
        and(eq(restockSubscription.status, "sending"), lte(restockSubscription.claimUntil, now)),
      )).orderBy(asc(restockSubscription.nextAttemptAt)).limit(1).for("update", { skipLocked: true });
      if (!row) return null;
      const [updated] = await tx.update(restockSubscription).set({ status: "sending", claimUntil: new Date(now.getTime() + 60_000), attempts: row.attempts + 1, updatedAt: now }).where(eq(restockSubscription.id, row.id)).returning();
      return updated ?? null;
    });
    if (!claimed) return;
    const [detail] = await context.db.select({ name: catalogueProduct.name, slug: catalogueProduct.slug, variantId: catalogueProductVariant.id, colour: catalogueProductVariant.colour, size: catalogueProductVariant.size, image: catalogueProductMedia.url })
      .from(catalogueProductVariant).innerJoin(catalogueProduct, eq(catalogueProduct.id, catalogueProductVariant.productId))
      .leftJoin(catalogueProductMedia, and(eq(catalogueProductMedia.productId, catalogueProduct.id), eq(catalogueProductMedia.sortOrder, 0)))
      .where(eq(catalogueProductVariant.id, claimed.variantId)).limit(1);
    const [stock] = await context.db.select({ available: sql<number>`${catalogueProductVariant.stock} - ${catalogueProductVariant.reservedStock}` }).from(catalogueProductVariant).where(eq(catalogueProductVariant.id, claimed.variantId)).limit(1);
    if (!detail || !stock || stock.available < 1) {
      await context.db.update(restockSubscription).set({ status: "active", claimUntil: null, updatedAt: new Date() }).where(and(eq(restockSubscription.id, claimed.id), eq(restockSubscription.status, "sending")));
      continue;
    }
    const sent = await sendRestockMail(context, claimed.email, detail, claimed.id);
    const now = new Date();
    if (sent) {
      await context.db.update(restockSubscription).set({ status: "notified", claimUntil: null, notifiedAt: now, updatedAt: now }).where(and(eq(restockSubscription.id, claimed.id), eq(restockSubscription.status, "sending")));
    } else {
      const exhausted = claimed.attempts >= 8;
      const backoffMinutes = Math.min(60 * 24, 2 ** Math.min(claimed.attempts, 10));
      await context.db.update(restockSubscription).set({ status: exhausted ? "failed" : "queued", claimUntil: null, nextAttemptAt: new Date(now.getTime() + backoffMinutes * 60_000), updatedAt: now }).where(and(eq(restockSubscription.id, claimed.id), eq(restockSubscription.status, "sending")));
    }
  }
}

async function sendRestockMail(context: Pick<Context, "email" | "storeUrl">, to: string, product: { name: string; slug: string; colour: string; size: string | null; image: string | null }, subscriptionId: string) {
  try {
    const from = context.email.from;
    const apiKey = context.email.apiKey;
    if (!from || !apiKey) return false;
    const productUrl = `${context.storeUrl}/products/${encodeURIComponent(product.slug)}`;
    const escaped = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
    const name = escaped(product.name);
    const option = [product.colour, product.size].filter(Boolean).map((part) => escaped(part!)).join(" · ");
    const image = product.image && /^https:\/\//i.test(product.image) ? `<img src="${escaped(product.image)}" width="112" height="112" alt="" style="display:block;object-fit:cover;background:#f5f1eb;border-radius:4px">` : "";
    const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f5f3ef;font-family:Arial,Helvetica,sans-serif;color:#25211d"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f3ef"><tr><td align="center" style="padding:30px 14px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fffefa;border:1px solid #e8e1d8"><tr><td style="padding:24px 30px;background:#211e1b;color:#fffefa;font-family:Georgia,serif;font-size:26px;letter-spacing:4px">BASNY <span style="font-family:Arial,sans-serif;font-size:10px;letter-spacing:3px">ENTERPRISE</span></td></tr><tr><td style="padding:34px 30px 12px"><p style="margin:0 0 10px;color:#80583d;font-size:11px;font-weight:bold;letter-spacing:2px">BACK IN STOCK</p><h1 style="margin:0 0 12px;font-family:Georgia,serif;font-size:32px;font-weight:normal">It’s available again.</h1><p style="margin:0;color:#625b54;font-size:15px;line-height:1.65">The item you asked us to watch is back. We wanted to let you know while it’s available.</p></td></tr><tr><td style="padding:18px 30px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f3ee"><tr><td width="128" style="padding:12px">${image}</td><td style="padding:12px 16px"><strong style="font-family:Georgia,serif;font-size:21px;font-weight:normal">${name}</strong><p style="margin:7px 0 0;color:#756d64;font-size:13px">${option}</p></td></tr></table></td></tr><tr><td align="center" style="padding:10px 30px 32px"><a href="${escaped(productUrl)}" style="display:inline-block;padding:14px 24px;background:#765139;color:#fffefa;text-decoration:none;font-size:14px;font-weight:bold">View item</a></td></tr><tr><td style="padding:18px 30px 24px;border-top:1px solid #eee9e2;color:#81796f;font-size:12px;line-height:1.7">This one-time restock alert was sent because you asked BASNY to notify you. Availability can change as orders are placed.<br><strong style="color:#51463b">BASNY Enterprise</strong> · Accra, Ghana</td></tr></table></td></tr></table></body></html>`;
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `restock-alert/${subscriptionId}` }, body: JSON.stringify({ from, to: [to], subject: `Back in stock: ${product.name} | BASNY Enterprise`, html, text: `The item you asked us to watch is back in stock.\n\n${product.name}${option ? ` · ${option}` : ""}\nView it: ${productUrl}\n\nAvailability can change as orders are placed.\nBASNY Enterprise · Accra, Ghana` }), signal: AbortSignal.timeout(8000) });
    if (!response.ok) console.error("BASNY restock alert email failed", { subscriptionId, status: response.status });
    return response.ok;
  } catch (error) {
    console.error("BASNY restock alert email could not be sent", { subscriptionId, error: error instanceof Error ? error.message : "unknown error" });
    return false;
  }
}

export async function sendRestockConfirmation(context: Pick<Context, "email" | "storeUrl">, email: string, product: { name: string; slug: string; colour: string; size: string | null }, token: string) {
  if (!context.email.apiKey || !context.email.from) return false;
  try {
    const url = `${context.storeUrl}/restock/confirm?token=${encodeURIComponent(token)}`;
    const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${context.email.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `restock-confirm/${await hashRestockToken(token)}` }, body: JSON.stringify({ from: context.email.from, to: [email], subject: `Confirm your BASNY restock alert`, html: `<!doctype html><html lang="en"><body style="margin:0;background:#f5f3ef;font-family:Arial,Helvetica,sans-serif;color:#25211d"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f3ef"><tr><td align="center" style="padding:30px 14px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fffefa;border:1px solid #e8e1d8"><tr><td style="padding:24px 30px;background:#211e1b;color:#fffefa;font-family:Georgia,serif;font-size:26px;letter-spacing:4px">BASNY</td></tr><tr><td style="padding:34px 30px"><p style="margin:0 0 10px;color:#80583d;font-size:11px;font-weight:bold;letter-spacing:2px">RESTOCK ALERT</p><h1 style="margin:0 0 12px;font-family:Georgia,serif;font-size:30px;font-weight:normal">Confirm your request</h1><p style="margin:0 0 24px;color:#625b54;font-size:15px;line-height:1.6">Confirm that you want one email when <strong>${escapeHtml(product.name)}</strong>${product.size ? ` (${escapeHtml(product.colour)} · EU ${escapeHtml(product.size)})` : ` (${escapeHtml(product.colour)})`} is available again.</p><a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 24px;background:#765139;color:#fffefa;text-decoration:none;font-size:14px;font-weight:bold">Confirm restock alert</a><p style="margin:22px 0 0;color:#81796f;font-size:12px;line-height:1.6">If you didn’t request this alert, you can ignore this email.</p></td></tr><tr><td style="padding:18px 30px;border-top:1px solid #eee9e2;color:#81796f;font-size:12px">BASNY Enterprise · Accra, Ghana</td></tr></table></td></tr></table></body></html>`, text: `Please confirm you want one email when ${product.name} (${product.colour}${product.size ? ` · EU ${product.size}` : ""}) is available again.\n\nConfirm: ${url}\n\nIf you did not request this, ignore this email.\nBASNY Enterprise · Accra, Ghana` }), signal: AbortSignal.timeout(8000) });
    return response.ok;
  } catch (error) {
    console.error("BASNY restock confirmation could not be sent", { error: error instanceof Error ? error.message : "unknown error" });
    return false;
  }
}
