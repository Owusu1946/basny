import { appRouter } from "@basny-web/api/routers/index";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { createContext } from "./context";
import { ENV } from "./env.server";
import { auth } from "./services";
import { createOrderRealtimeToken, createPublicCatalogueRealtimeToken, createUserRealtimeToken, isRealtimeConfigured, publishAccountEvent, publishOrderEvent, publishPublicCatalogueEvent, publishStaffEvent } from "./realtime";
import { db } from "./services";
import { customerOrder, paymentTransaction } from "@basny-web/db/schema/customer";
import { staffRole } from "@basny-web/db/schema/staff";
import { eq } from "drizzle-orm";
import { getPaystackCredentials, verifyPaystackTransaction } from "@basny-web/api/paystack";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { expirePendingOrderReservations } from "@basny-web/api/inventory-reservations";
import { deliverRestockAlerts } from "@basny-web/api/restock";
import type { Context as ApiContext } from "@basny-web/api/context";

const app = new Hono();

const workerContext: ApiContext = {
  db, session: null, publishAccountEvent, publishStaffEvent, publishPublicCatalogueEvent, publishOrderEvent,
  revalidatePublicCatalogue: async () => {
    if (!ENV.CATALOGUE_REVALIDATE_URL || !ENV.CATALOGUE_REVALIDATE_SECRET) return;
    try { await fetch(ENV.CATALOGUE_REVALIDATE_URL, { method: "POST", headers: { Authorization: `Bearer ${ENV.CATALOGUE_REVALIDATE_SECRET}` }, signal: AbortSignal.timeout(3000) }); } catch { /* expiry and realtime invalidation recover */ }
  },
  paystack: { secretKey: ENV.PAYSTACK_SECRET_KEY, publicKey: ENV.PAYSTACK_PUBLIC_KEY, encryptionKey: ENV.PAYSTACK_CONFIG_ENCRYPTION_KEY, callbackUrl: `${ENV.CORS_ORIGIN.split(",")[0]!.trim().replace(/\/$/, "")}/checkout/payment/callback` },
  integrationSetup: { transactionalEmail: Boolean(ENV.RESEND_API_KEY), emailSender: Boolean(ENV.RESEND_FROM_EMAIL), realtime: Boolean(ENV.ABLY_API_KEY), productImageStorage: Boolean(ENV.AWS_ENDPOINT_URL_S3 && ENV.AWS_ACCESS_KEY_ID && ENV.AWS_SECRET_ACCESS_KEY && ENV.AWS_REGION && ENV.NEON_OBJECT_STORAGE_BUCKET), catalogueCacheRevalidation: Boolean(ENV.CATALOGUE_REVALIDATE_URL && ENV.CATALOGUE_REVALIDATE_SECRET) },
  email: { apiKey: ENV.RESEND_API_KEY, from: ENV.RESEND_FROM_EMAIL },
  storeUrl: ENV.CORS_ORIGIN.split(",")[0]!.trim().replace(/\/$/, ""),
};
const inventoryAndRestockWorker = setInterval(() => {
  void expirePendingOrderReservations(workerContext).catch((error) => console.error("Inventory reservation expiry worker failed", error));
  void deliverRestockAlerts(workerContext).catch((error) => console.error("Restock email worker failed", error));
}, 30_000);
inventoryAndRestockWorker.unref();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: ENV.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/*", async (c) => auth.handler(c.req.raw));

app.post("/api/admin/catalogue/images", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user || !session.user.emailVerified) return c.json({ error: "Sign in with a verified staff account to upload product images." }, 401);
  const [staff] = await db.select({ role: staffRole.role }).from(staffRole).where(eq(staffRole.userId, session.user.id)).limit(1);
  if (!staff || !["content_editor", "super_admin"].includes(staff.role)) return c.json({ error: "You do not have permission to upload catalogue images." }, 403);
  const { AWS_ENDPOINT_URL_S3, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, NEON_OBJECT_STORAGE_BUCKET } = ENV;
  if (!AWS_ENDPOINT_URL_S3 || !AWS_REGION || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !NEON_OBJECT_STORAGE_BUCKET) return c.json({ error: "Product image storage is not configured yet." }, 503);
  let file: File;
  try {
    const form = await c.req.formData();
    const value = form.get("file");
    if (!(value instanceof File)) return c.json({ error: "Choose an image file to upload." }, 400);
    file = value;
  } catch { return c.json({ error: "Could not read the uploaded image." }, 400); }
  if (file.size < 1 || file.size > 12 * 1024 * 1024) return c.json({ error: "Choose an image smaller than 12 MB." }, 413);
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
  if (!allowedTypes.has(file.type)) return c.json({ error: "Use a JPG, PNG, WebP, or AVIF image." }, 415);
  try {
    const input = Buffer.from(await file.arrayBuffer());
    const metadata = await sharp(input, { limitInputPixels: 40_000_000 }).metadata();
    if (!["jpeg", "png", "webp", "avif"].includes(metadata.format ?? "") || !metadata.width || !metadata.height) return c.json({ error: "This image format is not supported." }, 415);
    const id = crypto.randomUUID();
    const client = new S3Client({ endpoint: AWS_ENDPOINT_URL_S3, region: AWS_REGION, forcePathStyle: true, credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY } });
    const variants = [
      { name: "thumbnail", width: 320 },
      { name: "listing", width: 900 },
      { name: "detail", width: 1600 },
    ] as const;
    const publicBase = `${AWS_ENDPOINT_URL_S3.replace(/\/$/, "")}/${NEON_OBJECT_STORAGE_BUCKET}`;
    const urls: Record<(typeof variants)[number]["name"], string> = { thumbnail: "", listing: "", detail: "" };
    await Promise.all(variants.map(async ({ name, width }) => {
      const key = `products/${id}/${name}.webp`;
      const output = await sharp(input, { limitInputPixels: 40_000_000 }).rotate().resize({ width, height: width, fit: "inside", withoutEnlargement: true }).webp({ quality: name === "detail" ? 84 : 80, effort: 5 }).toBuffer();
      await client.send(new PutObjectCommand({ Bucket: NEON_OBJECT_STORAGE_BUCKET, Key: key, Body: output, ContentType: "image/webp", CacheControl: "public, max-age=31536000, immutable" }));
      urls[name] = `${publicBase}/${key}`;
    }));
    return c.json({ media: { objectKey: `products/${id}`, url: urls.listing, thumbnailUrl: urls.thumbnail, detailUrl: urls.detail, width: metadata.width, height: metadata.height } }, 201, { "Cache-Control": "no-store" });
  } catch (error) {
    console.error("Catalogue image upload failed", error);
    return c.json({ error: "The image could not be processed or stored. Please try again." }, 500);
  }
});

app.post("/api/paystack/webhook", async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header("x-paystack-signature");
  if (!signature || signature.length !== 128 || !/^[a-f0-9]{128}$/i.test(signature) || rawBody.length > 256_000) return c.text("Invalid webhook", 400);
  const context = await createContext({ context: c });
  let secretKey: string;
  try { ({ secretKey } = await getPaystackCredentials(context)); } catch { return c.text("Webhook configuration unavailable", 503); }
  if (!secretKey) return c.text("Webhook configuration unavailable", 503);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secretKey), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const digest = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody))), (byte) => byte.toString(16).padStart(2, "0")).join("");
  let difference = digest.length ^ signature.length;
  for (let index = 0; index < Math.max(digest.length, signature.length); index += 1) difference |= (digest.charCodeAt(index) || 0) ^ (signature.charCodeAt(index) || 0);
  if (difference !== 0) return c.text("Invalid signature", 401);
  let event: { event?: string; data?: { reference?: string } };
  try { event = JSON.parse(rawBody); } catch { return c.text("Invalid JSON", 400); }
  if (event.event === "charge.success" && event.data?.reference) {
    const [ours] = await db.select({ id: paymentTransaction.id }).from(paymentTransaction).where(eq(paymentTransaction.reference, event.data.reference)).limit(1);
    if (!ours) return c.body(null, 200);
    try { await verifyPaystackTransaction(context, event.data.reference); }
    catch (error) { console.error("Paystack webhook verification failed", error); return c.text("Verification failed", 503); }
  }
  return c.body(null, 200);
});

app.get("/api/realtime/token", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user || !session.user.emailVerified) return c.json({ error: "UNAUTHORIZED" }, 401);
  if (!isRealtimeConfigured()) return c.json({ error: "REALTIME_NOT_CONFIGURED" }, 503);
  const [staff] = await db.select({ userId: staffRole.userId }).from(staffRole).where(eq(staffRole.userId, session.user.id));
  try {
    const tokenRequest = await createUserRealtimeToken(session.user.id, Boolean(staff));
    return c.json(tokenRequest, 200, { "Cache-Control": "private, no-store" });
  } catch (error) {
    console.error("Unable to issue realtime token", error);
    return c.json({ error: "REALTIME_UNAVAILABLE" }, 503);
  }
});

app.get("/api/realtime/catalogue-token", async (c) => {
  if (!isRealtimeConfigured()) return c.json({ error: "REALTIME_NOT_CONFIGURED" }, 503);
  try {
    return c.json(await createPublicCatalogueRealtimeToken(), 200, { "Cache-Control": "public, max-age=0, must-revalidate" });
  } catch (error) {
    console.error("Unable to issue public catalogue realtime token", error);
    return c.json({ error: "REALTIME_UNAVAILABLE" }, 503);
  }
});

app.post("/api/realtime/order-token", async (c) => {
  if (!isRealtimeConfigured()) return c.json({ error: "REALTIME_NOT_CONFIGURED" }, 503);
  const body: unknown = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object" || !("reference" in body) || typeof body.reference !== "string" || !("trackingToken" in body) || typeof body.trackingToken !== "string" || body.reference.length > 40 || body.trackingToken.length !== 64) {
    return c.json({ error: "INVALID_TRACKING_CREDENTIALS" }, 400);
  }
  const { reference, trackingToken } = body;
  const [order] = await db.select({ trackingTokenHash: customerOrder.trackingTokenHash })
    .from(customerOrder)
    .where(eq(customerOrder.reference, reference))
    .limit(1);
  if (!order?.trackingTokenHash) return c.json({ error: "INVALID_TRACKING_CREDENTIALS" }, 401);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(trackingToken));
  const presentedHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  let difference = presentedHash.length ^ order.trackingTokenHash.length;
  for (let index = 0; index < Math.max(presentedHash.length, order.trackingTokenHash.length); index += 1) {
    difference |= (presentedHash.charCodeAt(index) || 0) ^ (order.trackingTokenHash.charCodeAt(index) || 0);
  }
  if (difference !== 0) return c.json({ error: "INVALID_TRACKING_CREDENTIALS" }, 401);
  try {
    return c.json(await createOrderRealtimeToken(reference), 200, { "Cache-Control": "private, no-store" });
  } catch (error) {
    console.error("Unable to issue order realtime token", error);
    return c.json({ error: "REALTIME_UNAVAILABLE" }, 503);
  }
});

export const apiHandler = new OpenAPIHandler(appRouter, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

export const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

app.use("/*", async (c, next) => {
  const context = await createContext({ context: c });

  const rpcResult = await rpcHandler.handle(c.req.raw, {
    prefix: "/rpc",
    context: context,
  });

  if (rpcResult.matched) {
    return c.newResponse(rpcResult.response.body, rpcResult.response);
  }

  const apiResult = await apiHandler.handle(c.req.raw, {
    prefix: "/api-reference",
    context: context,
  });

  if (apiResult.matched) {
    return c.newResponse(apiResult.response.body, apiResult.response);
  }

  await next();
});

app.get("/health", (c) => {
  return c.json({ status: "ok", uptimeSeconds: Math.floor(process.uptime()) }, 200, { "Cache-Control": "no-store" });
});

app.get("/", (c) => {
  return c.text("OK");
});

import { serve } from "@hono/node-server";

serve(
  {
    fetch: app.fetch,
    hostname: "0.0.0.0",
    port: Number(ENV.PORT || 3000),
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);
