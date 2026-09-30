"use client";

import { useState } from "react";
import { toast } from "sonner";
import { client } from "@/utils/orpc";

export default function RestockAlertForm({ productSlug, colour, size }: { productSlug: string; colour: string; size: string | null }) {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function requestAlert(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      const result = await client.requestRestockAlert({ productSlug, colour, size, email });
      if (result.alreadyAvailable) {
        toast.info("This option is available now", { description: "Please select it above to purchase." });
        return;
      }
      const nextMessage = result.alreadySubscribed
        ? "You’re already on the list. We’ll email you when this option is available."
        : "Confirmation sent. Check your inbox to activate this one-time restock alert.";
      setMessage(nextMessage);
      if (!result.alreadySubscribed) toast.success("Check your email", { description: "Confirm your address and we’ll send one alert when this option is available." });
    } catch (error) {
      toast.error("Couldn’t set up the alert", { description: error instanceof Error ? error.message : "Please try again shortly." });
    } finally {
      setPending(false);
    }
  }

  if (message) return <p className="restock-alert__success" role="status">{message}</p>;
  return <form className="restock-alert" onSubmit={requestAlert}>
    <label htmlFor="restock-email">Get one email when this option is back</label>
    <div className="restock-alert__row"><input id="restock-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Your email address" /><button type="submit" disabled={pending}>{pending ? "Sending…" : "Notify me"}</button></div>
    <small>We’ll email once for this option. Confirm your address to activate the alert.</small>
  </form>;
}
