import { eq } from "drizzle-orm";
import { z } from "zod";
import { adminSetting } from "@basny-web/db/schema/admin";
import type { OrderLineRecord } from "@basny-web/db/schema/customer";
import type { Context } from "./context";

const notificationConfig = z.object({
  options: z.array(z.object({ id: z.string(), enabled: z.boolean() })),
  recipients: z.string().max(1000).default(""),
  fromName: z.string().trim().max(120).default("BASNY Enterprise"),
});
type Notification = { event: string; recipient: "team" | "customer"; email?: string; subject: string; lines: string[] };

type OrderEmail = {
  event: "customer-order-placed" | "customer-order-status";
  name: string;
  email: string;
  reference: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  fulfillment: "delivery" | "pickup";
  address: string;
  town: string;
  region: string;
  note: string;
  lines: OrderLineRecord[];
  subtotalGhs: number;
  promotionDiscountGhs: number;
  discountGhs: number;
  discountCode: string | null;
  deliveryGhs: number;
  totalGhs: number;
  trackingToken?: string;
  updatedAt?: Date;
};

const orderStatusLabels: Record<string, string> = {
  pending_payment: "Awaiting payment", confirmed: "Confirmed", processing: "Being prepared",
  ready_for_delivery: "Ready for delivery", out_for_delivery: "On its way", delivered: "Delivered", cancelled: "Cancelled",
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const money = (amount: number) => `GHS ${amount.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function orderEmailMarkup(order: OrderEmail, link: string | null, placed: boolean) {
  const name = escapeHtml(order.name);
  const reference = escapeHtml(order.reference);
  const status = escapeHtml(orderStatusLabels[order.status] ?? order.status.replaceAll("_", " "));
  const itemRows = order.lines.map((line) => {
    const title = escapeHtml(line.name);
    const options = [line.colour, line.size].filter((value): value is string => Boolean(value)).map(escapeHtml).join(" · ");
    const imageUrl = /^https?:\/\//i.test(line.image) ? escapeHtml(line.image) : "";
    return `<tr><td style="padding:16px 0;border-bottom:1px solid #eee9e2;width:64px;vertical-align:top">${imageUrl ? `<img src="${imageUrl}" width="52" height="52" alt="" style="display:block;object-fit:cover;border-radius:4px;background:#f5f1eb">` : ""}</td><td style="padding:16px 12px;border-bottom:1px solid #eee9e2;vertical-align:top"><strong style="font-size:14px;color:#25211d">${title}</strong><div style="margin-top:5px;color:#756d64;font-size:12px">${options ? `${options} · ` : ""}Qty ${line.quantity}</div></td><td style="padding:16px 0;border-bottom:1px solid #eee9e2;text-align:right;white-space:nowrap;vertical-align:top;color:#25211d;font-size:13px">${money(line.unitPriceGhs * line.quantity)}</td></tr>`;
  }).join("");
  const discount = order.promotionDiscountGhs + order.discountGhs;
  const destination = order.fulfillment === "pickup" ? "Store pickup" : [order.address, order.town, order.region].filter(Boolean).map(escapeHtml).join(", ");
  const payment = order.paymentStatus === "paid" ? `Paid${order.paymentMethod ? ` · ${escapeHtml(order.paymentMethod)}` : ""}` : "Payment pending";
  const preheader = placed ? `We’ve received order ${reference}. Your order details are inside.` : `Order ${reference} is now ${status}. See the updated details.`;
  const heading = placed ? "Order received" : (order.status === "confirmed" && order.paymentStatus === "paid" ? "Payment confirmed" : `Your order is ${status.toLowerCase()}`);
  const intro = placed
    ? (order.paymentStatus === "paid" ? "Thank you. Your payment is confirmed and we’ve received your order." : "Thank you. We’ve received your order and saved your selections. Payment is still pending until Paystack confirms it.")
    : order.status === "cancelled" && order.paymentStatus === "paid"
      ? "Your order has been cancelled. If payment was collected, BASNY will follow up separately with refund details."
    : order.status === "confirmed" && order.paymentStatus === "paid"
      ? "Your payment has been verified. We’ll keep you updated as your order moves through fulfilment."
      : `The status of your order has changed to <strong>${status}</strong>. Your latest order summary is below.`;
  const addressLabel = order.fulfillment === "pickup" ? "Collection" : "Delivery address";
  const textLines = [
    `BASNY ENTERPRISE · ${heading}`, `Hello ${order.name},`, placed ? "We’ve received your order." : `Your order is now ${orderStatusLabels[order.status] ?? order.status}.`,
    `Order ${order.reference}`, `Payment: ${payment}`, "", ...order.lines.map((line) => `${line.name}${[line.colour, line.size].filter(Boolean).length ? ` · ${[line.colour, line.size].filter(Boolean).join(" · ")}` : ""} · Qty ${line.quantity} · ${money(line.unitPriceGhs * line.quantity)}`),
    "", `Items: ${money(order.subtotalGhs)}`, ...(discount ? [[order.discountCode ? `Discount (${order.discountCode})` : "Discount", `- ${money(discount)}`].join(": ")] : []), `Delivery: ${order.deliveryGhs === 0 ? "Complimentary" : money(order.deliveryGhs)}`, `Total: ${money(order.totalGhs)}`,
    `${addressLabel}: ${destination}`, ...(link ? ["", `View order details: ${link}`] : []), "Questions? Reply to this email and our team will help.", "Accra, Ghana · Delivery across Ghana",
  ];
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(heading)} · BASNY Enterprise</title></head><body style="margin:0;background:#f5f3ef;font-family:Arial,Helvetica,sans-serif;color:#25211d"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f3ef"><tr><td align="center" style="padding:32px 14px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fffefa;border:1px solid #e8e1d8"><tr><td style="padding:25px 30px;background:#211e1b;color:#fffefa"><div style="font-family:Georgia,'Times New Roman',serif;font-size:27px;letter-spacing:4px">BASNY</div><div style="margin-top:4px;color:#d7c8b9;font-size:10px;letter-spacing:3px">ENTERPRISE</div></td></tr><tr><td style="padding:36px 30px 16px"><p style="margin:0 0 10px;color:#80583d;font-size:11px;font-weight:bold;letter-spacing:2px">${placed ? "ORDER CONFIRMATION" : "ORDER UPDATE"}</p><h1 style="margin:0 0 12px;font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:34px;line-height:1.15">${escapeHtml(heading)}</h1><p style="margin:0;color:#625b54;font-size:15px;line-height:1.65">Hello ${name}, ${intro}</p></td></tr><tr><td style="padding:14px 30px 0"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f3ee"><tr><td style="padding:14px 16px;color:#746d65;font-size:12px">ORDER REFERENCE</td><td align="right" style="padding:14px 16px;color:#25211d;font-size:13px;font-weight:bold">${reference}</td></tr><tr><td style="padding:0 16px 14px;color:#746d65;font-size:12px">ORDER STATUS</td><td align="right" style="padding:0 16px 14px;color:#25211d;font-size:13px;font-weight:bold">${status}</td></tr></table></td></tr><tr><td style="padding:25px 30px 0"><h2 style="margin:0 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:normal">Your items</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${itemRows}</table></td></tr><tr><td style="padding:18px 30px 0"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:6px 0;color:#625b54;font-size:13px">Items</td><td align="right" style="padding:6px 0;font-size:13px">${money(order.subtotalGhs)}</td></tr>${discount ? `<tr><td style="padding:6px 0;color:#625b54;font-size:13px">Discount${order.discountCode ? ` (${escapeHtml(order.discountCode)})` : ""}</td><td align="right" style="padding:6px 0;color:#54704f;font-size:13px">− ${money(discount)}</td></tr>` : ""}<tr><td style="padding:6px 0;color:#625b54;font-size:13px">Delivery</td><td align="right" style="padding:6px 0;font-size:13px">${order.deliveryGhs === 0 ? "Complimentary" : money(order.deliveryGhs)}</td></tr><tr><td style="padding:12px 0;border-top:1px solid #dcd3c8;font-weight:bold;font-size:15px">Total</td><td align="right" style="padding:12px 0;border-top:1px solid #dcd3c8;font-weight:bold;font-size:15px">${money(order.totalGhs)}</td></tr></table></td></tr><tr><td style="padding:16px 30px 0"><h2 style="margin:0 0 6px;font-family:Georgia,'Times New Roman',serif;font-size:19px;font-weight:normal">${addressLabel}</h2><p style="margin:0;color:#625b54;font-size:13px;line-height:1.6">${escapeHtml(destination)}${order.note ? `<br><span style="color:#81796f">Note: ${escapeHtml(order.note)}</span>` : ""}</p><p style="margin:10px 0 0;color:#81796f;font-size:12px">Payment: ${payment}</p></td></tr>${link ? `<tr><td align="center" style="padding:28px 30px"><a href="${escapeHtml(link)}" style="display:inline-block;padding:14px 25px;background:#765139;color:#fffefa;text-decoration:none;font-size:14px;font-weight:bold">View order details</a></td></tr>` : ""}<tr><td style="padding:18px 30px 26px;border-top:1px solid #eee9e2;color:#81796f;font-size:11px;line-height:1.7">Questions about your order? Reply to this email and our team will help.<br><strong style="color:#51463b">BASNY Enterprise</strong> · Accra, Ghana · Delivery across Ghana</td></tr></table></td></tr></table></body></html>`;
  return { html, text: textLines.join("\n"), subject: placed ? `Order received — ${order.reference} | BASNY Enterprise` : `${heading} — ${order.reference} | BASNY Enterprise` };
}

