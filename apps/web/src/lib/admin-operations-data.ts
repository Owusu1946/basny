import { salesOrders } from "@/lib/admin-sales-data";

export type AdminCustomer = { id: string; name: string; phone: string; email: string; joined: string; marketingConsent: boolean; notes: string; addresses: string[]; segment?: string };
export type CustomerSegment = { id: string; name: string; rule: "All customers" | "Repeat customers" | "New customers" | "High spend"; thresholdGhs: number; description: string };
export type DiscountCode = { id: string; code: string; kind: "Percentage" | "Fixed amount"; value: number; scope: "Storewide" | "Category" | "Products"; target: string; startsAt: string; endsAt: string; minimumGhs: number; maximumDiscountGhs: number; usageLimit: number; perCustomerLimit: number; used: number; active: boolean };
export type Promotion = { id: string; name: string; kind: "Scheduled sale" | "Flash sale"; discountPercent: number; scope: "Products" | "Category"; target: string; startsAt: string; endsAt: string; status: "Scheduled" | "Active" | "Ended" | "Paused" };
export type StorePage = { slug: string; title: string; summary: string; body: string; status: "Published" | "Draft"; metaTitle: string; metaDescription: string };
export type DeliveryZone = { id: string; name: string; area: string; feeGhs: number; estimate: string; active: boolean; group: "Accra" | "Outside Accra" };
export type StorePayment = { id: string; name: string; type: "Gateway" | "Manual" | "Pickup"; enabled: boolean; note: string };
export type StaffRecord = { id: string; name: string; email: string; phone: string; role: string; status: "Invited" | "Active" | "Deactivated"; lastActive: string };
export type AdminRole = { id: string; name: string; description: string; permissions: string[]; system: boolean };
export type Expense = { id: string; date: string; category: string; description: string; amountGhs: number; method: string; reference: string };
export type ActivityRecord = { id: string; actor: string; action: string; record: string; date: string; detail: string };
export type StoreSettings = { name: string; phone: string; whatsapp: string; email: string; address: string; addressIsVerified: boolean; currency: string; locale: string; timezone: string; freeDeliveryThresholdGhs: number; pickupEnabled: boolean; pickupAddress: string; returnWindowDays: number; changeMindReturnDelivery: string; defectReturnDelivery: string; refundProcessingBusinessDays: number };

export const initialStore: StoreSettings = { name: "BASNY Enterprise", phone: "0559182794", whatsapp: "0559182794", email: "hello@basny.example", address: "Shop 12, Oxford Street, Osu, Accra, Ghana", addressIsVerified: false, currency: "GHS", locale: "en-GH", timezone: "Africa/Accra", freeDeliveryThresholdGhs: 0, pickupEnabled: true, pickupAddress: "Shop 12, Oxford Street, Osu, Accra, Ghana", returnWindowDays: 14, changeMindReturnDelivery: "Customer pays", defectReturnDelivery: "BASNY pays", refundProcessingBusinessDays: 7 };

export const initialCustomers: AdminCustomer[] = salesOrders.slice(0, 5).map((order, index) => ({
  id: `CUS-${String(431 + index).padStart(4, "0")}`, name: order.customer, phone: order.contact,
  email: `${order.customer.toLowerCase().replaceAll(" ", ".")}@example.com`, joined: ["18 Aug 2026", "02 Sep 2026", "11 Sep 2026", "16 Sep 2026", "21 Sep 2026"][index],
  marketingConsent: index === 1 || index === 3, notes: "", addresses: salesOrders[index] ? [salesOrders[index].address] : [], segment: index < 2 ? "Repeat customer" : "New customer",
}));

export const initialSegments: CustomerSegment[] = [
  { id: "SEG-001", name: "Repeat customers", rule: "Repeat customers", thresholdGhs: 0, description: "Customers with more than one recorded order." },
  { id: "SEG-002", name: "Top spenders", rule: "High spend", thresholdGhs: 500, description: "Customers with at least GHS 500 in lifetime spend." },
  { id: "SEG-003", name: "New customers", rule: "New customers", thresholdGhs: 0, description: "Customers with one recorded order." },
];

export const initialDiscountCodes: DiscountCode[] = [
  { id: "DISC-021", code: "BASNY10", kind: "Percentage", value: 10, scope: "Storewide", target: "All products", startsAt: "2026-09-01", endsAt: "2026-12-31", minimumGhs: 500, maximumDiscountGhs: 100, usageLimit: 100, perCustomerLimit: 1, used: 18, active: true },
  { id: "DISC-020", code: "WELCOME25", kind: "Fixed amount", value: 25, scope: "Storewide", target: "All products", startsAt: "2026-08-01", endsAt: "2026-10-31", minimumGhs: 150, maximumDiscountGhs: 25, usageLimit: 50, perCustomerLimit: 1, used: 32, active: false },
];

