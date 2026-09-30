import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { authClient } from "@/lib/auth-client";
import AccountDashboard from "@/components/account-dashboard";
import { client } from "@/utils/orpc";

export default async function DashboardPage() {
  const session = await authClient.getSession({ fetchOptions: { headers: await headers(), throw: true } });

  if (!session?.user) redirect("/login");
  if (!session.user.emailVerified) redirect("/verify-email");
  const { isStaff } = await client.accountAccess();
  if (isStaff) redirect("/admin" as Route);
  return <AccountDashboard />;
}