/** Sends an order receipt or status email after the order write commits. Resend's idempotency key safely absorbs retries. */
export async function sendCustomerOrderEmail(context: Context, order: OrderEmail): Promise<void> {
  if (!context.email.apiKey || !context.email.from) return;
  try {
    const [row] = await context.db.select({ value: adminSetting.value }).from(adminSetting).where(eq(adminSetting.key, "notification-settings")).limit(1);
    const parsed = notificationConfig.safeParse(row?.value);
    const configured = parsed.success ? parsed.data.options.find((option) => option.id === order.event)?.enabled : undefined;
    if (configured === false || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.email)) return;
    const senderAddress = context.email.from.match(/<([^<>]+)>/)?.[1] ?? context.email.from;
    const fromName = parsed.success ? parsed.data.fromName.replace(/[<>\r\n]/g, "").slice(0, 120) || "BASNY Enterprise" : "BASNY Enterprise";
    const link = order.trackingToken ? `${context.storeUrl}/order-confirmation/${encodeURIComponent(order.reference)}#tracking=${encodeURIComponent(order.trackingToken)}` : null;
    const content = orderEmailMarkup(order, link, order.event === "customer-order-placed");
    const idempotencyKey = order.event === "customer-order-placed"
      ? `customer-order-placed/${order.reference}`
      : `customer-order-status/${order.reference}/${order.updatedAt?.getTime() ?? Date.now()}/${order.status}`;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let response: Response;
      try {
        response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${context.email.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
          body: JSON.stringify({ from: `${fromName} <${senderAddress}>`, to: [order.email], subject: content.subject, html: content.html, text: content.text }),
          signal: AbortSignal.timeout(5000),
        });
      } catch (error) {
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 350));
          continue;
        }
        throw error;
      }
      if (response.ok) return;
      if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
        await new Promise((resolve) => setTimeout(resolve, 350));
        continue;
      }
      console.error("BASNY customer order email failed", { event: order.event, reference: order.reference, status: response.status });
      return;
    }
  } catch (error) {
    console.error("BASNY customer order email could not be sent", { event: order.event, reference: order.reference, error: error instanceof Error ? error.message : "unknown error" });
  }
}

