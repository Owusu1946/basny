import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AdminShell from "@/components/admin/admin-shell";
import { authClient } from "@/lib/auth-client";
import { client } from "@/utils/orpc";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await authClient.getSession({ fetchOptions: { headers: await headers(), throw: true } });
  if (!session?.user) redirect("/login");
  if (!session.user.emailVerified) redirect("/verify-email");
  let access = false;
  try { access = (await client.accountAccess()).isStaff; } catch { access = false; }
  if (!access) redirect("/dashboard");
  return <AdminShell>{children}</AdminShell>;
}
