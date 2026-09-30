import { randomUUID } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { user, session } from "@basny-web/db/schema/auth";
import { staffRole } from "@basny-web/db/schema/staff";
import { adminAuditLog } from "@basny-web/db/schema/admin";
import { protectedProcedure } from "../index";

const superAdmin = protectedProcedure.use(async ({ context, next }) => {
  const [role] = await context.db.select({ role: staffRole.role }).from(staffRole).where(eq(staffRole.userId, context.session.user.id)).limit(1);
  if (role?.role !== "super_admin") throw new ORPCError("FORBIDDEN", { message: "Only Super Admins can manage team access." });
  return next();
});
const roles = ["content_editor", "sales_order_admin", "super_admin"] as const;
const roleNames: Record<(typeof roles)[number], string> = { content_editor: "Content Editor", sales_order_admin: "Sales and Order Administrator", super_admin: "Super Administrator" };

export const teamProcedures = {
  adminSecurityStatus: superAdmin.handler(async ({ context }) => {
    const result = await context.db.execute(sql`select exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'rate_limit') as rate_limit_table_ready`);
    const rows = result as unknown as { rate_limit_table_ready: boolean }[];
    return {
      emailVerificationRequired: true,
      mfaConfigured: false,
      rateLimitConfigured: true,
      rateLimitTableReady: rows[0]?.rate_limit_table_ready === true,
      sessionRevocationOnPasswordReset: true,
      sessionRevocationOnStaffRemoval: true,
    };
  }),
  adminTeamMembers: superAdmin.input(z.object({ search: z.string().trim().max(120).default(""), page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(25) })).handler(async ({ context, input }) => {
    const search = input.search.trim();
    const where = search ? or(ilike(user.name, `%${search}%`), ilike(user.email, `%${search}%`), ilike(staffRole.role, `%${search}%`)) : undefined;
    const [count] = await context.db.select({ count: sql<number>`count(*)::int` }).from(staffRole).innerJoin(user, eq(user.id, staffRole.userId)).where(where);
    const rows = await context.db.select({ id: user.id, name: user.name, email: user.email, phone: user.phone, emailVerified: user.emailVerified, role: staffRole.role, grantedAt: staffRole.grantedAt, lastActiveAt: sql<Date | null>`max(${session.updatedAt})` }).from(staffRole).innerJoin(user, eq(user.id, staffRole.userId)).leftJoin(session, eq(session.userId, user.id)).where(where).groupBy(user.id, staffRole.role, staffRole.grantedAt).orderBy(desc(staffRole.grantedAt)).limit(input.pageSize).offset((input.page - 1) * input.pageSize);
    return { rows: rows.map((row) => ({ ...row, roleName: roleNames[row.role], lastActiveAt: row.lastActiveAt?.toISOString() ?? null, grantedAt: row.grantedAt.toISOString() })), total: count?.count ?? 0, page: input.page, pageSize: input.pageSize };
  }),
  assignAdminStaff: superAdmin.input(z.object({ email: z.string().trim().email().max(254), role: z.enum(roles) })).handler(async ({ context, input }) => {
    const [target] = await context.db.select().from(user).where(sql`lower(trim(${user.email})) = ${input.email.toLowerCase()}`).limit(1);
    if (!target) throw new ORPCError("NOT_FOUND", { message: "Create and verify this user account before granting staff access." });
    if (!target.emailVerified) throw new ORPCError("PRECONDITION_FAILED", { message: "This email must be verified before staff access can be granted." });
    if (target.id === context.session.user.id && input.role !== "super_admin") throw new ORPCError("PRECONDITION_FAILED", { message: "You cannot remove your own Super Admin role." });
    const saved = await context.db.transaction(async (tx) => {
      // Serialize role grants/revocations so concurrent requests cannot both
      // pass the last-Super-Admin check and leave the store without an owner.
      await tx.execute(sql`select pg_advisory_xact_lock(81034, 1)`);
      const [current] = await tx.select({ role: staffRole.role }).from(staffRole).where(eq(staffRole.userId, target.id)).limit(1);
      if (current?.role === "super_admin" && input.role !== "super_admin") {
        const [admins] = await tx.select({ count: sql<number>`count(*)::int` }).from(staffRole).where(eq(staffRole.role, "super_admin"));
        if ((admins?.count ?? 0) <= 1) throw new ORPCError("PRECONDITION_FAILED", { message: "At least one Super Admin must remain." });
      }
      if (current?.role === input.role) return { row: null, previousRole: current.role };
      const [row] = await tx.insert(staffRole).values({ userId: target.id, role: input.role }).onConflictDoUpdate({ target: staffRole.userId, set: { role: input.role, grantedAt: new Date() } }).returning();
      if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Staff access could not be saved." });
      await tx.insert(adminAuditLog).values({ id: randomUUID(), actorId: context.session.user.id, action: current ? "staff.role_changed" : "staff.access_granted", resourceType: "staff_role", resourceId: target.id, details: { previousRole: current?.role ?? null, role: input.role } });
      return { row, previousRole: current?.role ?? null };
    });
    if (saved.row) void context.publishStaffEvent("team.changed", { userId: target.id }).catch(() => undefined);
    return saved.row ? { ...saved.row, roleName: roleNames[saved.row.role] } : { userId: target.id, role: input.role, roleName: roleNames[input.role], unchanged: true };
  }),
  revokeAdminStaff: superAdmin.input(z.object({ userId: z.string().min(1).max(200) })).handler(async ({ context, input }) => {
    if (input.userId === context.session.user.id) throw new ORPCError("PRECONDITION_FAILED", { message: "You cannot revoke your own staff access." });
    await context.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(81034, 1)`);
      const [existing] = await tx.select({ role: staffRole.role }).from(staffRole).where(eq(staffRole.userId, input.userId)).limit(1);
      if (!existing) throw new ORPCError("NOT_FOUND", { message: "Staff access not found." });
      if (existing.role === "super_admin") {
        const [count] = await tx.select({ count: sql<number>`count(*)::int` }).from(staffRole).where(eq(staffRole.role, "super_admin"));
        if ((count?.count ?? 0) <= 1) throw new ORPCError("PRECONDITION_FAILED", { message: "At least one Super Admin must remain." });
      }
      await tx.delete(staffRole).where(eq(staffRole.userId, input.userId));
      await tx.delete(session).where(eq(session.userId, input.userId));
      await tx.insert(adminAuditLog).values({ id: randomUUID(), actorId: context.session.user.id, action: "staff.access_revoked", resourceType: "staff_role", resourceId: input.userId, details: { previousRole: existing.role, sessionsRevoked: true } });
    });
    void context.publishStaffEvent("team.changed", { userId: input.userId }).catch(() => undefined);
    return { success: true };
  }),
};
