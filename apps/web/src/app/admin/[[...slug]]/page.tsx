import Link from "next/link";
import { notFound } from "next/navigation";
import type { Route } from "next";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, PlusSignIcon } from "@hugeicons/core-free-icons";

import { adminNavigation, getAdminDestination } from "@/lib/admin-navigation";
import { AbandonedCartsWorkspace, PointOfSaleWorkspace } from "@/components/admin/sales-workspaces";
import LiveCommerceWorkspace from "@/components/admin/live-commerce-workspace";
import { CategoriesWorkspace, CollectionsWorkspace, ProductFormWorkspace, ProductsWorkspace, ReviewsWorkspace } from "@/components/admin/catalogue-workspaces";
import { InventoryOverviewWorkspace, PurchaseOrdersWorkspace, StockAdjustmentsWorkspace, SuppliersWorkspace } from "@/components/admin/inventory-workspaces";
import { MarketingWorkspace } from "@/components/admin/customer-marketing-workspaces";
import { CustomersWorkspace } from "@/components/admin/customer-workspace";
import { FinanceWorkspace } from "@/components/admin/finance-workspace";
import { StorefrontWorkspace } from "@/components/admin/storefront-workspaces";
import { SettingsWorkspace } from "@/components/admin/team-settings-workspaces";
import { TeamWorkspace } from "@/components/admin/team-workspace";
import { ReportsWorkspace } from "@/components/admin/reports-workspace";

type AdminPageProps = { params: Promise<{ slug?: string[] }> };

