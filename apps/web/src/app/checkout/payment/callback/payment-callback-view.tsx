"use client";

import DirectionalIcon from "@/components/directional-icon";
import Link from "next/link";
import { useEffect, useState } from "react";
import { client } from "@/utils/orpc";
import { CheckoutLoadingState } from "@/components/checkout-loading-state";

export default function PaymentCallbackView({ reference }: { reference: string }) {
  const [state, setState] = useState<"checking" | "paid" | "pending" | "error">("checking");
  const [orderReference, setOrderReference] = useState("");
  useEffect(() => {
    let active = true;
    if (!reference) { setState("error"); return; }
    void client.verifyOrderPayment({ reference }).then((result) => {
      if (!active) return;
      setOrderReference(result.reference);
      setState(result.paid ? "paid" : "pending");
    }).catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, [reference]);

  useEffect(() => {
    if (state === "paid" && orderReference) window.location.replace(`/order-confirmation/${encodeURIComponent(orderReference)}`);
  }, [orderReference, state]);

  if (state === "checking") return <CheckoutLoadingState variant="verification" />;
  return <main className="checkout-page page-shell"><section className="checkout-empty" aria-live="polite"><p className="eyebrow">Paystack payment</p>{state === "paid" && <><h1>Payment confirmed</h1><p>Your order is confirmed. We’re taking you to its details.</p></>}{state === "pending" && <><h1>Payment not confirmed yet</h1><p>Your order is saved, but Paystack has not confirmed this payment. You can try again from your order details.</p><Link className="button-primary" href={`/order-confirmation/${encodeURIComponent(orderReference)}`}>View your order <DirectionalIcon direction="right" /></Link></>}{state === "error" && <><h1>We couldn’t verify that payment</h1><p>Your order is still saved. Contact BASNY with your order reference if you were charged.</p><Link className="button-primary" href="/account/orders">View my orders <DirectionalIcon direction="right" /></Link></>}</section></main>;
}