export const initialPromotions: Promotion[] = [
  { id: "PROMO-008", name: "Weekend heels edit", kind: "Scheduled sale", discountPercent: 15, scope: "Category", target: "Shoes", startsAt: "2026-10-02T18:00", endsAt: "2026-10-04T23:59", status: "Scheduled" },
  { id: "PROMO-007", name: "New season accessories", kind: "Flash sale", discountPercent: 10, scope: "Category", target: "Accessories", startsAt: "2026-09-25T09:00", endsAt: "2026-09-28T23:00", status: "Active" },
];

export const initialPages: StorePage[] = [
  { slug: "about", title: "About BASNY", summary: "Thoughtful shoes, bags and accessories in Accra.", body: "BASNY Enterprise brings together considered everyday pieces for women. Visit us in Accra or shop online with delivery across Ghana.", status: "Published", metaTitle: "About BASNY Enterprise | Accra", metaDescription: "Meet BASNY Enterprise, your Accra destination for shoes, bags and accessories." },
  { slug: "contact", title: "Contact us", summary: "We are here to help with your order.", body: "Call or WhatsApp BASNY Enterprise for product and order support. Our store is based in Accra, Ghana.", status: "Published", metaTitle: "Contact BASNY Enterprise", metaDescription: "Get in touch with BASNY Enterprise in Accra, Ghana." },
  { slug: "delivery", title: "Delivery information", summary: "Delivery from Accra to addresses across Ghana.", body: "Delivery fees are shown before you place an order. Our team will confirm delivery timing after your order is received.", status: "Published", metaTitle: "Delivery across Ghana | BASNY", metaDescription: "Learn about BASNY delivery areas, fees and timing across Ghana." },
  { slug: "returns", title: "Returns and exchanges", summary: "Understand your options if an item is not right.", body: "You may request a return or exchange within 14 days after receiving your goods. For eligible change-of-mind returns, the customer pays the direct return delivery cost. If an item is wrong, damaged or defective, contact us so BASNY can arrange or pay return delivery. Items are inspected when received. Approved refunds are initiated within seven business days of receipt; provider settlement may take longer. Final policy wording requires BASNY approval.", status: "Draft", metaTitle: "Returns and exchanges | BASNY", metaDescription: "Read the BASNY returns and exchanges information." },
  { slug: "privacy", title: "Privacy policy", summary: "How BASNY uses customer information.", body: "BASNY uses order and contact information to fulfil purchases and provide support. We do not add customers to promotional messages without their consent. Final policy wording requires BASNY approval.", status: "Draft", metaTitle: "Privacy policy | BASNY", metaDescription: "Learn how BASNY handles customer information." },
  { slug: "terms", title: "Terms and conditions", summary: "Terms for using the BASNY store.", body: "These terms describe how orders, payment and delivery work. Final policy wording requires BASNY approval.", status: "Draft", metaTitle: "Terms and conditions | BASNY", metaDescription: "Review the terms for shopping with BASNY Enterprise." },
  { slug: "faqs", title: "Frequently asked questions", summary: "Answers to common shopping questions.", body: "How much is delivery? Your fee is shown at checkout based on your delivery area. Can I pay on pickup? Pickup payment is currently unavailable. Contact BASNY through WhatsApp for product questions.", status: "Published", metaTitle: "FAQs | BASNY Enterprise", metaDescription: "Answers about BASNY products, delivery, payment and returns." },
];

export const initialZones: DeliveryZone[] = [
  ...["Osu", "East Legon", "Madina", "Adenta", "Dansoman", "Kaneshie", "Spintex", "Labone", "Cantonments", "Airport", "Achimota", "Accra Central"].map((name, index) => ({ id: `DZ-${String(index + 1).padStart(3, "0")}`, name, area: "Greater Accra", feeGhs: 60, estimate: "1–3 business days", active: true, group: "Accra" as const })),
  ...["Ashanti", "Central", "Eastern", "Western", "Western North", "Volta", "Oti", "Northern", "Savannah", "North East", "Upper East", "Upper West", "Bono", "Bono East", "Ahafo", "Tema & beyond Accra"].map((name, index) => ({ id: `DZ-${String(index + 13).padStart(3, "0")}`, name, area: name, feeGhs: 100, estimate: "2–5 business days", active: true, group: "Outside Accra" as const })),
];

