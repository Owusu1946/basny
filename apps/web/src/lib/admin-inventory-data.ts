import type { CatalogueProduct } from "@/lib/admin-catalogue-data";

export type InventoryVariant = {
  id: string; productSlug: string; productName: string; productImage: string;
  colour: string; size: string; sku: string; onHand: number; reserved: number;
  lowStockThreshold: number; location: string;
};
export type StockAdjustment = {
  id: string; variantId: string; productName: string; variantLabel: string; sku: string;
  action: "Add" | "Remove" | "Set quantity"; change: number; previous: number; next: number;
  reason: string; note: string; createdAt: string; source?: string;
};
export type Supplier = {
  id: string; name: string; contact: string; phone: string; email: string; location: string;
  leadTimeDays: number; notes: string; active: boolean;
};
export type PurchaseOrderLine = {
  variantId: string; productSlug: string; productName: string; variantLabel: string;
  sku: string; quantityOrdered: number; quantityReceived: number; unitCostGhs: number;
};
export type PurchaseOrder = {
  id: string; supplierId: string; supplierName: string;
  status: "Draft" | "Ordered" | "Partially received" | "Received" | "Cancelled";
  createdAt: string; expectedAt: string; supplierReference: string; note: string; lines: PurchaseOrderLine[];
};

export function makeInventoryVariants(products: CatalogueProduct[]): InventoryVariant[] {
  return products.flatMap((product) => {
    const colours = product.colours.length ? product.colours.map((colour) => colour.name) : ["Standard"];
    const sizes = product.sizes.length ? product.sizes : ["One size"];
    const options = colours.flatMap((colour) => sizes.map((size) => ({ colour, size })));
    const base = Math.floor(product.stock / Math.max(options.length, 1));
    const remainder = product.stock % Math.max(options.length, 1);
    return options.map((option, index) => ({
      id: `${product.slug}|${option.colour}|${option.size}`,
      productSlug: product.slug, productName: product.name, productImage: product.image,
      colour: option.colour, size: option.size,
      sku: `${product.sku}-${option.colour.toLowerCase().replace(/[^a-z0-9]+/g, "").toUpperCase()}-${option.size === "One size" ? "OS" : option.size}`,
      onHand: base + (index < remainder ? 1 : 0), reserved: 0, lowStockThreshold: 3, location: "Accra store",
    }));
  });
}

export const initialSuppliers: Supplier[] = [
  { id: "SUP-001", name: "Ahenfie Footwear Supply", contact: "Kojo A.", phone: "+233 24 000 1201", email: "orders@ahenfie.example", location: "Accra, Greater Accra", leadTimeDays: 7, notes: "Footwear and sandals", active: true },
  { id: "SUP-002", name: "Coastline Style House", contact: "Esi D.", phone: "+233 20 000 1202", email: "sales@coastline.example", location: "Accra, Greater Accra", leadTimeDays: 5, notes: "Bags and accessories", active: true },
  { id: "SUP-003", name: "Kumasi Leather Works", contact: "Yaw B.", phone: "+233 55 000 1203", email: "hello@kumasileather.example", location: "Kumasi, Ashanti", leadTimeDays: 10, notes: "Leather goods · collection by arrangement", active: false },
];

export const initialPurchaseOrders: PurchaseOrder[] = [
  { id: "PO-2026-004", supplierId: "SUP-001", supplierName: "Ahenfie Footwear Supply", status: "Ordered", createdAt: "24 Sep 2026", expectedAt: "02 Oct 2026", supplierReference: "AH-441", note: "Autumn footwear restock", lines: [
    { variantId: "sera-block-heel|Chocolate|38", productSlug: "sera-block-heel", productName: "Sera Block Heel", variantLabel: "Chocolate · EU 38", sku: "BAS-SHO-001-CH38", quantityOrdered: 6, quantityReceived: 0, unitCostGhs: 190 },
    { variantId: "nia-strap-sandal|Bronze|39", productSlug: "nia-strap-sandal", productName: "Nia Strap Sandal", variantLabel: "Bronze · EU 39", sku: "BAS-SHO-003-BR39", quantityOrdered: 4, quantityReceived: 0, unitCostGhs: 165 },
  ] },
  { id: "PO-2026-003", supplierId: "SUP-002", supplierName: "Coastline Style House", status: "Partially received", createdAt: "21 Sep 2026", expectedAt: "29 Sep 2026", supplierReference: "CS-208", note: "Balance due next delivery", lines: [{ variantId: "mira-shoulder-bag|Cream|One size", productSlug: "mira-shoulder-bag", productName: "Mira Shoulder Bag", variantLabel: "Cream · One size", sku: "BAS-BAG-004-CROS", quantityOrdered: 8, quantityReceived: 5, unitCostGhs: 245 }] },
  { id: "PO-2026-002", supplierId: "SUP-001", supplierName: "Ahenfie Footwear Supply", status: "Received", createdAt: "15 Sep 2026", expectedAt: "22 Sep 2026", supplierReference: "AH-398", note: "", lines: [{ variantId: "adwoa-ballet-flat|Tan|38", productSlug: "adwoa-ballet-flat", productName: "Adwoa Ballet Flat", variantLabel: "Tan · EU 38", sku: "BAS-SHO-002-TA38", quantityOrdered: 8, quantityReceived: 8, unitCostGhs: 135 }] },
];

export const initialAdjustments: StockAdjustment[] = [
  { id: "ADJ-062", variantId: "everyday-tote|Cocoa|One size", productName: "Everyday Tote", variantLabel: "Cocoa · One size", sku: "BAS-BAG-005-COOS", action: "Set quantity", change: -1, previous: 4, next: 3, reason: "Cycle count correction", note: "One unit had a damaged handle and was removed from sellable stock.", createdAt: "Today, 9:14 AM" },
  { id: "ADJ-060", variantId: "sera-block-heel|Chocolate|37", productName: "Sera Block Heel", variantLabel: "Chocolate · EU 37", sku: "BAS-SHO-001-CH37", action: "Remove", change: -1, previous: 3, next: 2, reason: "Damaged item", note: "Scuff on the upper; held out of sale.", createdAt: "23 Sep 2026" },
];
