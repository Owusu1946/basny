import { sampleProducts } from "@/lib/sample-catalog";

const [sera, adwoa, nia, mira, tote, hoops] = sampleProducts;

export const salesOrders = [
  { id: "BNY-10482", customer: "Ama Mensah", contact: "+233 24 000 1048", email: "ama@example.com", paymentReference: "PAY-SAMPLE-10482", channel: "Online", fulfillment: "Delivery", deliveryFeeGhs: 60, status: "Ready for dispatch", payment: "Paid · Mobile Money", total: 690, dateKey: "2026-09-28", date: "Today, 10:42 AM", address: "East Legon, Greater Accra", lines: [{ product: sera, quantity: 1, variant: "Chocolate · EU 38" }, { product: hoops, quantity: 2, variant: "Gold" }] },
  { id: "BNY-10481", customer: "Efua Owusu", contact: "+233 20 000 1048", email: "efua@example.com", paymentReference: "POS-SAMPLE-10481", channel: "In store", fulfillment: "Store sale", deliveryFeeGhs: 0, status: "Complete", payment: "Paid · Cash", total: 425, dateKey: "2026-09-28", date: "Today, 9:18 AM", address: "Accra Central", lines: [{ product: mira, quantity: 1, variant: "Cream" }] },
  { id: "BNY-10480", customer: "Nana Osei", contact: "+233 50 000 1048", email: "nana@example.com", paymentReference: "PAY-SAMPLE-10480", channel: "Online", fulfillment: "Delivery", deliveryFeeGhs: 100, status: "Processing", payment: "Paid · Card", total: 660, dateKey: "2026-09-27", date: "Yesterday, 4:36 PM", address: "Adum, Ashanti", lines: [{ product: adwoa, quantity: 1, variant: "Tan · EU 39" }, { product: nia, quantity: 1, variant: "Bronze · EU 38" }] },
  { id: "BNY-10479", customer: "Akosua Boateng", contact: "+233 27 000 1047", email: "akosua@example.com", paymentReference: "PAY-SAMPLE-10479", channel: "Online", fulfillment: "Delivery", deliveryFeeGhs: 100, status: "Awaiting payment", payment: "Pending · Mobile Money", total: 580, dateKey: "2026-09-27", date: "Yesterday, 1:05 PM", address: "Tema, Greater Accra", lines: [{ product: tote, quantity: 1, variant: "Cocoa" }] },
  { id: "BNY-10478", customer: "Esi Arthur", contact: "+233 55 000 1047", email: "esi@example.com", paymentReference: "POS-SAMPLE-10478", channel: "In store", fulfillment: "Store sale", deliveryFeeGhs: 0, status: "Complete", payment: "Paid · Cash", total: 265, dateKey: "2026-09-24", date: "24 Sep 2026, 11:22 AM", address: "Osu, Greater Accra", lines: [{ product: adwoa, quantity: 1, variant: "Tan · EU 37" }] },
  { id: "BNY-10477", customer: "Abena Kusi", contact: "+233 24 000 1047", email: "abena@example.com", paymentReference: "PAY-SAMPLE-10477", channel: "Online", fulfillment: "Delivery", deliveryFeeGhs: 100, status: "Cancelled", payment: "Refunded · Mobile Money", total: 395, dateKey: "2026-09-23", date: "23 Sep 2026, 2:40 PM", address: "Cape Coast, Central", lines: [{ product: nia, quantity: 1, variant: "Bronze · EU 40" }] },
];

export const salesReturns = [
  { id: "RET-208", order: "BNY-10480", customer: "Nana Osei", product: nia, variant: "Bronze · EU 38", reason: "Size does not fit", status: "Needs review", requested: "Today, 9:24 AM", resolution: "Exchange", note: "Customer requests EU 39. Return delivery is arranged and paid by the customer.", internalNote: "" },
  { id: "RET-207", order: "BNY-10472", customer: "Mabel Quaye", product: sera, variant: "Chocolate · EU 37", reason: "Different from expected", status: "Approved", requested: "Yesterday, 3:12 PM", resolution: "Refund", note: "Return in transit. Return delivery is arranged and paid by the customer.", internalNote: "" },
  { id: "RET-206", order: "BNY-10465", customer: "Akua Frimpong", product: mira, variant: "Cream", reason: "Changed my mind", status: "Received", requested: "22 Sep 2026", resolution: "Refund", note: "Item received; inspection pending.", internalNote: "" },
  { id: "RET-205", order: "BNY-10458", customer: "Dela Agyeman", product: adwoa, variant: "Tan · EU 38", reason: "Wrong item received", status: "Resolved", requested: "19 Sep 2026", resolution: "Exchange", note: "Correct item dispatched. Return delivery was paid by the customer.", internalNote: "" },
];

export const abandonedCarts = [
  { id: "CART-391", customer: "Abigail Tetteh", contact: "+233 24 000 0391", email: "abigail@example.com", items: [{ product: sera, quantity: 1, variant: "Chocolate · EU 38" }, { product: mira, quantity: 1, variant: "Cream" }], total: 765, updated: "18 min ago", status: "Not contacted" },
  { id: "CART-390", customer: "Guest shopper", contact: "No phone added", email: "guest@example.com", items: [{ product: adwoa, quantity: 1, variant: "Tan · EU 39" }], total: 265, updated: "2 hours ago", status: "Not contacted" },
  { id: "CART-388", customer: "Martha Aidoo", contact: "+233 20 000 0388", email: "martha@example.com", items: [{ product: tote, quantity: 1, variant: "Cocoa" }, { product: hoops, quantity: 1, variant: "Gold" }], total: 625, updated: "Yesterday", status: "Contacted" },
  { id: "CART-384", customer: "Yaa Lamptey", contact: "+233 55 000 0384", email: "yaa@example.com", items: [{ product: nia, quantity: 1, variant: "Bronze · EU 39" }], total: 295, updated: "23 Sep 2026", status: "Recovered" },
];