export default async function AdminPage({ params }: AdminPageProps) {
  const { slug } = await params;
  const path = slug?.length ? `/admin/${slug.join("/")}` : "/admin";
  const productEditMatch = slug?.length === 4 && slug[0] === "catalogue" && slug[1] === "products" && slug[3] === "edit";
  const knownPath = path === "/admin" || adminNavigation.some((section) =>
    "children" in section && section.children.some((child) => child.href === path),
  ) || productEditMatch;
  if (!knownPath) notFound();
  const destination = getAdminDestination(path);

  if (path === "/admin") {
    return (
      <div className="admin-overview">
        <div className="admin-page-heading">
          <div>
            <p className="admin-eyebrow">BASNY · ACCRA</p>
            <h1>Good to see you.</h1>
            <p>Run the store from one place. Pick up where the day needs you.</p>
          </div>
          <Link className="admin-primary-button" href={"/admin/catalogue/products/new" as Route}>
            <HugeiconsIcon icon={PlusSignIcon} aria-hidden="true" /> Add a product
          </Link>
        </div>

        <section className="admin-start-panel" aria-labelledby="admin-start-title">
          <div className="admin-start-panel__copy">
            <p className="admin-eyebrow">A good place to start</p>
            <h2 id="admin-start-title">Keep the shop moving.</h2>
            <p>Update the catalogue, receive new stock, or ring up a customer in store.</p>
          </div>
          <Link className="admin-start-panel__action" href={"/admin/sales/point-of-sale" as Route}>
            <span className="admin-start-panel__action-icon"><HugeiconsIcon icon={PlusSignIcon} aria-hidden="true" /></span>
            <span><strong>Open point of sale</strong><small>Start an in-store sale</small></span>
            <HugeiconsIcon className="admin-start-panel__arrow" icon={ArrowRight01Icon} aria-hidden="true" />
          </Link>
          <Link className="admin-start-panel__action" href={"/admin/inventory" as Route}>
            <span className="admin-start-panel__action-icon admin-start-panel__action-icon--soft"><HugeiconsIcon icon={ArrowRight01Icon} aria-hidden="true" /></span>
            <span><strong>Check stock</strong><small>Review available inventory</small></span>
            <HugeiconsIcon className="admin-start-panel__arrow" icon={ArrowRight01Icon} aria-hidden="true" />
          </Link>
        </section>

        <div className="admin-section-heading">
          <div><p className="admin-eyebrow">YOUR STORE</p><h2>All areas</h2></div>
          <span>10 workspaces</span>
        </div>
        <div className="admin-workspace-grid">
          {adminNavigation.filter((section) => "children" in section).map((section) => (
            <section className="admin-workspace-card" key={section.label}>
              <div className="admin-workspace-card__top">
                <span className="admin-workspace-card__icon"><HugeiconsIcon icon={section.icon} aria-hidden="true" /></span>
                <span className="admin-workspace-card__count">{"children" in section ? section.children.length : 0}</span>
              </div>
              <h3>{section.label}</h3>
              <div className="admin-workspace-card__links">
                {"children" in section && section.children.slice(0, 3).map((item) => (
                  <Link href={item.href as Route} key={item.href}>{item.label}<HugeiconsIcon icon={ArrowRight01Icon} aria-hidden="true" /></Link>
                ))}
                {"children" in section && section.children.length > 3 && <span className="admin-workspace-card__more">+ {section.children.length - 3} more</span>}
              </div>
            </section>
          ))}
        </div>
        <p className="admin-foundation-note"><span aria-hidden="true" /> Admin interface foundation · Store data and permissions will connect in the next build steps.</p>
      </div>
    );
  }

  if (path === "/admin/sales/point-of-sale") return <div className="admin-sales-page"><PointOfSaleWorkspace /></div>;
  if (path === "/admin/sales/orders") return <div className="admin-sales-page"><LiveCommerceWorkspace view="orders" /></div>;
  if (path === "/admin/sales/returns") return <div className="admin-sales-page"><LiveCommerceWorkspace view="returns" /></div>;
  if (path === "/admin/sales/abandoned-carts") return <div className="admin-sales-page"><AbandonedCartsWorkspace /></div>;
  if (path === "/admin/catalogue/products") return <div className="admin-sales-page"><ProductsWorkspace /></div>;
  if (path === "/admin/catalogue/products/new") return <div className="admin-sales-page"><ProductFormWorkspace /></div>;
  if (productEditMatch) return <div className="admin-sales-page"><ProductFormWorkspace productSlug={slug[2]} /></div>;
  if (path === "/admin/catalogue/categories") return <div className="admin-sales-page"><CategoriesWorkspace /></div>;
  if (path === "/admin/catalogue/collections") return <div className="admin-sales-page"><CollectionsWorkspace /></div>;
  if (path === "/admin/catalogue/reviews") return <div className="admin-sales-page"><ReviewsWorkspace /></div>;
  if (path === "/admin/inventory") return <div className="admin-sales-page"><InventoryOverviewWorkspace /></div>;
  if (path === "/admin/inventory/adjustments") return <div className="admin-sales-page"><StockAdjustmentsWorkspace /></div>;
  if (path === "/admin/purchasing/orders") return <div className="admin-sales-page"><PurchaseOrdersWorkspace /></div>;
  if (path === "/admin/purchasing/suppliers") return <div className="admin-sales-page"><SuppliersWorkspace /></div>;
  if (path === "/admin/customers" || path === "/admin/customers/segments") return <div className="admin-sales-page"><CustomersWorkspace path={path} /></div>;
  if (path === "/admin/marketing/promotions" || path === "/admin/marketing/discount-codes") return <div className="admin-sales-page"><MarketingWorkspace path={path} /></div>;
  if (path === "/admin/finances" || path.startsWith("/admin/finances/")) return <div className="admin-sales-page"><FinanceWorkspace path={path} /></div>;
  if (path.startsWith("/admin/storefront/")) return <div className="admin-sales-page"><StorefrontWorkspace path={path} /></div>;
  if (path.startsWith("/admin/reports/")) return <div className="admin-sales-page"><ReportsWorkspace path={path} /></div>;
  if (path.startsWith("/admin/team/")) return <div className="admin-sales-page"><TeamWorkspace path={path} /></div>;
  if (path.startsWith("/admin/settings/")) return <div className="admin-sales-page"><SettingsWorkspace path={path} /></div>;

  const section = adminNavigation.find((item) => "children" in item && item.children.some((child) => child.href === path));
  const siblingLinks = section && "children" in section
    ? section.children.filter((item) => item.href !== path)
    : [];

  return (
    <div className="admin-workspace-page">
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">{section?.label ?? "BASNY ADMIN"}</p>
          <h1>{destination.label}</h1>
          <p>{destination.description}</p>
        </div>
        <Link className="admin-secondary-button" href={"/admin" as Route}>Back to overview</Link>
      </div>
      <section className="admin-module-links" aria-labelledby="admin-module-links-title">
        <div className="admin-section-heading"><div><p className="admin-eyebrow">IN THIS AREA</p><h2 id="admin-module-links-title">Related workspaces</h2></div></div>
        <div className="admin-module-links__grid">
          {siblingLinks.map((item) => (
            <Link className={`admin-module-link${item.href === path ? " is-current" : ""}`} href={item.href as Route} key={item.href} aria-current={item.href === path ? "page" : undefined}>
              <span><strong>{item.label}</strong><small>{item.description}</small></span>
              <HugeiconsIcon icon={ArrowRight01Icon} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
      <p className="admin-foundation-note"><span aria-hidden="true" /> This screen is part of the admin UI foundation. No store data is connected yet.</p>
    </div>
  );
}
