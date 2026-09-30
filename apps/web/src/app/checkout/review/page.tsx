import type { Metadata } from "next";
import CheckoutReviewView from "./review-view";

export const metadata: Metadata = { title: "Review your order" };

export default function CheckoutReviewPage() {
  return <CheckoutReviewView />;
}
