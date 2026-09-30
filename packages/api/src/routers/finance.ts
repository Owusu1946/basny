import { ORPCError } from "@orpc/server";
import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { financeExpense, financeReconciliation, financeSync, paystackSettlement, paystackSettlementTransaction } from "@basny-web/db/schema/finance";
import { customerOrder, paymentTransaction } from "@basny-web/db/schema/customer";
import { staffRole } from "@basny-web/db/schema/staff";
import { protectedProcedure } from "../index";
import { getPaystackCredentials } from "../paystack";

const financeStaff = protectedProcedure.use(async ({ context, next }) => {
  const [staff] = await context.db.select({ role: staffRole.role }).from(staffRole).where(eq(staffRole.userId, context.session.user.id)).limit(1);
  if (staff?.role !== "super_admin") throw new ORPCError("FORBIDDEN", { message: "Finance access is restricted to Super Admins." });
  return next();
});
const pageInput = z.object({ page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(25), search: z.string().trim().max(120).default(""), from: z.string().date().optional(), to: z.string().date().optional() });
const parseAmount = (value: unknown, field: string) => {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error(`Paystack returned an invalid ${field}.`);
  return amount;
};
const providerDate = (value?: string | null) => value && !Number.isNaN(Date.parse(value)) ? new Date(value) : null;
const pageData = async <T,>(secretKey: string, path: string, params: URLSearchParams): Promise<T[]> => {
  const output: T[] = [];
  for (let page = 1; page <= 25; page++) {
    params.set("page", String(page));
    const response = await fetch(`https://api.paystack.co${path}?${params}`, { headers: { Authorization: `Bearer ${secretKey}`, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new ORPCError("SERVICE_UNAVAILABLE", { message: response.status === 429 ? "Paystack is rate-limiting requests. Wait a little and retry." : "Paystack settlement data could not be loaded." });
    const json = await response.json() as { status?: boolean; message?: string; data?: T[]; meta?: { pageCount?: number } };
    if (!json.status || !Array.isArray(json.data)) throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Paystack returned an invalid settlement response." });
    output.push(...json.data);
    if (page >= Math.min(json.meta?.pageCount ?? page, 25)) break;
  }
  return output;
};
type ProviderSettlement = { id: number; status: string; currency: string; total_amount: number; effective_amount: number; total_fees: number; total_processed: number; settlement_date?: string | null; createdAt?: string; updatedAt?: string };
type ProviderSettlementTxn = { id: number; status: string; reference: string; amount: number; currency: string; fees: number; paid_at?: string | null };
const safeError = (error: unknown) => error instanceof ORPCError ? error.message : "Paystack sync failed. Check the provider configuration and retry.";

export const financeProcedures = {
  financeOverview: financeStaff.handler(async ({ context }) => {
    const [paid] = await context.db.select({ count: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${customerOrder.totalGhs}), 0)::int` }).from(customerOrder).where(and(eq(customerOrder.paymentStatus, "paid"), eq(customerOrder.salesChannel, "online")));
    const [expenses] = await context.db.select({ count: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${financeExpense.amountSubunits}), 0)::int` }).from(financeExpense).where(eq(financeExpense.status, "active"));
    const [attempts] = await context.db.select({ count: sql<number>`count(*)::int`, pending: sql<number>`count(*) filter (where ${paymentTransaction.status} = 'initialized')::int`, failed: sql<number>`count(*) filter (where ${paymentTransaction.status} = 'failed')::int` }).from(paymentTransaction);
    const [settlement] = await context.db.select({ total: sql<number>`coalesce(sum(${paystackSettlement.effectiveAmountSubunits}), 0)::int`, fees: sql<number>`coalesce(sum(${paystackSettlement.totalFeesSubunits}), 0)::int`, count: sql<number>`count(*)::int` }).from(paystackSettlement).where(and(eq(paystackSettlement.currency, "GHS"), eq(paystackSettlement.status, "success")));
    const [sync] = await context.db.select().from(financeSync).where(eq(financeSync.key, "paystack_settlements")).limit(1);
    return { paidOrderCount: paid?.count ?? 0, paidSalesGhs: paid?.total ?? 0, expenseCount: expenses?.count ?? 0, expenseSubunits: expenses?.total ?? 0, paymentAttempts: attempts?.count ?? 0, pendingPayments: attempts?.pending ?? 0, failedPayments: attempts?.failed ?? 0, settlementCount: settlement?.count ?? 0, settlementSubunits: settlement?.total ?? 0, providerFeesSubunits: settlement?.fees ?? 0, lastSyncedAt: sync?.lastSyncedAt?.toISOString() ?? null, syncError: sync?.lastError ?? null };
  }),
  financeTransactions: financeStaff.input(pageInput.extend({ status: z.enum(["all", "success", "initialized", "failed"]).default("all") })).handler(async ({ context, input }) => {
    const conditions = [input.status === "all" ? undefined : eq(paymentTransaction.status, input.status), input.from ? gte(paymentTransaction.createdAt, new Date(`${input.from}T00:00:00Z`)) : undefined, input.to ? lte(paymentTransaction.createdAt, new Date(`${input.to}T23:59:59.999Z`)) : undefined, input.search ? or(ilike(paymentTransaction.reference, `%${input.search}%`), ilike(customerOrder.reference, `%${input.search}%`), ilike(customerOrder.customerName, `%${input.search}%`), ilike(customerOrder.customerEmail, `%${input.search}%`)) : undefined].filter(Boolean);
    const where = conditions.length ? and(...conditions as [typeof conditions[number], ...typeof conditions[number][]]) : undefined;
    const [countRow] = await context.db.select({ count: sql<number>`count(*)::int` }).from(paymentTransaction).innerJoin(customerOrder, eq(paymentTransaction.orderId, customerOrder.id)).where(where);
    const rows = await context.db.select({ payment: paymentTransaction, order: customerOrder }).from(paymentTransaction).innerJoin(customerOrder, eq(paymentTransaction.orderId, customerOrder.id)).where(where).orderBy(desc(paymentTransaction.createdAt)).limit(input.pageSize).offset((input.page - 1) * input.pageSize);
    const refs = rows.map(({ payment }) => payment.reference);
    const feeRows = refs.length ? await context.db.select({ reference: paystackSettlementTransaction.reference, fees: paystackSettlementTransaction.feesSubunits }).from(paystackSettlementTransaction).where(inArray(paystackSettlementTransaction.reference, refs)) : [];
    const feeMap = new Map(feeRows.map((row) => [row.reference, row.fees]));
    return { rows: rows.map(({ payment, order }) => ({ id: payment.id, reference: payment.reference, providerTransactionId: payment.providerTransactionId, status: payment.status, amountSubunits: payment.amountSubunits, feeSubunits: feeMap.get(payment.reference) ?? null, currency: payment.currency, method: payment.channel ?? "Paystack", orderReference: order.reference, customerName: order.customerName, customerEmail: order.customerEmail, createdAt: payment.createdAt.toISOString(), paidAt: payment.paidAt?.toISOString() ?? null })), total: countRow?.count ?? 0, page: input.page, pageSize: input.pageSize };
  }),
  financeExpenses: financeStaff.input(pageInput.extend({ status: z.enum(["active", "void", "all"]).default("active") })).handler(async ({ context, input }) => {
    const conditions = [input.status === "all" ? undefined : eq(financeExpense.status, input.status), input.from ? gte(financeExpense.incurredOn, input.from) : undefined, input.to ? lte(financeExpense.incurredOn, input.to) : undefined, input.search ? or(ilike(financeExpense.description, `%${input.search}%`), ilike(financeExpense.reference, `%${input.search}%`), ilike(financeExpense.category, `%${input.search}%`)) : undefined].filter(Boolean);
    const where = conditions.length ? and(...conditions as [typeof conditions[number], ...typeof conditions[number][]]) : undefined;
    const [countRow] = await context.db.select({ count: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(case when ${financeExpense.status} = 'active' then ${financeExpense.amountSubunits} else 0 end), 0)::int` }).from(financeExpense).where(where);
    const rows = await context.db.select().from(financeExpense).where(where).orderBy(desc(financeExpense.incurredOn), desc(financeExpense.createdAt)).limit(input.pageSize).offset((input.page - 1) * input.pageSize);
    return { rows, total: countRow?.count ?? 0, totalSubunits: countRow?.total ?? 0, page: input.page, pageSize: input.pageSize };
  }),
  createFinanceExpense: financeStaff.input(z.object({ incurredOn: z.string().date(), category: z.enum(["packaging", "delivery", "utilities", "rent", "supplies", "marketing", "other"]), description: z.string().trim().min(2).max(240), amountSubunits: z.number().int().positive().max(2_000_000_000), paymentMethod: z.enum(["cash", "mobile_money", "bank_transfer", "card"]), reference: z.string().trim().max(120).default("") })).handler(async ({ context, input }) => {
    const [saved] = await context.db.insert(financeExpense).values({ id: crypto.randomUUID(), ...input, createdBy: context.session.user.id }).returning();
    void context.publishStaffEvent("finance.changed", { at: new Date().toISOString() }).catch(() => undefined); return saved;
  }),
  voidFinanceExpense: financeStaff.input(z.object({ id: z.string().uuid(), reason: z.string().trim().min(5).max(500) })).handler(async ({ context, input }) => {
    const [saved] = await context.db.update(financeExpense).set({ status: "void", voidReason: input.reason, voidedBy: context.session.user.id, voidedAt: new Date(), updatedAt: new Date() }).where(and(eq(financeExpense.id, input.id), eq(financeExpense.status, "active"))).returning();
    if (!saved) throw new ORPCError("NOT_FOUND", { message: "Active expense record not found." });
    void context.publishStaffEvent("finance.changed", { at: new Date().toISOString() }).catch(() => undefined); return saved;
  }),
  financeSettlements: financeStaff.input(pageInput.extend({ status: z.string().max(30).optional() })).handler(async ({ context, input }) => {
    const conditions = [input.status ? eq(paystackSettlement.status, input.status) : undefined, input.from ? gte(paystackSettlement.settlementDate, new Date(`${input.from}T00:00:00Z`)) : undefined, input.to ? lte(paystackSettlement.settlementDate, new Date(`${input.to}T23:59:59.999Z`)) : undefined].filter(Boolean);
    const where = conditions.length ? and(...conditions as [typeof conditions[number], ...typeof conditions[number][]]) : undefined;
    const [countRow] = await context.db.select({ count: sql<number>`count(*)::int` }).from(paystackSettlement).where(where);
    const rows = await context.db.select({ settlement: paystackSettlement, reconciliation: financeReconciliation }).from(paystackSettlement).leftJoin(financeReconciliation, eq(financeReconciliation.settlementId, paystackSettlement.id)).where(where).orderBy(desc(paystackSettlement.settlementDate), desc(paystackSettlement.syncedAt)).limit(input.pageSize).offset((input.page - 1) * input.pageSize);
    const [sync] = await context.db.select().from(financeSync).where(eq(financeSync.key, "paystack_settlements")).limit(1);
    return { rows: rows.map((r) => ({ ...r.settlement, settlementDate: r.settlement.settlementDate?.toISOString() ?? null, syncedAt: r.settlement.syncedAt.toISOString(), reconciliation: r.reconciliation ? { bankAmountSubunits: r.reconciliation.bankAmountSubunits, bankReference: r.reconciliation.bankReference, reconciledAt: r.reconciliation.reconciledAt.toISOString() } : null })), total: countRow?.count ?? 0, lastSyncedAt: sync?.lastSyncedAt?.toISOString() ?? null, syncError: sync?.lastError ?? null };
  }),
  syncPaystackSettlements: financeStaff.input(z.object({ from: z.string().date().optional(), to: z.string().date().optional() })).handler(async ({ context, input }) => {
    try {
      const { secretKey } = await getPaystackCredentials(context);
      const params = new URLSearchParams({ perPage: "100" });
      params.set("from", input.from ?? new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10));
      params.set("to", input.to ?? new Date().toISOString().slice(0, 10));
      const settlements = await pageData<ProviderSettlement>(secretKey, "/settlement", params);
      const syncedAt = new Date();
      const validSettlements = settlements.filter((item) => Number.isSafeInteger(Number(item.id)) && Boolean(item.currency));
      if (validSettlements.length) await context.db.insert(paystackSettlement).values(validSettlements.map((item) => ({ id: String(item.id), status: item.status, currency: item.currency, totalProcessedSubunits: parseAmount(item.total_processed, "processed amount"), totalFeesSubunits: parseAmount(item.total_fees, "fee total"), effectiveAmountSubunits: parseAmount(item.effective_amount, "effective amount"), settlementDate: providerDate(item.settlement_date), providerCreatedAt: providerDate(item.createdAt), providerUpdatedAt: providerDate(item.updatedAt), syncedAt }))).onConflictDoUpdate({ target: paystackSettlement.id, set: { status: sql`excluded.status`, currency: sql`excluded.currency`, totalProcessedSubunits: sql`excluded.total_processed_subunits`, totalFeesSubunits: sql`excluded.total_fees_subunits`, effectiveAmountSubunits: sql`excluded.effective_amount_subunits`, settlementDate: sql`excluded.settlement_date`, providerUpdatedAt: sql`excluded.provider_updated_at`, syncedAt: sql`excluded.synced_at` } });
      await context.db.insert(financeSync).values({ key: "paystack_settlements", lastSyncedAt: syncedAt, lastError: null, updatedAt: syncedAt }).onConflictDoUpdate({ target: financeSync.key, set: { lastSyncedAt: syncedAt, lastError: null, updatedAt: syncedAt } });
      void context.publishStaffEvent("finance.changed", { at: syncedAt.toISOString() }).catch(() => undefined);
      return { syncedCount: settlements.length, lastSyncedAt: syncedAt.toISOString() };
    } catch (error) {
      const message = safeError(error);
      await context.db.insert(financeSync).values({ key: "paystack_settlements", lastError: message, updatedAt: new Date() }).onConflictDoUpdate({ target: financeSync.key, set: { lastError: message, updatedAt: new Date() } });
      if (error instanceof ORPCError) throw error;
      throw new ORPCError("SERVICE_UNAVAILABLE", { message });
    }
  }),
  financeSettlementTransactions: financeStaff.input(z.object({ settlementId: z.string().min(1).max(100) })).handler(async ({ context, input }) => {
    const [settlement] = await context.db.select().from(paystackSettlement).where(eq(paystackSettlement.id, input.settlementId)).limit(1);
    if (!settlement) throw new ORPCError("NOT_FOUND", { message: "Settlement not found. Refresh Paystack settlements first." });
    const [cached] = await context.db.select({ count: sql<number>`count(*)::int`, lastSyncedAt: sql<Date | null>`max(${paystackSettlementTransaction.syncedAt})` }).from(paystackSettlementTransaction).where(eq(paystackSettlementTransaction.settlementId, settlement.id));
    const shouldRefresh = !cached?.count || !cached.lastSyncedAt || Date.now() - new Date(cached.lastSyncedAt).getTime() > 15 * 60_000;
    if (shouldRefresh) {
      const { secretKey } = await getPaystackCredentials(context);
      const params = new URLSearchParams({ perPage: "100" });
      const rows = await pageData<ProviderSettlementTxn>(secretKey, `/settlement/${encodeURIComponent(settlement.id)}/transactions`, params);
      const syncedAt = new Date();
      if (rows.length) await context.db.insert(paystackSettlementTransaction).values(rows.map((row) => ({ id: String(row.id), settlementId: settlement.id, status: row.status, currency: row.currency, reference: row.reference, amountSubunits: parseAmount(row.amount, "transaction amount"), feesSubunits: parseAmount(row.fees, "transaction fee"), paidAt: providerDate(row.paid_at), syncedAt }))).onConflictDoUpdate({ target: paystackSettlementTransaction.id, set: { settlementId: sql`excluded.settlement_id`, status: sql`excluded.status`, currency: sql`excluded.currency`, reference: sql`excluded.reference`, amountSubunits: sql`excluded.amount_subunits`, feesSubunits: sql`excluded.fees_subunits`, paidAt: sql`excluded.paid_at`, syncedAt: sql`excluded.synced_at` } });
    }
    const records = await context.db.select({ provider: paystackSettlementTransaction, payment: paymentTransaction, order: customerOrder }).from(paystackSettlementTransaction).leftJoin(paymentTransaction, eq(paymentTransaction.reference, paystackSettlementTransaction.reference)).leftJoin(customerOrder, eq(customerOrder.id, paymentTransaction.orderId)).where(eq(paystackSettlementTransaction.settlementId, settlement.id)).orderBy(desc(paystackSettlementTransaction.paidAt));
    return records.map(({ provider, payment, order }) => ({ id: provider.id, status: provider.status, currency: provider.currency, reference: provider.reference, amountSubunits: provider.amountSubunits, feesSubunits: provider.feesSubunits, paidAt: provider.paidAt?.toISOString() ?? null, matched: Boolean(provider.status === "success" && payment && order && payment.status === "success" && payment.amountSubunits === provider.amountSubunits && payment.currency === provider.currency), orderReference: order?.reference ?? null, customerName: order?.customerName ?? null, internalAmountSubunits: payment?.amountSubunits ?? null }));
  }),
  reconcileFinanceSettlement: financeStaff.input(z.object({ settlementId: z.string().min(1), bankAmountSubunits: z.number().int().nonnegative(), bankReference: z.string().trim().min(2).max(120), note: z.string().trim().max(500).default("") })).handler(async ({ context, input }) => {
    const [settlement] = await context.db.select().from(paystackSettlement).where(eq(paystackSettlement.id, input.settlementId)).limit(1);
    if (!settlement || settlement.status !== "success") throw new ORPCError("PRECONDITION_FAILED", { message: "Only successful Paystack settlements can be reconciled." });
    const [counts] = await context.db.select({ total: sql<number>`count(*)::int`, matched: sql<number>`count(*) filter (where ${paystackSettlementTransaction.status} = 'success' and ${paymentTransaction.id} is not null and ${paymentTransaction.status} = 'success' and ${paymentTransaction.amountSubunits} = ${paystackSettlementTransaction.amountSubunits} and ${paymentTransaction.currency} = ${paystackSettlementTransaction.currency})::int` }).from(paystackSettlementTransaction).leftJoin(paymentTransaction, eq(paymentTransaction.reference, paystackSettlementTransaction.reference)).where(eq(paystackSettlementTransaction.settlementId, settlement.id));
    if (!counts?.total || counts.total !== counts.matched) throw new ORPCError("PRECONDITION_FAILED", { message: "Every settlement line must match a successful BASNY payment before reconciliation." });
    if (input.bankAmountSubunits !== settlement.effectiveAmountSubunits) throw new ORPCError("PRECONDITION_FAILED", { message: "The bank credited amount must match Paystack’s effective settlement amount." });
    const [saved] = await context.db.insert(financeReconciliation).values({ settlementId: settlement.id, bankAmountSubunits: input.bankAmountSubunits, bankReference: input.bankReference, note: input.note, reconciledBy: context.session.user.id }).onConflictDoUpdate({ target: financeReconciliation.settlementId, set: { bankAmountSubunits: input.bankAmountSubunits, bankReference: input.bankReference, note: input.note, reconciledBy: context.session.user.id, reconciledAt: new Date() } }).returning();
    void context.publishStaffEvent("finance.changed", { at: new Date().toISOString() }).catch(() => undefined); return saved;
  }),
};
