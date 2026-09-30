"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { client } from "@/utils/orpc";

export default function RestockConfirmation({ token }: { token: string }) {
  const [state, setState] = useState<"loading" | "confirmed" | "error">("loading");
  useEffect(() => {
    let active = true;
    if (!/^[a-f0-9]{64}$/.test(token)) { setState("error"); return; }
    client.confirmRestockAlert({ token }).then(() => { if (active) setState("confirmed"); }).catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, [token]);
  return <main className="restock-confirmation"><p className="eyebrow">BASNY ENTERPRISE · RESTOCK ALERT</p><h1>{state === "loading" ? "Confirming your request…" : state === "confirmed" ? "You’re on the list." : "This link can’t be confirmed."}</h1><p>{state === "loading" ? "We’re securely confirming your email address." : state === "confirmed" ? "We’ll send one email when the option you selected becomes available again." : "The link may be invalid or already used. You can return to the product page to request a new alert."}</p><Link href="/shop">Continue shopping</Link></main>;
}
