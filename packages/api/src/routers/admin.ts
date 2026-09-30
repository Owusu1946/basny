import { randomUUID } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { adminAuditLog, adminSetting } from "@basny-web/db/schema/admin";
import { staffRole } from "@basny-web/db/schema/staff";
import { user } from "@basny-web/db/schema/auth";
import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../index";

const settingKeys = [
  "homepage-slides", "store-pages", "store-navigation", "delivery-zones", "store-payments",
  "store-settings", "store-seo-social", "notification-settings", "integration-settings", "store-localization",
] as const;
const settingKey = z.enum(settingKeys);

const storefrontKeys = new Set<string>([
  "homepage-slides", "store-pages", "store-navigation", "store-seo-social",
]);
const publicSettingKeys = new Set<string>([
  "homepage-slides", "store-pages", "store-navigation", "delivery-zones", "store-payments", "store-settings", "store-seo-social",
]);
const auditReadRoles = ["super_admin"] as const;
const publicDeliveryZone = z.object({ id: z.string().max(100), name: z.string().trim().min(1).max(100), area: z.string().trim().max(100), feeGhs: z.number().int().nonnegative().max(100000), estimate: z.string().max(100), active: z.boolean(), group: z.enum(["Accra", "Outside Accra"]) });
const defaultDeliveryZones = [
  ...["Osu", "East Legon", "Madina", "Adenta", "Dansoman", "Kaneshie", "Spintex", "Labone", "Cantonments", "Airport", "Achimota", "Accra Central"].map((name, index) => ({ id: `DZ-${index + 1}`, name, area: "Greater Accra", feeGhs: 60, estimate: "1–3 business days", active: true, group: "Accra" as const })),
  ...["Ashanti", "Central", "Eastern", "Western", "Western North", "Volta", "Oti", "Northern", "Savannah", "North East", "Upper East", "Upper West", "Bono", "Bono East", "Ahafo"].map((name, index) => ({ id: `DZ-${index + 13}`, name, area: name, feeGhs: 100, estimate: "2–5 business days", active: true, group: "Outside Accra" as const })),
];
const publicStoreSchema = z.object({ pickupEnabled: z.boolean().default(true), pickupAddress: z.string().max(200).default("Shop 12, Oxford Street, Osu, Accra, Ghana"), freeDeliveryThresholdGhs: z.number().int().nonnegative().default(0) });
const publicStoreProfileSchema = z.object({ name: z.string().trim().min(1).max(120), phone: z.string().max(40), whatsapp: z.string().max(40), email: z.string().email().max(254), address: z.string().max(300), addressIsVerified: z.boolean() });

export async function readPublicDeliverySettings(db: import("@basny-web/db").Database) {
  const rows = await db.select({ key: adminSetting.key, value: adminSetting.value }).from(adminSetting).where(or(
    eq(adminSetting.key, "delivery-zones"), eq(adminSetting.key, "store-settings"), eq(adminSetting.key, "store-payments"),
  ));
  const stored = new Map(rows.map((row) => [row.key, row.value]));
  const zones = z.array(publicDeliveryZone).safeParse(stored.get("delivery-zones"));
  const store = publicStoreSchema.safeParse(stored.get("store-settings"));
  const methods = z.array(z.object({ id: z.string().max(100), name: z.string().max(100), type: z.enum(["Gateway", "Manual", "Pickup"]), enabled: z.boolean() })).safeParse(stored.get("store-payments"));
  return {
    deliveryZones: (zones.success ? zones.data : defaultDeliveryZones).filter((zone) => zone.active),
    store: store.success ? store.data : publicStoreSchema.parse({}),
    paymentMethods: (methods.success ? methods.data : [{ id: "paystack", name: "Paystack", type: "Gateway" as const, enabled: true }, { id: "pay-on-pickup", name: "Pay on pickup", type: "Pickup" as const, enabled: false }]).filter((method) => method.enabled),
  };
}

const staffProcedure = protectedProcedure.use(async ({ context, next }) => {
  const [staff] = await context.db.select({ role: staffRole.role }).from(staffRole).where(eq(staffRole.userId, context.session.user.id)).limit(1);
  if (!staff) throw new ORPCError("FORBIDDEN");
  return next({ context: { staffRole: staff.role } });
});

const jsonValue = z.unknown().superRefine((value, issue) => {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined || serialized.length > 500_000) issue.addIssue({ code: "custom", message: "Configuration must be JSON data under 500 KB." });
  } catch {
    issue.addIssue({ code: "custom", message: "Configuration must be JSON serializable." });
  }
});

