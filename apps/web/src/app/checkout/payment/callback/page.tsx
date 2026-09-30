import type { Metadata } from "next";
import PaymentCallbackView from "./payment-callback-view";

export const metadata: Metadata = { title: "Confirming payment" };

export default async function PaymentCallbackPage({ searchParams }: { searchParams: Promise<{ reference?: string; trxref?: string }> }) {
  const params = await searchParams;
  return <PaymentCallbackView reference={params.reference ?? params.trxref ?? ""} />;
}