/** Send configured transactional notices after the database change has committed. */
export async function sendConfiguredNotification(context: Context, message: Notification): Promise<void> {
  if (!context.email.apiKey || !context.email.from) return;
  try {
    const [row] = await context.db.select({ value: adminSetting.value }).from(adminSetting).where(eq(adminSetting.key, "notification-settings")).limit(1);
    const parsed = notificationConfig.safeParse(row?.value);
    if (!parsed.success || !parsed.data.options.some((option) => option.id === message.event && option.enabled)) return;
    const to = message.recipient === "customer"
      ? (message.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.email) ? [message.email] : [])
      : [...new Set(parsed.data.recipients.split(/[;,\s]+/).map((email) => email.trim()).filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))];
    if (!to.length) return;
    const senderAddress = context.email.from.match(/<([^<>]+)>/)?.[1] ?? context.email.from;
    const fromName = parsed.data.fromName.replace(/[<>\r\n]/g, "").slice(0, 120) || "BASNY Enterprise";
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${context.email.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `${fromName} <${senderAddress}>`, to, subject: message.subject, text: ["BASNY ENTERPRISE", ...message.lines, "", "Accra, Ghana · Delivery across Ghana"].join("\n") }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) console.error("Configured BASNY notification failed", { event: message.event, status: response.status });
  } catch (error) {
    console.error("Configured BASNY notification could not be sent", { event: message.event, error: error instanceof Error ? error.message : "unknown error" });
  }
}
