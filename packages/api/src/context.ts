import type { Session } from "@basny-web/auth";
import type { Database } from "@basny-web/db";

export type Context = {
  session: Session | null;
  db: Database;
};