export const initialPayments: StorePayment[] = [
  { id: "paystack", name: "Paystack", type: "Gateway", enabled: true, note: "Selected gateway · credentials and webhook verification are not connected in this UI build." },
  { id: "bank-transfer", name: "Bank transfer", type: "Manual", enabled: false, note: "Staff must verify payment before marking an order paid." },
  { id: "mobile-money-transfer", name: "Manual Mobile Money", type: "Manual", enabled: false, note: "Staff must verify the transfer against the order." },
  { id: "pay-on-pickup", name: "Pay on pickup", type: "Pickup", enabled: false, note: "Pickup-only payment. Never offered for delivery orders." },
];

export const initialStaff: StaffRecord[] = [
  { id: "ADM-001", name: "BASNY Owner", email: "owner@basny.example", phone: "+233 55 000 0100", role: "Super Administrator", status: "Active", lastActive: "Today, 9:10 AM" },
  { id: "ADM-002", name: "Ama Mensah", email: "ama@basny.example", phone: "+233 24 000 0102", role: "Sales and Order Administrator", status: "Active", lastActive: "Today, 8:42 AM" },
  { id: "ADM-003", name: "Efua Owusu", email: "efua@basny.example", phone: "+233 20 000 0103", role: "Inventory Administrator", status: "Invited", lastActive: "Not signed in" },
];

export const initialRoles: AdminRole[] = [
  { id: "super-admin", name: "Super Administrator", description: "Full system access, including staff and security settings.", permissions: ["customers", "sales", "catalogue", "inventory", "purchasing", "marketing", "finances", "storefront", "delivery", "reports", "team", "settings"], system: true },
  { id: "sales-admin", name: "Sales and Order Administrator", description: "Orders, payments, customers, delivery, returns and reviews.", permissions: ["customers", "sales", "finances", "delivery", "reports"], system: true },
  { id: "inventory-admin", name: "Inventory Administrator", description: "Products, variants, categories and stock.", permissions: ["catalogue", "inventory", "purchasing"], system: true },
  { id: "content-admin", name: "Content Administrator", description: "Homepage, pages, banners and promotions.", permissions: ["marketing", "storefront"], system: true },
];

export const initialExpenses: Expense[] = [
  { id: "EXP-012", date: "2026-09-25", category: "Packaging", description: "Shopping bags and tissue paper", amountGhs: 380, method: "Mobile Money", reference: "MOMO-8812" },
  { id: "EXP-011", date: "2026-09-23", category: "Delivery", description: "Local supplier collection", amountGhs: 120, method: "Cash", reference: "" },
  { id: "EXP-010", date: "2026-09-21", category: "Utilities", description: "Shop electricity", amountGhs: 245, method: "Bank transfer", reference: "UTIL-0921" },
];

export const initialActivity: ActivityRecord[] = [
  { id: "LOG-829", actor: "Ama Mensah", action: "Updated order status", record: "BNY-10482", date: "Today, 10:54 AM", detail: "Processing → Ready for dispatch" },
  { id: "LOG-828", actor: "BASNY Owner", action: "Changed stock quantity", record: "BAS-SHO-001-CH38", date: "Today, 9:14 AM", detail: "Cycle count correction · 4 → 5" },
  { id: "LOG-827", actor: "Ama Mensah", action: "Recorded a POS sale", record: "BNY-10481", date: "Today, 9:18 AM", detail: "GHS 425 · Cash" },
  { id: "LOG-826", actor: "BASNY Owner", action: "Published homepage content", record: "Homepage hero", date: "Yesterday, 4:30 PM", detail: "Updated hero headline and call to action" },
];

export const financeTransactions = [...salesOrders.map((order, index) => ({
  id: `TXN-${String(9920 - index)}`, order: order.id, customer: order.customer, method: order.payment.split(" · ")[1] ?? "Unknown",
  status: order.payment.split(" · ")[0], amountGhs: order.total, feeGhs: order.payment.startsWith("Paid") ? Math.round(order.total * 0.015 * 100) / 100 : 0,
  reference: `PAY-${order.id.slice(-5)}`, date: order.date,
})), { id: "TXN-9914", order: "BNY-10476", customer: "Mabel Quaye", method: "Mobile Money", status: "Failed", amountGhs: 340, feeGhs: 0, reference: "PAY-10476", date: "26 Sep 2026" }];

export const initialPayouts = [
  { id: "POUT-102", provider: "Paystack", reference: "PSK-20260924-218", amountGhs: 679.65, feeGhs: 10.35, status: "Settled", expected: "25 Sep 2026", orderCount: 1, transactionIds: ["TXN-9920"] },
  { id: "POUT-101", provider: "Paystack", reference: "PSK-20260922-194", amountGhs: 650.10, feeGhs: 9.90, status: "Processing", expected: "29 Sep 2026", orderCount: 1, transactionIds: ["TXN-9918"] },
];

export const reportPeriodOptions = ["Today", "7 days", "30 days", "This month", "Custom range"] as const;
