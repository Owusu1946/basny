import type { Session } from "@basny-web/auth";
import type { Database } from "@basny-web/db";

export type Context = {
  session: Session | null;
  db: Database;
  publishAccountEvent: (userId: string, name: string, data: Record<string, unknown>) => Promise<void>;
  publishStaffEvent: (name: string, data: Record<string, unknown>) => Promise<void>;
  publishPublicCatalogueEvent: (name: string, data: Record<string, unknown>) => Promise<void>;
  revalidatePublicCatalogue: () => Promise<void>;
  publishOrderEvent: (reference: string, name: string, data: Record<string, unknown>) => Promise<void>;
  paystack: { secretKey?: string; publicKey?: string; encryptionKey?: string; callbackUrl: string };
  integrationSetup: { transactionalEmail: boolean; emailSender: boolean; realtime: boolean; productImageStorage: boolean; catalogueCacheRevalidation: boolean };
  email: { apiKey?: string; from?: string };
  storeUrl: string;
};