const routePath = z.string().trim().regex(/^\/(?!\/)[a-zA-Z0-9/_-]*$/).max(180);
const storeSeoSocialSchema = z.object({ siteTitle: z.string().max(180), siteDescription: z.string().max(320), instagram: z.string().max(500), facebook: z.string().max(500), tiktok: z.string().max(500), analyticsId: z.string().max(120), metaPixelId: z.string().max(120), analyticsConsent: z.boolean(), analyticsEvents: z.record(z.string(), z.boolean()), canonicalBaseUrl: z.string().max(300), indexingEnabled: z.boolean(), sitemapProducts: z.boolean(), sitemapCategories: z.boolean(), sitemapPages: z.boolean(), productStructuredData: z.boolean(), localBusinessStructuredData: z.boolean(), redirects: z.array(z.object({ id: z.string().max(100), from: routePath, to: routePath, active: z.boolean() })).max(100) });
const settingSchemas = {
  "homepage-slides": z.array(z.object({ id: z.string().max(100), eyebrow: z.string().max(60), title: z.string().max(120), description: z.string().max(240), image: z.string().startsWith("/").max(500), imageAlt: z.string().max(180), primaryLabel: z.string().max(60), primaryHref: routePath, secondaryLabel: z.string().max(60), secondaryHref: routePath, active: z.boolean() })).min(1).max(8),
  "store-pages": z.array(z.object({ slug: z.string().regex(/^[a-z0-9-]{1,80}$/), title: z.string().trim().min(1).max(120), summary: z.string().max(300), body: z.string().max(100_000), status: z.enum(["Published", "Draft"]), metaTitle: z.string().max(180), metaDescription: z.string().max(320) })).max(100),
  "store-navigation": z.array(z.object({ id: z.string().max(100), label: z.string().trim().min(1).max(60), href: routePath, active: z.boolean() })).max(30),
  "delivery-zones": z.array(z.object({ id: z.string().max(100), name: z.string().trim().min(1).max(100), area: z.string().max(100), feeGhs: z.number().int().nonnegative().max(100_000), estimate: z.string().max(100), active: z.boolean(), group: z.enum(["Accra", "Outside Accra"]) })).max(200),
  "store-payments": z.array(z.object({ id: z.string().max(100), name: z.string().max(100), type: z.enum(["Gateway", "Manual", "Pickup"]), enabled: z.boolean(), note: z.string().max(500) })).max(20),
  "store-settings": z.object({ name: z.string().trim().min(1).max(120), phone: z.string().max(40), whatsapp: z.string().max(40), email: z.string().email().max(254), address: z.string().max(300), addressIsVerified: z.boolean(), currency: z.literal("GHS"), locale: z.literal("en-GH"), timezone: z.literal("Africa/Accra"), freeDeliveryThresholdGhs: z.number().int().nonnegative().max(2_000_000), pickupEnabled: z.boolean(), pickupAddress: z.string().max(300), returnWindowDays: z.number().int().min(1).max(60), changeMindReturnDelivery: z.enum(["Customer pays", "BASNY pays"]), defectReturnDelivery: z.enum(["Customer pays", "BASNY pays"]), refundProcessingBusinessDays: z.number().int().min(1).max(30) }),
  "store-seo-social": storeSeoSocialSchema.superRefine((seo, issue) => {
    const redirects = new Map(seo.redirects.filter((row) => row.active).map((row) => [row.from, row.to]));
    for (const source of redirects.keys()) {
      const seen = new Set<string>(); let current: string | undefined = source;
      while (current && redirects.has(current)) { if (seen.has(current)) { issue.addIssue({ code: "custom", message: "Redirects cannot form a loop." }); return; } seen.add(current); current = redirects.get(current); }
    }
  }),
  "notification-settings": z.object({ options: z.array(z.object({ id: z.string().max(100), label: z.string().max(120), detail: z.string().max(300), enabled: z.boolean() })).max(50), recipients: z.string().max(1000), fromName: z.string().max(120) }),
  "integration-settings": z.record(z.string().max(80), z.object({ connected: z.boolean(), publicId: z.string().max(200) })),
  "store-localization": z.object({ currency: z.literal("GHS"), locale: z.literal("en-GH"), timeZone: z.literal("Africa/Accra"), taxMode: z.enum(["Not configured", "Prices exclude tax", "Prices include tax"]), taxRate: z.string().max(12), taxLabel: z.string().max(40) }),
} satisfies Record<(typeof settingKeys)[number], z.ZodType>;
const publicSeoSchema = storeSeoSocialSchema.pick({ siteTitle: true, siteDescription: true, canonicalBaseUrl: true, indexingEnabled: true, sitemapProducts: true, sitemapCategories: true, sitemapPages: true, productStructuredData: true, localBusinessStructuredData: true, instagram: true, facebook: true, tiktok: true });

