export type CheckoutOrder = {
  reference: string;
  trackingToken?: string;
  status?: "pending_payment" | "confirmed" | "processing" | "ready_for_delivery" | "out_for_delivery" | "delivered" | "cancelled";
  createdAt: string;
  name: string;
  email: string;
  phone: string;
  deliveryArea: "accra" | "outside-accra";
  region: string;
  town: string;
  address: string;
  note: string;
  paymentMethod: "mobile-money" | "card" | null;
  paymentProvider?: "MTN MoMo" | "Telecel Cash" | "AT Money";
  paymentPhone?: string;
  paymentStatus: "pending" | "paid";
  lines: { productSlug: string; name: string; image: string; size: string | null; colour: string; quantity: number; unitPriceGhs: number }[];
  subtotalGhs: number;
  promotionDiscountGhs?: number;
  discountGhs?: number;
  couponCode?: string;
  deliveryGhs: number;
  totalGhs: number;
};

export const CHECKOUT_ORDER_STORAGE_KEY = "basny-order-v1";

export function readCheckoutOrder(reference?: string): CheckoutOrder | null {
  try {
    const raw = window.sessionStorage.getItem(CHECKOUT_ORDER_STORAGE_KEY);
    if (!raw) return null;
    const order: unknown = JSON.parse(raw);
    if (!order || typeof order !== "object") return null;
    const candidate = order as Partial<CheckoutOrder>;
    if (typeof candidate.reference !== "string" || (reference && candidate.reference !== reference)) return null;
    if (!Array.isArray(candidate.lines) || typeof candidate.totalGhs !== "number") return null;
    if (candidate.paymentStatus !== "pending" && candidate.paymentStatus !== "paid") return null;
    return candidate as CheckoutOrder;
  } catch {
    return null;
  }
}

export function saveCheckoutOrder(order: CheckoutOrder) {
  window.sessionStorage.setItem(CHECKOUT_ORDER_STORAGE_KEY, JSON.stringify(order));
}
