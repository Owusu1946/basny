import type { Context as ApiContext } from "@basny-web/api/context";
import type { Context as HonoContext } from "hono";

import { db } from "./services";
import { auth } from "./services";
import { publishAccountEvent, publishOrderEvent, publishPublicCatalogueEvent, publishStaffEvent } from "./realtime";
import { ENV } from "./env.server";

export type CreateContextOptions = {
  context: HonoContext;
};

export async function createContext({ context }: CreateContextOptions): Promise<ApiContext> {
  const session = await auth.api.getSession({
    headers: context.req.raw.headers,
  });
  return {
    db,
    session,
    publishAccountEvent,
    publishStaffEvent,
    publishPublicCatalogueEvent,
    revalidatePublicCatalogue: async () => {
      if (!ENV.CATALOGUE_REVALIDATE_URL || !ENV.CATALOGUE_REVALIDATE_SECRET) return;
      try {
        await fetch(ENV.CATALOGUE_REVALIDATE_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${ENV.CATALOGUE_REVALIDATE_SECRET}` },
          signal: AbortSignal.timeout(3000),
        });
      } catch {
        // Cache expiry and realtime client invalidation provide recovery if Vercel is unreachable.
      }
    },
    publishOrderEvent,
    paystack: {
      secretKey: ENV.PAYSTACK_SECRET_KEY,
      publicKey: ENV.PAYSTACK_PUBLIC_KEY,
      encryptionKey: ENV.PAYSTACK_CONFIG_ENCRYPTION_KEY,
      callbackUrl: `${ENV.CORS_ORIGIN.split(",")[0]!.trim().replace(/\/$/, "")}/checkout/payment/callback`,
    },
    integrationSetup: {
      transactionalEmail: Boolean(ENV.RESEND_API_KEY),
      emailSender: Boolean(ENV.RESEND_FROM_EMAIL),
      realtime: Boolean(ENV.ABLY_API_KEY),
      productImageStorage: Boolean(ENV.AWS_ENDPOINT_URL_S3 && ENV.AWS_ACCESS_KEY_ID && ENV.AWS_SECRET_ACCESS_KEY && ENV.AWS_REGION && ENV.NEON_OBJECT_STORAGE_BUCKET),
      catalogueCacheRevalidation: Boolean(ENV.CATALOGUE_REVALIDATE_URL && ENV.CATALOGUE_REVALIDATE_SECRET),
    },
    email: { apiKey: ENV.RESEND_API_KEY, from: ENV.RESEND_FROM_EMAIL },
    storeUrl: ENV.CORS_ORIGIN.split(",")[0]!.trim().replace(/\/$/, ""),
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
