import type { RouterClient } from "@orpc/server";
import { randomUUID } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { adminAuditLog } from "@basny-web/db/schema/admin";
import { homeContent as homeContentTable } from "@basny-web/db/schema/content";
import { staffRole } from "@basny-web/db/schema/staff";
import type { Database } from "@basny-web/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, publicProcedure } from "../index";
import { defaultHomeContent, homeContentSchema } from "../content/home";
import { accountProcedures } from "./account";
import { catalogueProcedures } from "./catalogue";
import { inventoryProcedures } from "./inventory";
import { customerProcedures } from "./customers";
import { marketingProcedures } from "./marketing";
import { financeProcedures } from "./finance";
import { adminProcedures } from "./admin";
import { teamProcedures } from "./team";
import { reportProcedures } from "./reports";

const editorProcedure = protectedProcedure.use(async ({ context, next }) => {
  const [staff] = await context.db.select({ role: staffRole.role }).from(staffRole).where(eq(staffRole.userId, context.session.user.id));
  if (!staff || !["content_editor", "super_admin"].includes(staff.role)) {
    throw new ORPCError("FORBIDDEN");
  }
  return next();
});

const contentId = "homepage";

async function readContent(db: Database) {
  const [row] = await db.select().from(homeContentTable).where(eq(homeContentTable.id, contentId));
  return row;
}

export const appRouter = {
  ...accountProcedures,
  ...catalogueProcedures,
  ...inventoryProcedures,
  ...customerProcedures,
  ...marketingProcedures,
  ...financeProcedures,
  ...adminProcedures,
  ...teamProcedures,
  ...reportProcedures,
  healthCheck: publicProcedure.handler(() => {
    return "OK";
  }),
  privateData: protectedProcedure.handler(({ context }) => {
    return {
      message: "This is private",
      user: context.session?.user,
    };
  }),
  homeContent: publicProcedure.handler(async ({ context }) => {
    const row = await readContent(context.db);
    return row ? homeContentSchema.parse(row.published) : defaultHomeContent;
  }),
  homeContentDraft: editorProcedure.handler(async ({ context }) => {
    const row = await readContent(context.db);
    return {
      content: row ? homeContentSchema.parse(row.draft) : defaultHomeContent,
      revision: row?.revision ?? 0,
      publishedAt: row?.publishedAt?.toISOString() ?? null,
    };
  }),
  saveHomeContentDraft: editorProcedure
    .input(z.object({ content: homeContentSchema, revision: z.number().int().nonnegative() }))
    .handler(async ({ context, input }) => {
      const actor = context.session.user.id;
      return context.db.transaction(async (tx) => {
        const now = new Date();
        let nextRevision: number;
        if (input.revision === 0) {
          const [created] = await tx.insert(homeContentTable).values({
            id: contentId, draft: input.content, published: defaultHomeContent,
            revision: 1, updatedBy: actor,
            history: [{ action: "draft_saved", actor, at: now.toISOString(), revision: 1 }],
          }).onConflictDoNothing().returning({ revision: homeContentTable.revision });
          if (!created) throw new ORPCError("CONFLICT", { message: "Homepage content changed in another session. Reload before saving." });
          nextRevision = created.revision;
        } else {
          const [row] = await tx.select().from(homeContentTable).where(eq(homeContentTable.id, contentId));
          if (!row || row.revision !== input.revision) throw new ORPCError("CONFLICT", { message: "Homepage content changed in another session. Reload before saving." });
          nextRevision = row.revision + 1;
          const history = Array.isArray(row.history) ? row.history : [];
          const [saved] = await tx.update(homeContentTable).set({
            draft: input.content, revision: nextRevision, updatedBy: actor, updatedAt: now,
            history: [...history.slice(-49), { action: "draft_saved", actor, at: now.toISOString(), revision: nextRevision }],
          }).where(and(eq(homeContentTable.id, contentId), eq(homeContentTable.revision, input.revision))).returning({ revision: homeContentTable.revision });
          if (!saved) throw new ORPCError("CONFLICT", { message: "Homepage content changed in another session. Reload before saving." });
          nextRevision = saved.revision;
        }
        await tx.insert(adminAuditLog).values({ id: randomUUID(), actorId: actor, action: "storefront.homepage_draft_saved", resourceType: "home_content", resourceId: contentId, details: { revision: nextRevision } });
        return { revision: nextRevision };
      });
    }),
  publishHomeContent: editorProcedure
    .input(z.object({ revision: z.number().int().positive() }))
    .handler(async ({ context, input }) => {
      const actor = context.session.user.id;
      const result = await context.db.transaction(async (tx) => {
        const [row] = await tx.select().from(homeContentTable).where(eq(homeContentTable.id, contentId));
        if (!row || row.revision !== input.revision) throw new ORPCError("CONFLICT", { message: "Homepage content changed in another session. Reload before publishing." });
        const now = new Date();
        const nextRevision = row.revision + 1;
        const history = Array.isArray(row.history) ? row.history : [];
        const [published] = await tx.update(homeContentTable).set({
          published: homeContentSchema.parse(row.draft), revision: nextRevision,
          publishedBy: actor, publishedAt: now,
          history: [...history.slice(-49), { action: "published", actor, at: now.toISOString(), revision: nextRevision }],
        }).where(and(eq(homeContentTable.id, contentId), eq(homeContentTable.revision, input.revision))).returning({ revision: homeContentTable.revision });
        if (!published) throw new ORPCError("CONFLICT", { message: "Homepage content changed in another session. Reload before publishing." });
        await tx.insert(adminAuditLog).values({ id: randomUUID(), actorId: actor, action: "storefront.homepage_published", resourceType: "home_content", resourceId: contentId, details: { revision: published.revision } });
        return { revision: published.revision };
      });
      void context.publishPublicCatalogueEvent("storefront.changed", { key: "homepage-content", revision: result.revision }).catch(() => undefined);
      void context.revalidatePublicCatalogue().catch(() => undefined);
      return result;
    }),
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
