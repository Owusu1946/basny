import { and, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { customerOrder, paymentTransaction } from "@basny-web/db/schema/customer";
import { catalogueProduct, catalogueProductVariant } from "@basny-web/db/schema/catalogue";
import { staffRole } from "@basny-web/db/schema/staff";
import { protectedProcedure } from "../index";
import { ORPCError } from "@orpc/server";

const reportAccess = protectedProcedure.use(async ({ context, next }) => {
  const [staff] = await context.db.select({ role: staffRole.role }).from(staffRole).where(eq(staffRole.userId, context.session.user.id)).limit(1);
  if (!staff || !["super_admin", "sales_order_admin"].includes(staff.role)) throw new ORPCError("FORBIDDEN", { message: "Reports are restricted to authorized staff." });
  return next();
});
const inputSchema = z.object({ kind: z.enum(["sales", "orders", "payments", "inventory", "customers", "products"]), from: z.string().date(), to: z.string().date(), search: z.string().trim().max(120).default(""), page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(25) }).refine((input) => input.from <= input.to, { message: "End date must be on or after start date.", path: ["to"] });
const bounds = (from: string, to: string) => [gte(customerOrder.createdAt, new Date(`${from}T00:00:00.000Z`)), lte(customerOrder.createdAt, new Date(`${to}T23:59:59.999Z`))];

export const reportProcedures = {
  adminReport: reportAccess.input(inputSchema).handler(async ({ context, input }) => {
    const offset = (input.page - 1) * input.pageSize;
    const search = input.search.trim();
    if (input.kind === "inventory") {
      const where = search ? or(ilike(catalogueProduct.name, `%${search}%`), ilike(catalogueProductVariant.sku, `%${search}%`)) : undefined;
      const [total] = await context.db.select({ count: sql<number>`count(*)::int`, low: sql<number>`count(*) filter (where ${catalogueProductVariant.stock} - ${catalogueProductVariant.reservedStock} <= ${catalogueProductVariant.lowStockThreshold})::int` }).from(catalogueProductVariant).innerJoin(catalogueProduct, eq(catalogueProduct.id, catalogueProductVariant.productId)).where(where);
      const rows = await context.db.select({ id: catalogueProductVariant.id, name: catalogueProduct.name, sku: catalogueProductVariant.sku, colour: catalogueProductVariant.colour, size: catalogueProductVariant.size, stock: sql<number>`${catalogueProductVariant.stock} - ${catalogueProductVariant.reservedStock}`, threshold: catalogueProductVariant.lowStockThreshold, updatedAt: catalogueProductVariant.updatedAt }).from(catalogueProductVariant).innerJoin(catalogueProduct, eq(catalogueProduct.id, catalogueProductVariant.productId)).where(where).orderBy(catalogueProduct.name, catalogueProductVariant.sortOrder).limit(input.pageSize).offset(offset);
      const [available] = await context.db.select({ total: sql<number>`coalesce(sum(${catalogueProductVariant.stock} - ${catalogueProductVariant.reservedStock}),0)::int` }).from(catalogueProductVariant).innerJoin(catalogueProduct, eq(catalogueProduct.id, catalogueProductVariant.productId)).where(where);
      return { rows: rows.map((row) => ({ id: row.id, date: row.updatedAt.toISOString(), label: `${row.name} · ${row.colour}${row.size ? ` · ${row.size}` : ""}`, detail: `${row.sku} · ${row.stock <= row.threshold ? "Low stock" : "In stock"}`, status: row.stock <= row.threshold ? "low" : "ok", amount: row.stock })), total: total?.count ?? 0, summary: { total: available?.total ?? 0, count: total?.count ?? 0, secondaryLabel: "Low stock variants", secondaryValue: total?.low ?? 0 } };
    }
    if (input.kind === "products") {
      const result = await context.db.execute(sql`
        select line->>'productSlug' as slug, max(line->>'name') as name,
          sum((line->>'quantity')::int)::int as units,
          sum(((line->>'quantity')::int * (line->>'unitPriceGhs')::int))::int as revenue
        from customer_order orders cross join lateral jsonb_array_elements(orders.lines) as line
        where orders.payment_status = 'paid'
          and orders.created_at >= ${new Date(`${input.from}T00:00:00.000Z`)} and orders.created_at <= ${new Date(`${input.to}T23:59:59.999Z`)}
          and (${search} = '' or lower(coalesce(line->>'name','')) like '%' || lower(${search}) || '%')
        group by line->>'productSlug' order by revenue desc limit ${input.pageSize} offset ${offset}`);
      const countResult = await context.db.execute(sql`select count(distinct line->>'productSlug')::int as count, coalesce(sum((line->>'quantity')::int),0)::int as units, coalesce(sum(((line->>'quantity')::int * (line->>'unitPriceGhs')::int)),0)::int as revenue from customer_order orders cross join lateral jsonb_array_elements(orders.lines) as line where orders.payment_status = 'paid' and orders.created_at >= ${new Date(`${input.from}T00:00:00.000Z`)} and orders.created_at <= ${new Date(`${input.to}T23:59:59.999Z`)} and (${search} = '' or lower(coalesce(line->>'name','')) like '%' || lower(${search}) || '%')`);
      const first = (countResult as unknown as { count: number; units: number; revenue: number }[])[0];
      const records = result as unknown as { slug: string; name: string; units: number; revenue: number }[];
      return { rows: records.map((row) => ({ id: row.slug, date: "", label: row.name, detail: `${row.units} units sold`, status: "paid", amount: row.revenue })), total: first?.count ?? 0, summary: { total: first?.revenue ?? 0, count: first?.count ?? 0, secondaryLabel: "Units sold", secondaryValue: first?.units ?? 0 } };
    }
    if (input.kind === "customers") {
      const conditions = [...bounds(input.from, input.to), ...(search ? [or(ilike(customerOrder.customerName, `%${search}%`), ilike(customerOrder.customerEmail, `%${search}%`))!] : [])];
      const rows = await context.db.select({ email: sql<string>`lower(trim(${customerOrder.customerEmail}))`, name: sql<string>`max(${customerOrder.customerName})`, orders: sql<number>`count(*)::int`, spend: sql<number>`coalesce(sum(case when ${customerOrder.paymentStatus} = 'paid' then ${customerOrder.totalGhs} else 0 end),0)::int`, lastOrderAt: sql<Date>`max(${customerOrder.createdAt})` }).from(customerOrder).where(and(...conditions)).groupBy(sql`lower(trim(${customerOrder.customerEmail}))`).orderBy(desc(sql`max(${customerOrder.createdAt})`)).limit(input.pageSize).offset(offset);
      const [total] = await context.db.select({ count: sql<number>`count(distinct lower(trim(${customerOrder.customerEmail})))::int`, spend: sql<number>`coalesce(sum(case when ${customerOrder.paymentStatus} = 'paid' then ${customerOrder.totalGhs} else 0 end),0)::int` }).from(customerOrder).where(and(...conditions));
      return { rows: rows.map((row) => ({ id: row.email, date: row.lastOrderAt.toISOString(), label: row.name, detail: `${row.orders} orders · ${row.email}`, status: "customer", amount: row.spend })), total: total?.count ?? 0, summary: { total: total?.spend ?? 0, count: total?.count ?? 0, secondaryLabel: "Unique customers", secondaryValue: total?.count ?? 0 } };
    }
    if (input.kind === "payments") {
      const conditions = [input.from ? gte(paymentTransaction.createdAt, new Date(`${input.from}T00:00:00.000Z`)) : undefined, input.to ? lte(paymentTransaction.createdAt, new Date(`${input.to}T23:59:59.999Z`)) : undefined, search ? or(ilike(paymentTransaction.reference, `%${search}%`), ilike(customerOrder.reference, `%${search}%`), ilike(customerOrder.customerName, `%${search}%`)) : undefined].filter(Boolean);
      const where = and(...conditions as [NonNullable<(typeof conditions)[number]>, ...NonNullable<(typeof conditions)[number]>[]]);
      const [total] = await context.db.select({ count: sql<number>`count(*)::int`, amount: sql<number>`coalesce(sum(case when ${paymentTransaction.status} = 'success' then ${paymentTransaction.amountSubunits} else 0 end),0)::int`, attention: sql<number>`count(*) filter (where ${paymentTransaction.status} in ('initialized','failed'))::int` }).from(paymentTransaction).innerJoin(customerOrder, eq(customerOrder.id, paymentTransaction.orderId)).where(where);
      const rows = await context.db.select({ payment: paymentTransaction, order: customerOrder }).from(paymentTransaction).innerJoin(customerOrder, eq(customerOrder.id, paymentTransaction.orderId)).where(where).orderBy(desc(paymentTransaction.createdAt)).limit(input.pageSize).offset(offset);
      return { rows: rows.map(({ payment, order }) => ({ id: payment.id, date: payment.createdAt.toISOString(), label: payment.reference, detail: `${order.reference} · ${order.customerName} · ${payment.channel ?? "Paystack"}`, status: payment.status, amount: payment.amountSubunits / 100 })), total: total?.count ?? 0, summary: { total: (total?.amount ?? 0) / 100, count: total?.count ?? 0, secondaryLabel: "Needs attention", secondaryValue: total?.attention ?? 0 } };
    }
    const conditions = [...bounds(input.from, input.to), ...(input.kind === "sales" ? [eq(customerOrder.paymentStatus, "paid" as const)] : []), ...(search ? [or(ilike(customerOrder.reference, `%${search}%`), ilike(customerOrder.customerName, `%${search}%`), ilike(customerOrder.customerEmail, `%${search}%`))!] : [])];
    const [total] = await context.db.select({ count: sql<number>`count(*)::int`, amount: sql<number>`coalesce(sum(case when ${customerOrder.paymentStatus} = 'paid' then ${customerOrder.totalGhs} else 0 end),0)::int`, cancelled: sql<number>`count(*) filter (where ${customerOrder.status} = 'cancelled')::int` }).from(customerOrder).where(and(...conditions));
    const rows = await context.db.select().from(customerOrder).where(and(...conditions)).orderBy(desc(customerOrder.createdAt)).limit(input.pageSize).offset(offset);
    return { rows: rows.map((row) => ({ id: row.id, date: row.createdAt.toISOString(), label: row.reference, detail: `${row.customerName} · ${row.lines.length} item${row.lines.length === 1 ? "" : "s"}`, status: row.status, amount: row.totalGhs })), total: total?.count ?? 0, summary: { total: total?.amount ?? 0, count: total?.count ?? 0, secondaryLabel: input.kind === "sales" ? "Cancelled orders" : "Cancelled in period", secondaryValue: total?.cancelled ?? 0 } };
  }),
};
