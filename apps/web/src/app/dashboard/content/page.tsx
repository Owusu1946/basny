import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { authClient } from "@/lib/auth-client";
import ContentEditor from "./content-editor";

export default async function ContentPage() {
  const session = await authClient.getSession({ fetchOptions: { headers: await headers(), throw: true } });
  if (!session?.user) redirect("/login");
  return <main className="content-admin page-shell"><ContentEditor /></main>;
}
