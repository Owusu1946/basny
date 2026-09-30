import { ORPCError } from "@orpc/server";
import { staffRole } from "@basny-web/db/schema/staff";
import { customerAddress, customerAdminProfile, customerOrder, customerReturn, customerReview, customerSegment } from "@basny-web/db/schema/customer";
import { user } from "@basny-web/db/schema/auth";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../index";

const customerStaffProcedure = protectedProcedure.use(async ({ context, next }) => {
  const [staff] = await context.db.select({ role: staffRole.role }).from(staffRole).where(eq(staffRole.userId, context.session.user.id)).limit(1);
  if (!staff || !["sales_order_admin", "super_admin"].includes(staff.role)) throw new ORPCError("FORBIDDEN");
  return next();
});

const emailKey = z.email().trim().toLowerCase().max(254);
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}).optional();
const segmentRule = z.enum(["all", "repeat", "new", "high_spend"]);
const segmentInput = z.object({ id: z.string().min(1).max(100).optional(), name: z.string().trim().min(2).max(80), rule: segmentRule, thresholdGhs: z.number().int().min(0).max(10000000).default(500), description: z.string().trim().max(500).default("") });

const identityCte = sql`WITH identity_rows AS (
  SELECT lower(trim(email)) AS email_key, email, name, phone, created_at, id AS user_id
  FROM "user" WHERE trim(email) <> ''
  UNION ALL
  SELECT lower(trim(customer_email)) AS email_key, customer_email AS email, customer_name AS name, customer_phone AS phone, created_at, NULL::text AS user_id
  FROM customer_order WHERE trim(customer_email) <> ''
), identities AS (
  SELECT email_key,
    coalesce(max(name) FILTER (WHERE user_id IS NOT NULL), max(name)) AS name,
    coalesce(max(email) FILTER (WHERE user_id IS NOT NULL), max(email)) AS email,
    coalesce(max(phone) FILTER (WHERE user_id IS NOT NULL AND phone IS NOT NULL), max(phone), '') AS phone,
    coalesce(min(created_at) FILTER (WHERE user_id IS NOT NULL), min(created_at)) AS joined_at,
    max(user_id) AS user_id
  FROM identity_rows GROUP BY email_key
), order_stats AS (
  SELECT lower(trim(customer_email)) AS email_key,
    count(*)::int AS total_order_count,
    count(*) FILTER (WHERE payment_status = 'paid')::int AS paid_order_count,
    coalesce(sum(total_ghs) FILTER (WHERE payment_status = 'paid'), 0)::int AS paid_lifetime_spend_ghs,
    max(created_at) AS latest_order_at
  FROM customer_order WHERE trim(customer_email) <> '' GROUP BY lower(trim(customer_email))
), customer_rows AS (
  SELECT identities.*, coalesce(order_stats.total_order_count, 0)::int AS total_order_count,
    coalesce(order_stats.paid_order_count, 0)::int AS paid_order_count,
    coalesce(order_stats.paid_lifetime_spend_ghs, 0)::int AS paid_lifetime_spend_ghs,
    order_stats.latest_order_at,
    coalesce(customer_admin_profile.internal_note, '') AS internal_note
  FROM identities
  LEFT JOIN order_stats USING (email_key)
  LEFT JOIN customer_admin_profile ON customer_admin_profile.normalized_email = identities.email_key
)`;