export const adminProcedures = {
  adminIntegrationStatus: staffProcedure.handler(({ context }) => {
    if (context.staffRole !== "super_admin") throw new ORPCError("FORBIDDEN");
    return context.integrationSetup;
  }),
  getPublicStoreSeoSettings: publicProcedure.handler(async ({ context }) => {
    const [row] = await context.db.select({ value: adminSetting.value }).from(adminSetting).where(eq(adminSetting.key, "store-seo-social")).limit(1);
    const parsed = publicSeoSchema.safeParse(row?.value);
    return parsed.success ? parsed.data : {
      siteTitle: "BASNY Enterprise | Shoes, Bags & Accessories",
      siteDescription: "Thoughtful shoes, bags and accessories. Based in Accra, Ghana. Delivery across Ghana.",
      canonicalBaseUrl: "", indexingEnabled: false, sitemapProducts: true, sitemapCategories: true, sitemapPages: true,
      productStructuredData: true, localBusinessStructuredData: false, instagram: "", facebook: "", tiktok: "",
    };
  }),
  getPublicStoreProfile: publicProcedure.handler(async ({ context }) => {
    const [row] = await context.db.select({ value: adminSetting.value }).from(adminSetting).where(eq(adminSetting.key, "store-settings")).limit(1);
    const parsed = publicStoreProfileSchema.safeParse(row?.value);
    const fallback = { name: "BASNY Enterprise", phone: "", whatsappUrl: "", email: "", address: "" };
    if (!parsed.success) return fallback;
    const profile = parsed.data;
    const digits = (value: string) => value.replace(/\D/g, "");
    const normalizedPhone = digits(profile.phone);
    const normalizedWhatsapp = digits(profile.whatsapp);
    const validPhone = normalizedPhone.length >= 9 && normalizedPhone.length <= 15;
    const validWhatsapp = normalizedWhatsapp.length >= 9 && normalizedWhatsapp.length <= 15;
    return {
      name: profile.name,
      phone: validPhone ? profile.phone : "",
      whatsappUrl: validWhatsapp ? `https://wa.me/${normalizedWhatsapp.length === 10 && normalizedWhatsapp.startsWith("0") ? `233${normalizedWhatsapp.slice(1)}` : normalizedWhatsapp}` : "",
      email: profile.email && !profile.email.toLowerCase().endsWith(".example") ? profile.email : "",
      address: profile.addressIsVerified ? profile.address : "",
    };
  }),
  getPublicStoreRedirect: publicProcedure.input(z.object({ from: routePath })).handler(async ({ context, input }) => {
    const [row] = await context.db.select({ value: adminSetting.value }).from(adminSetting).where(eq(adminSetting.key, "store-seo-social")).limit(1);
    const parsed = settingSchemas["store-seo-social"].safeParse(row?.value);
    return parsed.success ? parsed.data.redirects.find((redirect) => redirect.active && redirect.from === input.from)?.to ?? null : null;
  }),
  getPublicDeliverySettings: publicProcedure.handler(({ context }) => readPublicDeliverySettings(context.db)),
  getPublicStoreNavigation: publicProcedure.handler(async ({ context }) => {
    const [row] = await context.db.select({ value: adminSetting.value }).from(adminSetting).where(eq(adminSetting.key, "store-navigation")).limit(1);
    const parsed = settingSchemas["store-navigation"].safeParse(row?.value);
    const defaults = ["New arrivals", "Shoes", "Bags", "Accessories"].map((label, index) => ({ id: `NAV-${index + 1}`, label, href: ["/shop/new-arrivals", "/shop/shoes", "/shop/bags", "/shop/accessories"][index]!, active: true }));
    return (parsed.success ? parsed.data : defaults).filter((link) => link.active).map(({ id, label, href }) => ({ id, label, href }));
  }),
  getPublishedStorePage: publicProcedure.input(z.object({ slug: z.string().regex(/^[a-z0-9-]{1,80}$/) })).handler(async ({ context, input }) => {
    const [row] = await context.db.select({ value: adminSetting.value }).from(adminSetting).where(eq(adminSetting.key, "store-pages")).limit(1);
    const parsed = settingSchemas["store-pages"].safeParse(row?.value);
    return parsed.success ? parsed.data.find((page) => page.slug === input.slug && page.status === "Published") ?? null : null;
  }),
  getPublicStorePages: publicProcedure.handler(async ({ context }) => {
    const [row] = await context.db.select({ value: adminSetting.value }).from(adminSetting).where(eq(adminSetting.key, "store-pages")).limit(1);
    const parsed = settingSchemas["store-pages"].safeParse(row?.value);
    if (!parsed.success) return [];
    return parsed.data.filter((page) => page.status === "Published").map(({ slug, title }) => ({ slug, title }));
  }),
  getAdminSetting: staffProcedure.input(z.object({ key: settingKey })).handler(async ({ context, input }) => {
    if (!storefrontKeys.has(input.key) && context.staffRole !== "super_admin") throw new ORPCError("FORBIDDEN");
    const [row] = await context.db.select().from(adminSetting).where(eq(adminSetting.key, input.key)).limit(1);
    return row ? { key: row.key, value: row.value, revision: row.revision, updatedAt: row.updatedAt.toISOString() } : null;
  }),

  saveAdminSetting: staffProcedure.input(z.object({ key: settingKey, value: jsonValue, revision: z.string().nullable() })).handler(async ({ context, input }) => {
    if (!storefrontKeys.has(input.key) && context.staffRole !== "super_admin") throw new ORPCError("FORBIDDEN");
    const parsedValue = settingSchemas[input.key].safeParse(input.value);
    if (!parsedValue.success) throw new ORPCError("BAD_REQUEST", { message: `Invalid ${input.key} settings: ${parsedValue.error.issues[0]?.message ?? "check the supplied values"}.` });
    const nextRevision = randomUUID();
    const now = new Date();
    try {
      const saved = await context.db.transaction(async (tx) => {
        let row: typeof adminSetting.$inferSelect | undefined;
        if (input.revision === null) {
          const [inserted] = await tx.insert(adminSetting).values({ key: input.key, value: parsedValue.data, revision: nextRevision, updatedBy: context.session.user.id, updatedAt: now }).onConflictDoNothing().returning();
          row = inserted;
        } else {
          const [updated] = await tx.update(adminSetting).set({ value: parsedValue.data, revision: nextRevision, updatedBy: context.session.user.id, updatedAt: now }).where(and(eq(adminSetting.key, input.key), eq(adminSetting.revision, input.revision))).returning();
          row = updated;
        }
        if (!row) throw new ORPCError("CONFLICT", { message: "Another administrator changed this setting. The latest version has been reloaded." });
        await tx.insert(adminAuditLog).values({ id: randomUUID(), actorId: context.session.user.id, action: "setting.updated", resourceType: "admin_setting", resourceId: input.key, details: { revision: nextRevision } });
        return row;
      });
      void context.publishStaffEvent("admin-settings.changed", { key: input.key, revision: saved.revision, at: saved.updatedAt.toISOString() }).catch(() => undefined);
      if (publicSettingKeys.has(input.key)) {
        void Promise.allSettled([
          context.publishPublicCatalogueEvent("storefront.changed", { key: input.key, revision: saved.revision }),
          context.revalidatePublicCatalogue(),
        ]);
      }
      return { key: saved.key, value: saved.value, revision: saved.revision, updatedAt: saved.updatedAt.toISOString() };
    } catch (error) {
      if (error instanceof ORPCError) throw error;
      throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "The setting could not be saved." });
    }
  }),

  adminAuditEntries: staffProcedure.input(z.object({ page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(25), search: z.string().trim().max(120).default("") })).handler(async ({ context, input }) => {
    if (!(auditReadRoles as readonly string[]).includes(context.staffRole)) throw new ORPCError("FORBIDDEN");
    const search = input.search.trim();
    const where = search ? or(ilike(adminAuditLog.action, `%${search}%`), ilike(adminAuditLog.resourceType, `%${search}%`), ilike(adminAuditLog.resourceId, `%${search}%`), ilike(user.email, `%${search}%`)) : undefined;
    const [count] = await context.db.select({ value: sql<number>`count(*)::int` }).from(adminAuditLog).leftJoin(user, eq(user.id, adminAuditLog.actorId)).where(where);
    const rows = await context.db.select({ id: adminAuditLog.id, action: adminAuditLog.action, resourceType: adminAuditLog.resourceType, resourceId: adminAuditLog.resourceId, details: adminAuditLog.details, createdAt: adminAuditLog.createdAt, actorName: user.name, actorEmail: user.email }).from(adminAuditLog).leftJoin(user, eq(user.id, adminAuditLog.actorId)).where(where).orderBy(desc(adminAuditLog.createdAt)).limit(input.pageSize).offset((input.page - 1) * input.pageSize);
    return { rows: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })), total: count?.value ?? 0 };
  }),
};
