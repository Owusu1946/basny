import {
  Activity01Icon,
  Archive01Icon,
  Building01Icon,
  Calendar01Icon,
  CashierIcon,
  ChartLineData01Icon,
  ContainerTruck01Icon,
  Coupon01Icon,
  CreditCardIcon,
  DiscountTag01Icon,
  File01Icon,
  Folder01Icon,
  Home01Icon,
  Invoice01Icon,
  Money01Icon,
  Package01Icon,
  SaleTag01Icon,
  Settings01Icon,
  Shield01Icon,
  ShoppingBag01Icon,
  ShoppingCart01Icon,
  Store01Icon,
  Tag01Icon,
  UserGroupIcon,
  UserSettings01Icon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

export type AdminDestination = {
  label: string;
  href: string;
  icon: IconSvgElement;
  description: string;
};

type AdminSection = {
  label: string;
  icon: IconSvgElement;
  children: readonly AdminDestination[];
};

type AdminOverviewLink = AdminDestination & { label: "Overview" };

export const adminNavigation: readonly (AdminSection | AdminOverviewLink)[] = [
  {
    label: "Overview",
    href: "/admin",
    icon: Home01Icon,
    description: "A clear view of the day’s store activity.",
  },
  {
    label: "Sales",
    icon: ShoppingBag01Icon,
    children: [
      { label: "Point of sale", href: "/admin/sales/point-of-sale", icon: CashierIcon, description: "Create an in-store sale using the shared product catalogue." },
      { label: "Orders", href: "/admin/sales/orders", icon: ShoppingCart01Icon, description: "Review online and in-store orders in one place." },
      { label: "Returns & exchanges", href: "/admin/sales/returns", icon: Archive01Icon, description: "Track return requests, exchanges, and outcomes." },
      { label: "Abandoned carts", href: "/admin/sales/abandoned-carts", icon: ShoppingBag01Icon, description: "Follow up on carts that were not checked out." },
    ],
  },
  {
    label: "Catalogue",
    icon: Package01Icon,
    children: [
      { label: "Products", href: "/admin/catalogue/products", icon: Package01Icon, description: "Manage product details, media, pricing, and availability." },
      { label: "Add product", href: "/admin/catalogue/products/new", icon: Tag01Icon, description: "Create a product and its purchasable variants." },
      { label: "Categories", href: "/admin/catalogue/categories", icon: Folder01Icon, description: "Organize shoes, bags, and accessories for browsing." },
      { label: "Collections", href: "/admin/catalogue/collections", icon: SaleTag01Icon, description: "Curate collections for the storefront." },
      { label: "Reviews", href: "/admin/catalogue/reviews", icon: UserGroupIcon, description: "Moderate product reviews and customer feedback." },
    ],
  },
  {
    label: "Inventory & purchasing",
    icon: ContainerTruck01Icon,
    children: [
      { label: "Stock overview", href: "/admin/inventory", icon: ChartLineData01Icon, description: "See available, reserved, low, and out-of-stock variants." },
      { label: "Stock adjustments", href: "/admin/inventory/adjustments", icon: Activity01Icon, description: "Record stock corrections with a reason and audit trail." },
      { label: "Purchase orders", href: "/admin/purchasing/orders", icon: Invoice01Icon, description: "Order stock from suppliers and receive deliveries." },
      { label: "Suppliers", href: "/admin/purchasing/suppliers", icon: Building01Icon, description: "Keep supplier contacts and purchasing details together." },
    ],
  },
  {
    label: "Customers",
    icon: UserGroupIcon,
    children: [
      { label: "All customers", href: "/admin/customers", icon: UserGroupIcon, description: "View customer contact details and order history." },
      { label: "Customer segments", href: "/admin/customers/segments", icon: UserSettings01Icon, description: "Group customers for service and marketing." },
    ],
  },
  {
    label: "Marketing",
    icon: DiscountTag01Icon,
    children: [
      { label: "Promotions", href: "/admin/marketing/promotions", icon: SaleTag01Icon, description: "Schedule and manage store promotions." },
      { label: "Discount codes", href: "/admin/marketing/discount-codes", icon: Coupon01Icon, description: "Create and track coupon codes and usage." },
    ],
  },
  {
    label: "Finances",
    icon: Wallet01Icon,
    children: [
      { label: "Finance overview", href: "/admin/finances", icon: Money01Icon, description: "Review sales, refunds, fees, and net receipts." },
      { label: "Transactions", href: "/admin/finances/transactions", icon: CreditCardIcon, description: "Inspect payment and refund transactions." },
      { label: "Payouts", href: "/admin/finances/payouts", icon: Wallet01Icon, description: "Track payment provider settlements and deposits." },
      { label: "Expenses", href: "/admin/finances/expenses", icon: Invoice01Icon, description: "Record operating costs for financial reporting." },
      { label: "Reconciliation", href: "/admin/finances/reconciliation", icon: Activity01Icon, description: "Match orders, payments, refunds, and payouts." },
    ],
  },
  {
    label: "Storefront",
    icon: Store01Icon,
    children: [
      { label: "Homepage content", href: "/admin/storefront/homepage", icon: Home01Icon, description: "Edit hero slides and homepage editorial content." },
      { label: "Pages & policies", href: "/admin/storefront/pages", icon: File01Icon, description: "Manage store information and customer policies." },
      { label: "Navigation", href: "/admin/storefront/navigation", icon: Folder01Icon, description: "Organize the links customers use to browse." },
      { label: "Delivery & pickup", href: "/admin/storefront/delivery", icon: ContainerTruck01Icon, description: "Configure delivery areas, fees, and pickup availability." },
      { label: "Payment methods", href: "/admin/storefront/payments", icon: CreditCardIcon, description: "Control the payment methods offered at checkout." },
      { label: "SEO & social", href: "/admin/storefront/seo-social", icon: SaleTag01Icon, description: "Edit search previews and social profile links." },
    ],
  },
  {
    label: "Reports",
    icon: ChartLineData01Icon,
    children: [
      { label: "Sales", href: "/admin/reports/sales", icon: ChartLineData01Icon, description: "Explore sales totals and order trends." },
      { label: "Products", href: "/admin/reports/products", icon: Package01Icon, description: "Compare product and category performance." },
      { label: "Inventory", href: "/admin/reports/inventory", icon: Archive01Icon, description: "Understand stock movement and availability." },
      { label: "Customers", href: "/admin/reports/customers", icon: UserGroupIcon, description: "Review customer activity and repeat purchases." },
      { label: "Orders", href: "/admin/reports/orders", icon: ShoppingCart01Icon, description: "Review completed, cancelled, returned, and refunded orders." },
      { label: "Payments", href: "/admin/reports/payments", icon: CreditCardIcon, description: "Review successful, failed, pending, and refunded payments." },
    ],
  },
  {
    label: "Team & security",
    icon: Shield01Icon,
    children: [
      { label: "Staff accounts", href: "/admin/team/staff", icon: UserGroupIcon, description: "Manage the people who use the admin workspace." },
      { label: "Roles & permissions", href: "/admin/team/roles", icon: Shield01Icon, description: "Plan role-based access for each team member." },
      { label: "Security settings", href: "/admin/team/security", icon: Shield01Icon, description: "Review sign-in protection, sessions, and sensitive account controls." },
      { label: "Activity log", href: "/admin/team/activity", icon: Activity01Icon, description: "Review who changed important store records." },
    ],
  },
  {
    label: "Settings",
    icon: Settings01Icon,
    children: [
      { label: "Store details", href: "/admin/settings/store", icon: Store01Icon, description: "Manage the store name, address, and contact details." },
      { label: "Tax & localization", href: "/admin/settings/localization", icon: Building01Icon, description: "Set Ghana cedi display, locale, and tax preferences." },
      { label: "Notifications", href: "/admin/settings/notifications", icon: Calendar01Icon, description: "Choose how order and stock alerts reach the team." },
      { label: "Integrations", href: "/admin/settings/integrations", icon: Settings01Icon, description: "Connect the services that support store operations." },
    ],
  },
] as const;

export const adminDestinations: readonly AdminDestination[] = adminNavigation.flatMap((section) =>
  "children" in section ? [...section.children] : [section],
);

export function getAdminDestination(path: string): AdminDestination {
  const exactMatch = adminDestinations.find((destination) => destination.href === path);
  if (exactMatch) return exactMatch;
  if (/^\/admin\/catalogue\/products\/[^/]+\/edit$/.test(path)) {
    return {
      label: "Edit product",
      href: path,
      icon: Package01Icon,
      description: "Update product details, options, pricing, and visibility.",
    };
  }
  return adminDestinations[0];
}
