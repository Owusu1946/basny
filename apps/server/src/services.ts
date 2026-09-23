import { createAuth } from "@basny-web/auth";
import { createDb } from "@basny-web/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);