export const customerProcedures = {
  listAdminCustomers: customerStaffProcedure.input(z.object({ query: z.string().trim().max(120).default(""), joinedFrom: dateKey, joinedTo: dateKey, page: z.number().int().min(1).max(100000).default(1), pageSize: z.number().int().min(1).max(100).default(25) })).handler(async ({ context, input }) => {
    if (input.joinedFrom && input.joinedTo && input.joinedFrom > input.joinedTo) throw new ORPCError("BAD_REQUEST", { message: "The start date must be before the end date." });
    const escapedQuery = input.query.replace(/[!%_]/g, "!$&");
    const query = input.query ? `%${escapedQuery}%` : null;
    const offset = (input.page - 1) * input.pageSize;
    const [result, statsResult, totalResult] = await Promise.all([
      context.db.execute(sql` ${identityCte}
        SELECT email_key, email, name, phone, joined_at, user_id, total_order_count, paid_order_count,
          paid_lifetime_spend_ghs, latest_order_at, internal_note
        FROM customer_rows
        WHERE (${query}::text IS NULL OR name ILIKE ${query} ESCAPE '!' OR email ILIKE ${query} ESCAPE '!' OR phone ILIKE ${query} ESCAPE '!')
          AND (${input.joinedFrom ?? null}::date IS NULL OR joined_at::date >= ${input.joinedFrom ?? null}::date)
          AND (${input.joinedTo ?? null}::date IS NULL OR joined_at::date <= ${input.joinedTo ?? null}::date)
        ORDER BY joined_at DESC, email_key ASC LIMIT ${input.pageSize} OFFSET ${offset}`),
      context.db.execute(sql` ${identityCte}
        SELECT count(*)::int AS total_customers,
          count(*) FILTER (WHERE paid_order_count > 1)::int AS repeat_customers,
          count(*) FILTER (WHERE paid_order_count <= 1)::int AS new_customers
        FROM customer_rows`),
      context.db.execute(sql` ${identityCte}
        SELECT count(*)::int AS filtered_count FROM customer_rows
        WHERE (${query}::text IS NULL OR name ILIKE ${query} ESCAPE '!' OR email ILIKE ${query} ESCAPE '!' OR phone ILIKE ${query} ESCAPE '!')
          AND (${input.joinedFrom ?? null}::date IS NULL OR joined_at::date >= ${input.joinedFrom ?? null}::date)
          AND (${input.joinedTo ?? null}::date IS NULL OR joined_at::date <= ${input.joinedTo ?? null}::date)`),
    ]);
    const rows = result.rows as Array<{ email_key: string; email: string; name: string; phone: string; joined_at: Date; user_id: string | null; total_order_count: number; paid_order_count: number; paid_lifetime_spend_ghs: number; latest_order_at: Date | null; internal_note: string }>;
    const [stats] = statsResult.rows as Array<{ total_customers: number; repeat_customers: number; new_customers: number }>;
    const [filtered] = totalResult.rows as Array<{ filtered_count: number }>;
    const customers = rows.map((row) => ({ id: row.user_id ?? `guest:${row.email_key}`, emailKey: row.email_key, name: row.name || "Customer", email: row.email, phone: row.phone, joinedAt: row.joined_at, account: Boolean(row.user_id), totalOrderCount: row.total_order_count, paidOrderCount: row.paid_order_count, lifetimeSpendGhs: row.paid_lifetime_spend_ghs, latestOrderAt: row.latest_order_at, internalNote: row.internal_note, marketingConsent: null as null }));
    return { customers, total: Number(filtered?.filtered_count ?? 0), stats: { total: Number(stats?.total_customers ?? 0), repeat: Number(stats?.repeat_customers ?? 0), new: Number(stats?.new_customers ?? 0) }, page: input.page, pageSize: input.pageSize };
  }),

  getAdminCustomer: customerStaffProcedure.input(z.object({ email: emailKey })).handler(async ({ context, input }) => {
    const normalizedEmail = input.email;
    const [account, profile, orderRows] = await Promise.all([
      context.db.select({ id: user.id, name: user.name, email: user.email, phone: user.phone, createdAt: user.createdAt, emailVerified: user.emailVerified }).from(user).where(sql`lower(trim(${user.email})) = ${normalizedEmail}`).limit(1),
      context.db.select().from(customerAdminProfile).where(eq(customerAdminProfile.normalizedEmail, normalizedEmail)).limit(1),
      context.db.select().from(customerOrder).where(sql`lower(trim(${customerOrder.customerEmail})) = ${normalizedEmail}`).orderBy(desc(customerOrder.createdAt)).limit(50),
    ]);
    const orderIds = orderRows.map((order) => order.id);
    const [returns, reviews, addresses] = await Promise.all([
      orderIds.length ? context.db.select().from(customerReturn).where(inArray(customerReturn.orderId, orderIds)).orderBy(desc(customerReturn.createdAt)) : Promise.resolve([]),
      orderIds.length ? context.db.select().from(customerReview).where(inArray(customerReview.orderId, orderIds)).orderBy(desc(customerReview.createdAt)) : Promise.resolve([]),
      account[0] ? context.db.select().from(customerAddress).where(eq(customerAddress.userId, account[0].id)).orderBy(desc(customerAddress.isDefault), desc(customerAddress.createdAt)) : Promise.resolve([]),
    ]);
    if (!account.length && !orderRows.length) throw new ORPCError("NOT_FOUND", { message: "Customer record not found." });
    const guest = orderRows[0];
    return {
      id: account[0]?.id ?? `guest:${normalizedEmail}`, emailKey: normalizedEmail, name: account[0]?.name ?? guest?.customerName ?? "Customer",
      email: account[0]?.email ?? guest?.customerEmail ?? normalizedEmail, phone: account[0]?.phone ?? guest?.customerPhone ?? "",
      joinedAt: account[0]?.createdAt ?? orderRows.reduce((oldest, item) => item.createdAt < oldest ? item.createdAt : oldest, guest!.createdAt),
      account: Boolean(account[0]), emailVerified: account[0]?.emailVerified ?? false,
      internalNote: profile[0]?.internalNote ?? "", marketingConsent: null as null,
      addresses: addresses.map((address) => ({ kind: "Saved address" as const, label: address.label, fullName: address.fullName, phone: address.phone, region: address.region, town: address.town, neighbourhood: address.neighbourhood, streetAddress: address.streetAddress, note: address.deliveryNote, isDefault: address.isDefault, createdAt: address.createdAt })),
      orders: orderRows.map((order) => ({ id: order.id, reference: order.reference, createdAt: order.createdAt, status: order.status, paymentStatus: order.paymentStatus, totalGhs: order.totalGhs, fulfillment: order.fulfillment, address: [order.address, order.town, order.region].filter(Boolean).join(", "), lines: order.lines })),
      returns: returns.map((item) => ({ id: item.id, reference: item.reference, status: item.status, reason: item.reason, createdAt: item.createdAt, orderId: item.orderId })),
      reviews: reviews.map((item) => ({ id: item.id, productSlug: item.productSlug, status: item.status, rating: item.rating, createdAt: item.createdAt, orderId: item.orderId })),
    };
  }),

  saveAdminCustomerNote: customerStaffProcedure.input(z.object({ email: emailKey, note: z.string().trim().max(2000) })).handler(async ({ context, input }) => {
    const existing = await context.db.select({ id: customerAdminProfile.id }).from(customerAdminProfile).where(eq(customerAdminProfile.normalizedEmail, input.email)).limit(1);
    if (existing[0]) {
      await context.db.update(customerAdminProfile).set({ internalNote: input.note, updatedBy: context.session.user.id, updatedAt: new Date() }).where(eq(customerAdminProfile.id, existing[0].id));
    } else {
      await context.db.insert(customerAdminProfile).values({ id: crypto.randomUUID(), normalizedEmail: input.email, internalNote: input.note, updatedBy: context.session.user.id, updatedAt: new Date() }).onConflictDoUpdate({ target: customerAdminProfile.normalizedEmail, set: { internalNote: input.note, updatedBy: context.session.user.id, updatedAt: new Date() } });
    }
    void context.publishStaffEvent("customer.changed", { email: input.email }).catch((error: unknown) => console.error("Customer update event could not be sent", error));
    return { saved: true };
  }),

  listAdminCustomerSegments: customerStaffProcedure.handler(async ({ context }) => {
    const [segments, counts] = await Promise.all([
      context.db.select().from(customerSegment).orderBy(asc(customerSegment.name)),
      context.db.execute(sql` ${identityCte}
        SELECT segment.id, count(*) FILTER (WHERE
          segment.rule = 'all'
          OR (segment.rule = 'repeat' AND customers.paid_order_count > 1)
          OR (segment.rule = 'new' AND customers.paid_order_count <= 1)
          OR (segment.rule = 'high_spend' AND customers.paid_lifetime_spend_ghs >= segment.threshold_ghs)
        )::int AS matching_customers
        FROM customer_segment AS segment CROSS JOIN customer_rows AS customers
        GROUP BY segment.id`),
    ]);
    const matches = new Map((counts.rows as Array<{ id: string; matching_customers: number }>).map((row) => [row.id, Number(row.matching_customers)]));
    return segments.map((segment) => ({ ...segment, matchingCustomers: matches.get(segment.id) ?? 0 }));
  }),
  saveAdminCustomerSegment: customerStaffProcedure.input(segmentInput).handler(async ({ context, input }) => {
    const { id: segmentId, ...values } = input;
    const duplicate = await context.db.select({ id: customerSegment.id }).from(customerSegment).where(sql`lower(${customerSegment.name}) = lower(${values.name}) AND ${customerSegment.id} <> ${segmentId ?? ""}`).limit(1);
    if (duplicate.length) throw new ORPCError("CONFLICT", { message: "A segment with this name already exists." });
    const now = new Date();
    const [saved] = segmentId
      ? await context.db.update(customerSegment).set({ ...values, updatedBy: context.session.user.id, updatedAt: now }).where(eq(customerSegment.id, segmentId)).returning()
      : await context.db.insert(customerSegment).values({ ...values, id: crypto.randomUUID(), createdBy: context.session.user.id, updatedBy: context.session.user.id, updatedAt: now }).returning();
    if (!saved) throw new ORPCError("NOT_FOUND");
    void context.publishStaffEvent("customer.changed", { segmentId: saved.id }).catch((error: unknown) => console.error("Customer segment event could not be sent", error));
    return saved;
  }),
  deleteAdminCustomerSegment: customerStaffProcedure.input(z.object({ id: z.string().min(1).max(100) })).handler(async ({ context, input }) => {
    const deleted = await context.db.delete(customerSegment).where(eq(customerSegment.id, input.id)).returning({ id: customerSegment.id });
    if (!deleted.length) throw new ORPCError("NOT_FOUND");
    void context.publishStaffEvent("customer.changed", { segmentId: input.id }).catch((error: unknown) => console.error("Customer segment event could not be sent", error));
    return { deleted: true };
  }),
};
