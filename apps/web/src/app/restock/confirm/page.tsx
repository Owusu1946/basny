import RestockConfirmation from "@/components/restock-confirmation";

export const metadata = { referrer: "no-referrer" as const };

export default async function RestockConfirmPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return <RestockConfirmation token={token} />;
}
