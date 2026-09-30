import { staffRole } from "@basny-web/db/schema/staff";
import { user } from "@basny-web/db/schema/auth";
import { eq, sql } from "drizzle-orm";

import { db } from "./services";

const email = process.argv[2]?.trim().toLowerCase();

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Usage: pnpm --filter server auth:bootstrap-admin -- owner@example.com");
  process.exitCode = 1;
} else {
  const [owner] = await db.select({ id: user.id, emailVerified: user.emailVerified })
    .from(user)
    .where(sql`lower(${user.email}) = ${email}`)
    .limit(1);

  if (!owner) {
    console.error("No BASNY account uses that email. Create the account and verify its email first.");
    process.exitCode = 1;
  } else if (!owner.emailVerified) {
    console.error("That account's email is not verified. Verify it before granting Super Admin access.");
    process.exitCode = 1;
  } else {
    const [existingOwner] = await db.select({ userId: staffRole.userId })
      .from(staffRole)
      .where(eq(staffRole.role, "super_admin"))
      .limit(1);

    if (existingOwner) {
      console.error("A Super Admin already exists. This bootstrap command only runs once.");
      process.exitCode = 1;
    } else {
      await db.insert(staffRole).values({ userId: owner.id, role: "super_admin" });
      console.log(`Granted Super Admin access to ${email}.`);
    }
  }
}
