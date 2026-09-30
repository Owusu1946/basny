"use client";

import { getApiBaseUrl } from "@/lib/api-url";
import * as Ably from "ably";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";
import { readCheckoutOrder } from "@/lib/checkout-order";
import { client } from "@/utils/orpc";
import { queryClient } from "@/utils/orpc";

declare global {
  interface WindowEventMap {
    "basny:realtime": CustomEvent<{ name: string; data: Record<string, unknown> }>;
  }
}

export default function RealtimeProvider() {
  const { data: session } = authClient.useSession();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let realtime: Ably.Realtime | undefined;
    let disposed = false;
    realtime = new Ably.Realtime({
      authCallback: (_params, callback) => {
        fetch(`${getApiBaseUrl()}/api/realtime/catalogue-token`, { cache: "no-store" })
          .then(async (response) => {
            if (!response.ok) throw new Error("Catalogue live updates are not available.");
            callback(null, await response.json() as Ably.TokenRequest);
          })
          .catch((error: unknown) => callback(error instanceof Error ? error.message : "Catalogue live updates are not available.", null));
      },
      disconnectedRetryTimeout: 5000,
    });
    const channel = realtime.channels.get("basny:catalogue");
    void channel.subscribe((message) => {
      if (disposed) return;
      if (message.name === "catalogue.changed") void queryClient.invalidateQueries({ queryKey: ["catalogue"] });
      if (message.name === "storefront.changed") {
        void queryClient.invalidateQueries({ queryKey: ["public-delivery-settings"] });
        void queryClient.invalidateQueries({ queryKey: ["public-store-navigation"] });
        void queryClient.invalidateQueries({ queryKey: ["public-store-pages"] });
        void queryClient.invalidateQueries({ queryKey: ["public-store-seo"] });
        void queryClient.invalidateQueries({ queryKey: ["public-store-profile"] });
        router.refresh();
        window.dispatchEvent(new CustomEvent("basny:realtime", { detail: { name: message.name, data: (message.data ?? {}) as Record<string, unknown> } }));
      }
    }).catch((error: unknown) => {
      // Route changes can close the client while Ably is still attaching this channel.
      // Handle that expected cancellation instead of leaving a rejected promise unobserved.
      if (!disposed) console.warn("Catalogue live updates could not be subscribed", error);
    });
    return () => { disposed = true; channel.unsubscribe(); realtime?.close(); };
  }, [router]);

  useEffect(() => {
    let disposed = false;
    let realtime: Ably.Realtime | undefined;
    const channels: Ably.RealtimeChannel[] = [];

    const orderMatch = pathname.match(/^\/order-confirmation\/([^/]+)$/);
    const reference = orderMatch ? decodeURIComponent(orderMatch[1]) : null;
    const guestOrder = reference ? readCheckoutOrder(reference) : null;

    if (reference && guestOrder?.trackingToken) {
      realtime = new Ably.Realtime({
        authCallback: (_params, callback) => {
          fetch(`${getApiBaseUrl()}/api/realtime/order-token`, {
            method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reference, trackingToken: guestOrder.trackingToken }),
          }).then(async (response) => {
            if (!response.ok) throw new Error("Live order updates are not available.");
            callback(null, await response.json() as Ably.TokenRequest);
          }).catch((error: unknown) => callback(error instanceof Error ? error.message : "Live order updates are not available.", null));
        },
        disconnectedRetryTimeout: 5000,
      });
      const channel = realtime.channels.get(`basny:order:${reference}`);
      channels.push(channel);
      void channel.subscribe((message) => {
        if (message.name) window.dispatchEvent(new CustomEvent("basny:realtime", { detail: { name: message.name, data: (message.data ?? {}) as Record<string, unknown> } }));
      }).catch((error: unknown) => {
        if (!disposed) console.warn("Live order updates could not be subscribed", error);
      });
      return () => { for (const item of channels) item.unsubscribe(); realtime?.close(); };
    }

    if (!session?.user?.emailVerified) return;

    void client.accountAccess().then((access) => {
      if (disposed) return;
      realtime = new Ably.Realtime({
        authCallback: (_params, callback) => {
          fetch(`${getApiBaseUrl()}/api/realtime/token`, { credentials: "include" })
            .then(async (response) => {
              if (!response.ok) throw new Error("Realtime authorization is not available.");
              callback(null, await response.json() as Ably.TokenRequest);
            })
            .catch((error: unknown) => callback(error instanceof Error ? error.message : "Realtime authorization failed", null));
        },
        disconnectedRetryTimeout: 5000,
      });
      const subscriptions = [`basny:account:${session.user.id}`, ...(access.isStaff ? ["basny:staff"] : [])];
      for (const channelName of subscriptions) {
        const channel = realtime.channels.get(channelName);
        channels.push(channel);
        void channel.subscribe((message) => {
          if (!message.name) return;
          if (message.name === "catalogue.changed") void queryClient.invalidateQueries({ queryKey: ["admin-catalogue"] });
          if (message.name === "admin-settings.changed") {
            const key = (message.data as { key?: string } | undefined)?.key;
            void queryClient.invalidateQueries({ queryKey: key ? ["admin-settings", key] : ["admin-settings"] });
            void queryClient.invalidateQueries({ queryKey: ["public-delivery-settings"] });
          }
          if (message.name === "team.changed") {
            void queryClient.invalidateQueries({ queryKey: ["admin-team"] });
            void queryClient.invalidateQueries({ queryKey: ["admin-audit"] });
          }
          if (message.name === "marketing.changed") void queryClient.invalidateQueries({ queryKey: ["admin-marketing"] });
          if (message.name === "cart.changed") void queryClient.invalidateQueries({ queryKey: ["admin-abandoned-carts"] });
          if (message.name === "customer.changed") {
            void queryClient.invalidateQueries({ queryKey: ["admin-customers"] });
            void queryClient.invalidateQueries({ queryKey: ["admin-customer-detail"] });
            void queryClient.invalidateQueries({ queryKey: ["admin-customer-segments"] });
          }
          if (["order.created", "order.status", "payment.succeeded", "return.created", "return.status"].includes(message.name)) {
            void queryClient.invalidateQueries({ queryKey: ["admin-report"] });
            void queryClient.invalidateQueries({ queryKey: ["admin-customers"] });
            void queryClient.invalidateQueries({ queryKey: ["admin-customer-detail"] });
            void queryClient.invalidateQueries({ queryKey: ["admin-customer-segments"] });
          }
          if (message.name === "inventory.changed") {
            void queryClient.invalidateQueries({ queryKey: ["pos-catalogue"] });
            void queryClient.invalidateQueries({ queryKey: ["admin-inventory"] });
            void queryClient.invalidateQueries({ queryKey: ["admin-inventory-adjustments"] });
            void queryClient.invalidateQueries({ queryKey: ["admin-inventory-suppliers"] });
            void queryClient.invalidateQueries({ queryKey: ["admin-inventory-purchase-orders"] });
          }
          if (message.name === "finance.changed" || message.name.startsWith("payment.")) {
            void queryClient.invalidateQueries({ queryKey: ["finance"] });
          }
          if (message.name === "catalogue.changed") {
            void queryClient.invalidateQueries({ queryKey: ["pos-catalogue"] });
          }
          const event = new CustomEvent("basny:realtime", { detail: { name: message.name, data: (message.data ?? {}) as Record<string, unknown> } });
          window.dispatchEvent(event);
        }).catch((error: unknown) => {
          if (!disposed) console.warn(`Live updates could not be subscribed to ${channelName}`, error);
        });
      }
    }).catch(() => {
      // Account pages still work from server state when the realtime key is not configured.
    });

    return () => {
      disposed = true;
      for (const channel of channels) channel.unsubscribe();
      realtime?.close();
    };
  }, [pathname, session?.user?.emailVerified, session?.user?.id]);

  return null;
}
