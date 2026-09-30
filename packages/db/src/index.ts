import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

import type { DatabaseConfig } from "./config";
import { relations } from "./relations";

// The HTTP transport is ideal for isolated queries, but does not support
// Drizzle's interactive transactions. Catalogue writes replace a product and
// its variants/media atomically, so use Neon Pool over WebSockets in the Node
// API process.
neonConfig.webSocketConstructor = ws;

export function createDb(env: DatabaseConfig) {
  const client = new Pool({ connectionString: env.DATABASE_URL });
  return drizzle({ client, relations });
}

export type Database = ReturnType<typeof createDb>;
