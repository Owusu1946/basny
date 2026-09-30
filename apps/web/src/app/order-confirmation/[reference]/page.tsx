import type { Metadata } from "next";
import OrderConfirmationView from "./order-confirmation-view";

export const metadata: Metadata = { title: "Order details" };

export default async function OrderConfirmationPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  return <OrderConfirmationView reference={reference} />;
}
