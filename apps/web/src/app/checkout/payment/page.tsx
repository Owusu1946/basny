import type { Metadata } from "next";
import CheckoutPaymentView from "./payment-view";

export const metadata: Metadata = { title: "Place your order" };

export default function CheckoutPaymentPage() {
  return <CheckoutPaymentView />;
}
