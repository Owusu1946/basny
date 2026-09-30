"use client";

import { getApiBaseUrl } from "@/lib/api-url";
import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  Delete02Icon,
  Folder01Icon,
  Package01Icon,
  PlusSignIcon,
  SaleTag01Icon,
  Search01Icon,
  StarIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { AdminPagination, paginateItems } from "@/components/admin/admin-pagination";
import { ConfirmActionDialog } from "@/components/admin/confirm-action-dialog";

import {
  initialCatalogueCategories,
  initialCatalogueCollections,
  initialCatalogueProducts,
  readCatalogueState,
  writeCatalogueState,
  type CatalogueCategory,
  type CatalogueCollection,
  type CatalogueProduct,
  type CatalogueReview,
} from "@/lib/admin-catalogue-data";
import { formatGhs } from "@/lib/sample-catalog";
import { client } from "@/utils/orpc";

type AdminCatalogueData = Awaited<ReturnType<typeof client.listAdminCatalogue>>;
const adminCatalogueKeys = ["products", "categories", "collections", "reviews"];
const titleStatus = (value: string) => value === "published" ? "Published" : value === "archived" ? "Archived" : value === "hidden" ? "Hidden" : value === "rejected" ? "Rejected" : value === "removed" ? "Removed" : value === "pending" ? "Pending" : "Draft";
function mapDbProduct(product: AdminCatalogueData["products"][number]): CatalogueProduct {
  const media = product.media[0];
  return { slug: product.slug, name: product.name, category: product.category.slug, type: product.type, priceGhs: product.priceGhs, description: product.description, material: product.material, image: media?.url ?? "/images/product-placeholder.svg", imageAlt: media?.alt ?? `${product.name} product image`, ...(media?.objectKey && media.thumbnailUrl && media.detailUrl ? { imageMedia: { objectKey: media.objectKey, thumbnailUrl: media.thumbnailUrl, detailUrl: media.detailUrl, width: media.width ?? 1200, height: media.height ?? 1200 } } : {}), colours: product.colours, sizes: product.sizes.filter((size): size is string => Boolean(size)), variantStock: Object.fromEntries(product.variants.map((variant) => [`${variant.colour}::${variant.size ?? ""}`, variant.stock])), metaTitle: product.metaTitle, metaDescription: product.metaDescription, sku: product.variants[0]?.sku ?? "—", stock: product.stock, status: titleStatus(product.status) as CatalogueProduct["status"], featured: product.featured, updatedAt: new Intl.DateTimeFormat("en-GH", { dateStyle: "medium" }).format(new Date(product.updatedAt)) };
}

async function persistCatalogueChange<T>(key: string, previous: T, next: T, database: AdminCatalogueData) {
  if (key === "categories") {
    const before = previous as CatalogueCategory[]; const after = next as CatalogueCategory[];
    for (const item of after) {
      const old = before.find((record) => record.slug === item.slug);
      const stored = database.categories.find((record) => record.slug === item.slug);
      if (old && JSON.stringify(old) === JSON.stringify(item)) continue;
      await client.saveCatalogueCategory({ ...(stored ? { id: stored.id } : {}), slug: item.slug, name: item.name, description: item.description, active: item.active, sortOrder: Math.max(0, after.indexOf(item)) });
    }
  }
  if (key === "products") {
    const before = previous as CatalogueProduct[]; const after = next as CatalogueProduct[];
    for (const item of after) {
      const old = before.find((record) => record.slug === item.slug); const stored = database.products.find((record) => record.slug === item.slug);
      if (old && JSON.stringify(old) === JSON.stringify(item)) continue;
      if (!stored && item.image.startsWith("data:")) throw new Error("Image upload must finish before this product can be saved.");
      const category = database.categories.find((record) => record.slug === item.category);
      if (!category) throw new Error("Select a category that exists in the catalogue.");
      const colours = item.colours.length ? item.colours : [{ name: "Standard", hex: "#765139" }];
      const sizes: (string | null)[] = item.sizes.length ? item.sizes : [null];
      const options = colours.flatMap((colour) => sizes.map((size) => ({ colour, size })));
      const baseSku = item.sku && item.sku !== "—" ? item.sku : `BAS-${item.slug.slice(0, 8).toUpperCase()}`;
      await client.saveCatalogueProduct({ ...(stored ? { id: stored.id } : {}), slug: item.slug, name: item.name, categoryId: category.id, type: item.type, priceGhs: Math.round(item.priceGhs), description: item.description, material: item.material, metaTitle: item.metaTitle, metaDescription: item.metaDescription, status: item.status.toLowerCase() as "published" | "draft" | "archived", featured: item.featured,
        variants: options.map((option, index) => ({ sku: stored?.variants.find((variant) => variant.colour === option.colour.name && variant.size === option.size)?.sku ?? (options.length === 1 ? baseSku : `${baseSku}-V${String(index + 1).padStart(2, "0")}`), colour: option.colour.name, colourHex: option.colour.hex, size: option.size, priceGhs: Math.round(item.priceGhs), stock: item.variantStock?.[`${option.colour.name}::${option.size ?? ""}`] ?? Math.floor(item.stock / options.length) + (index < item.stock % options.length ? 1 : 0), active: true, sortOrder: index })),
        media: [{ ...(item.imageMedia ? { objectKey: item.imageMedia.objectKey, thumbnailUrl: item.imageMedia.thumbnailUrl, detailUrl: item.imageMedia.detailUrl, width: item.imageMedia.width, height: item.imageMedia.height } : {}), url: item.image, alt: item.imageAlt || `${item.name} product image`, mimeType: "image/webp", sortOrder: 0 }],
      });
    }
    for (const old of before) if (!after.some((item) => item.slug === old.slug)) await client.setCatalogueProductStatus({ slug: old.slug, status: "archived" });
  }
  if (key === "collections") {
    const before = previous as CatalogueCollection[]; const after = next as CatalogueCollection[];
    for (const item of after) {
      const old = before.find((record) => record.id === item.id); const stored = database.collections.find((record) => record.id === item.id || record.name === item.name);
      if (old && JSON.stringify(old) === JSON.stringify(item)) continue;
      const slug = stored?.slug ?? `${item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${crypto.randomUUID().slice(0, 4)}`;
      await client.saveCatalogueCollection({ ...(stored ? { id: stored.id } : {}), slug, name: item.name, description: item.description, status: item.status.toLowerCase() as "published" | "draft", featured: item.featured, sortOrder: Math.max(0, after.indexOf(item)), productSlugs: item.products });
    }
  }
  if (key === "reviews") {
    const before = previous as CatalogueReview[]; const after = next as CatalogueReview[];
    for (const item of after) {
      const old = before.find((record) => record.id === item.id); if (old && JSON.stringify(old) === JSON.stringify(item)) continue;
      await client.moderateCatalogueReview({ id: item.id, status: item.status.toLowerCase() as "published" | "hidden" | "rejected" | "pending" | "removed", reply: item.reply });
    }
    for (const item of before) if (!after.some((record) => record.id === item.id)) await client.moderateCatalogueReview({ id: item.id, status: "removed", reply: item.reply });
  }
}

function Icon({ icon }: { icon: IconSvgElement }) {
  return <HugeiconsIcon icon={icon} aria-hidden="true" />;
}

export function useCatalogueState<T>(key: string, initial: T) {
  const [value, setValue] = useState(initial);
  const valueRef = useRef(value);
  valueRef.current = value;
  const [ready, setReady] = useState(false);
  const catalogueKey = adminCatalogueKeys.includes(key);
  const catalogueQuery = useQuery({ queryKey: ["admin-catalogue"], queryFn: () => client.listAdminCatalogue(), enabled: catalogueKey, staleTime: 20_000, refetchOnWindowFocus: true });
  const queryClient = useQueryClient();
  useEffect(() => {
    if (catalogueKey) {
      if (!catalogueQuery.data) return;
      const data = catalogueQuery.data;
      const serverValue = key === "products" ? data.products.map(mapDbProduct)
        : key === "categories" ? data.categories.map((item) => ({ slug: item.slug, name: item.name, description: item.description, active: item.active }))
        : key === "collections" ? data.collections.map((item) => ({ id: item.id, name: item.name, description: item.description, products: item.products, status: titleStatus(item.status) as "Published" | "Draft", featured: item.featured }))
        : data.reviews.filter((item) => item.status !== "removed").map((item) => ({ id: item.id, productSlug: item.productSlug, customer: item.customer, rating: item.rating, title: item.title, body: item.body, submitted: new Intl.DateTimeFormat("en-GH", { dateStyle: "medium" }).format(new Date(item.createdAt)), status: titleStatus(item.status) as CatalogueReview["status"], verifiedPurchase: true, reply: item.reply }));
      setValue(serverValue as T); setReady(true); return;
    }
    setValue(readCatalogueState(key, initial));
    setReady(true);
  }, [catalogueKey, catalogueQuery.data, initial, key]);
  useEffect(() => {
    if (ready && !catalogueKey) writeCatalogueState(key, value);
  }, [key, ready, value, catalogueKey]);
  const setCatalogueValue = useCallback<React.Dispatch<React.SetStateAction<T>>>((action) => {
    const current = valueRef.current;
    const next = typeof action === "function" ? (action as (previous: T) => T)(current) : action;
    valueRef.current = next;
    setValue(next);
    if (catalogueKey && catalogueQuery.data) void persistCatalogueChange(key, current, next, catalogueQuery.data).then(() => Promise.all([queryClient.invalidateQueries({ queryKey: ["admin-catalogue"] }), queryClient.invalidateQueries({ queryKey: ["catalogue"] })])).catch((error: unknown) => { toast.error(error instanceof Error ? error.message : "Catalogue update failed."); void catalogueQuery.refetch(); });
  }, [catalogueKey, catalogueQuery.data, catalogueQuery.refetch, key, queryClient]);
  const hasCachedData = Boolean(catalogueQuery.data);
  return [value, catalogueKey ? setCatalogueValue : setValue, ready, { isLoading: catalogueKey && catalogueQuery.isLoading && !hasCachedData, isError: catalogueKey && catalogueQuery.isError && !hasCachedData, refetch: catalogueQuery.refetch }] as const;
}

function CatalogueLoadState({ isLoading, isError, refetch, label }: { isLoading: boolean; isError: boolean; refetch: () => unknown; label: string }) {
  if (!isLoading && !isError) return null;
  return <section className="catalogue-load-state" role={isError ? "alert" : "status"} aria-live="polite"><div className="catalogue-load-state__mark">{isError ? "!" : <span />}</div><div><strong>{isError ? `Could not load ${label}` : `Loading ${label}`}</strong><p>{isError ? "Your changes are safe. Check your connection and try again." : "Getting the latest catalogue data…"}</p></div>{isError && <button type="button" className="admin-secondary-button" onClick={() => void refetch()}>Try again</button>}</section>;
}

function CatalogueProductsSkeleton() {
  return <div className="catalogue-products-skeleton" aria-busy="true" aria-label="Loading products">
    <span className="visually-hidden">Loading products</span>
    <div className="catalogue-products-skeleton__summary" aria-hidden="true">{Array.from({ length: 4 }, (_, index) => <div key={index}><i /><b /><i /></div>)}</div>
    <div className="catalogue-products-skeleton__toolbar" aria-hidden="true"><i /><i /><i /><i /></div>
    <div className="catalogue-products-skeleton__table" aria-hidden="true">
      <div className="catalogue-products-skeleton__table-head">{Array.from({ length: 7 }, (_, index) => <i key={index} />)}</div>
      {Array.from({ length: 6 }, (_, index) => <div className="catalogue-products-skeleton__row" key={index}><span><i /><b><i /><i /></b></span>{Array.from({ length: 5 }, (_, cell) => <i key={cell} />)}<i /></div>)}
    </div>
    <div className="catalogue-products-skeleton__mobile" aria-hidden="true">{Array.from({ length: 4 }, (_, index) => <div key={index}><i /><span><b /><i /><i /></span></div>)}</div>
  </div>;
}

function CatalogueProductFormSkeleton() {
  return <div className="catalogue-form-skeleton" aria-busy="true" aria-label="Loading product details">
    <span className="visually-hidden">Loading product details</span>
    <div className="catalogue-form-skeleton__main" aria-hidden="true">{Array.from({ length: 4 }, (_, index) => <section key={index}><i /><b />{Array.from({ length: index === 0 ? 4 : 3 }, (__, field) => <span key={field}><i /><i /></span>)}</section>)}</div>
    <aside aria-hidden="true"><i /><b /><i /><span /><i /></aside>
  </div>;
}

function ProductImage({ product, className = "" }: { product: Pick<CatalogueProduct, "image" | "imageAlt">; className?: string }) {
  return <div className={`catalogue-product-image ${className}`}><Image src={product.image} alt={product.imageAlt} fill sizes="(max-width: 720px) 42vw, 150px" unoptimized={product.image.startsWith("data:") || product.image.startsWith("http")} /></div>;
}

function CatalogueHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="catalogue-heading"><div><p className="admin-eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function CatalogueStatus({ status }: { status: string }) {
  return <span className={`catalogue-status catalogue-status--${status.toLowerCase()}`}><i />{status}</span>;
}

function useProducts() {
  return useCatalogueState<CatalogueProduct[]>("products", initialCatalogueProducts);
}

export function ProductsWorkspace() {
  const [products, setProducts, , queryState] = useCatalogueState<CatalogueProduct[]>("products", initialCatalogueProducts);
  const [categoryRecords] = useCatalogueState<CatalogueCategory[]>("categories", initialCatalogueCategories);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState("All categories");
  const [availability, setAvailability] = useState("All statuses");
  const [selected, setSelected] = useState<CatalogueProduct | null>(null);
  const filtered = useMemo(() => products.filter((product) =>
    (category === "All categories" || product.category === category) &&
    (availability === "All statuses" || product.status === availability) &&
    `${product.name} ${product.sku} ${product.type} ${product.category}`.toLowerCase().includes(query.toLowerCase()),
  ), [availability, category, products, query]);
  const pageProducts = paginateItems(filtered, page, 25);
  const stockValue = products.reduce((sum, item) => sum + item.stock, 0);
  if (queryState.isLoading) return <div className="catalogue-workspace"><CatalogueHeading eyebrow="CATALOGUE · PRODUCTS" title="Products" description="Manage the products, pricing, and options customers see across BASNY." /><CatalogueProductsSkeleton /></div>;
  if (queryState.isError) return <div className="catalogue-workspace"><CatalogueHeading eyebrow="CATALOGUE · PRODUCTS" title="Products" description="Manage the products, pricing, and options customers see across BASNY." /><CatalogueLoadState {...queryState} label="products" /></div>;

  function changeProduct(product: CatalogueProduct, changes: Partial<CatalogueProduct>, selectAfterChange = true) {
    const next = { ...product, ...changes, updatedAt: "Just now" };
    setProducts((current) => current.map((item) => item.slug === product.slug ? next : item));
    if (selectAfterChange) setSelected(next);
  }

  return <div className="catalogue-workspace"><CatalogueHeading eyebrow="CATALOGUE · PRODUCTS" title="Products" description="Manage the products, pricing, and options customers see across BASNY." action={<Link href="/admin/catalogue/products/new" className="admin-primary-button" ><Icon icon={PlusSignIcon} /> Add product</Link>} /><CatalogueLoadState {...queryState} label="products" />
    <div className="catalogue-summary-cards"><div><span>Products</span><strong>{products.length}</strong><small>Across {categoryRecords.length} categories</small></div><div><span>Published</span><strong>{products.filter((item) => item.status === "Published").length}</strong><small>Visible in the catalogue</small></div><div><span>Units in stock</span><strong>{stockValue}</strong><small>Across all product variants</small></div><div><span>Needs attention</span><strong>{products.filter((item) => item.stock <= 4).length}</strong><small>Low or out of stock</small></div></div>
    <div className="catalogue-toolbar"><label className="catalogue-search"><Icon icon={Search01Icon} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search product name or SKU" /></label><label className="catalogue-select"><span>Category</span><select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}><option>All categories</option>{categoryRecords.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select><Icon icon={ArrowDown01Icon} /></label><label className="catalogue-select"><span>Status</span><select value={availability} onChange={(event) => { setAvailability(event.target.value); setPage(1); }}><option>All statuses</option><option>Published</option><option>Draft</option><option>Archived</option></select><Icon icon={ArrowDown01Icon} /></label><span className="catalogue-count">{filtered.length} products</span></div>
    <div className="catalogue-table-wrap"><table className="catalogue-table"><thead><tr><th>Product</th><th>Category</th><th>SKU</th><th>Price</th><th>Stock</th><th>Status</th><th><span className="visually-hidden">Actions</span></th></tr></thead><tbody>{pageProducts.map((product) => <tr key={product.slug}><td><div className="catalogue-table-product"><ProductImage product={product} /><span><strong>{product.name}</strong><small>{product.type}{product.featured ? " · Featured" : ""}</small></span></div></td><td>{product.category}</td><td className="catalogue-sku">{product.sku}</td><td className="catalogue-money">{formatGhs(product.priceGhs)}</td><td><span className={product.stock <= 4 ? "catalogue-stock catalogue-stock--low" : "catalogue-stock"}>{product.stock} {product.stock === 1 ? "unit" : "units"}</span></td><td><CatalogueStatus status={product.status} /></td><td><div className="catalogue-row-actions"><button className="catalogue-text-action" type="button" aria-pressed={product.featured} onClick={() => changeProduct(product, { featured: !product.featured }, false)}>{product.featured ? "Unfeature" : "Feature"}</button><button className="catalogue-text-action" type="button" onClick={() => setSelected(product)}>Quick view</button><Link href={`/admin/catalogue/products/${product.slug}/edit` as Route} className="catalogue-text-action">Edit</Link></div></td></tr>)}</tbody></table>{filtered.length === 0 && <p className="catalogue-empty">No products match these filters.</p>}</div>
    <div className="catalogue-mobile-products">{pageProducts.map((product) => <article className="catalogue-mobile-card" key={product.slug}><div className="catalogue-mobile-card__top"><ProductImage product={product} /><div><CatalogueStatus status={product.status} /><h3>{product.name}</h3><p>{product.category} · {product.sku}</p><strong>{formatGhs(product.priceGhs)}</strong></div></div><div className="catalogue-mobile-card__bottom"><span className={product.stock <= 4 ? "catalogue-stock catalogue-stock--low" : "catalogue-stock"}>{product.stock} in stock</span><button className="catalogue-text-action" type="button" aria-pressed={product.featured} onClick={() => changeProduct(product, { featured: !product.featured }, false)}>{product.featured ? "Unfeature" : "Feature"}</button><button className="catalogue-text-action" type="button" onClick={() => setSelected(product)}>Quick view</button><Link className="catalogue-text-action" href={`/admin/catalogue/products/${product.slug}/edit` as Route}>Edit</Link></div></article>)}</div>
    <AdminPagination total={filtered.length} page={page} pageSize={25} onPageChange={setPage} label="products" />
    <p className="catalogue-data-note">Stock shown here is the combined quantity across each product’s active variants.</p>
    {selected && <div className="catalogue-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section className="catalogue-modal" role="dialog" aria-modal="true" aria-labelledby="catalogue-quick-title"><button className="catalogue-modal__close" type="button" aria-label="Close" onClick={() => setSelected(null)}>×</button><ProductImage product={selected} className="catalogue-quick-image" /><p className="admin-eyebrow">{selected.category} · {selected.type}</p><h2 id="catalogue-quick-title">{selected.name}</h2><p>{selected.description}</p><div className="catalogue-quick-facts"><span>Price<strong>{formatGhs(selected.priceGhs)}</strong></span><span>SKU<strong>{selected.sku}</strong></span><span>Stock<strong>{selected.stock} units</strong></span></div><label className="catalogue-select catalogue-quick-status"><span>Product status</span><select value={selected.status} onChange={(event) => changeProduct(selected, { status: event.target.value as CatalogueProduct["status"] })}><option>Published</option><option>Draft</option><option>Archived</option></select><Icon icon={ArrowDown01Icon} /></label><div className="catalogue-modal__actions"><button className="admin-secondary-button" type="button" onClick={() => setSelected(null)}>Close</button><Link className="admin-primary-button" href={`/admin/catalogue/products/${selected.slug}/edit` as Route}>Edit product <Icon icon={ArrowRight01Icon} /></Link></div></section></div>}
  </div>;
}

type ProductDraft = {
  name: string; category: string; type: string; price: string; description: string; material: string;
  sku: string; stock: string; variantStock: Record<string, string>; colour: string; hex: string; sizes: string; status: CatalogueProduct["status"]; featured: boolean; image: string; imageMedia?: CatalogueProduct["imageMedia"]; imageAlt: string; metaTitle: string; metaDescription: string;
};

const blankProductDraft: ProductDraft = { name: "", category: "shoes", type: "", price: "", description: "", material: "", sku: "", stock: "0", variantStock: {}, colour: "", hex: "#765139", sizes: "", status: "Draft", featured: false, image: "", imageAlt: "", metaTitle: "", metaDescription: "" };

function productVariantOptions(colourText: string, sizesText: string, hex: string) {
  const colours = colourText.split(",").map((name) => name.trim()).filter(Boolean).map((name) => ({ name, hex }));
  const sizes = sizesText.split(",").map((size) => size.trim()).filter(Boolean) as (string | null)[];
  return (colours.length ? colours : [{ name: "Standard", hex: "#765139" }]).flatMap((colour) => (sizes.length ? sizes : [null]).map((size) => ({ colour, size, key: `${colour.name}::${size ?? ""}` })));
}

function stockAllocation(total: number, count: number) {
  return Array.from({ length: count }, (_, index) => Math.floor(total / count) + (index < total % count ? 1 : 0));
}

type ProductImageUploadProgress = { percent: number; phase: "uploading" | "processing" };

async function uploadProductImage(file: File, onProgress: (progress: ProductImageUploadProgress) => void) {
  if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)) throw new Error("Choose a JPG, PNG, WebP, or AVIF image.");
  if (file.size > 12 * 1024 * 1024) throw new Error("Choose an image under 12 MB.");
  const form = new FormData(); form.set("file", file);
  return new Promise<NonNullable<CatalogueProduct["imageMedia"]> & { url: string }>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${getApiBaseUrl()}/api/admin/catalogue/images`);
    request.withCredentials = true;
    request.timeout = 120_000;
    request.addEventListener("load", () => {
      type UploadResponse = { error?: string; media?: NonNullable<CatalogueProduct["imageMedia"]> & { url: string } };
      let result: UploadResponse | null = null;
      try { result = JSON.parse(request.responseText) as UploadResponse; } catch { /* The server may return a plain-text proxy error. */ }
      if (request.status < 200 || request.status >= 300 || !result?.media) {
        reject(new Error(result?.error ?? "Image upload failed. Check storage configuration and try again."));
        return;
      }
      resolve(result.media);
    });
    request.addEventListener("error", () => reject(new Error("Image upload failed because the connection was interrupted. Please try again.")));
    request.addEventListener("abort", () => reject(new Error("Image upload was cancelled.")));
    request.addEventListener("timeout", () => reject(new Error("Image upload took too long. Check your connection and try again.")));
    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
      onProgress({ percent, phase: percent === 100 ? "processing" : "uploading" });
    });
    request.send(form);
  });
}

export function ProductFormWorkspace({ productSlug }: { productSlug?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [products, , ready, queryState] = useCatalogueState<CatalogueProduct[]>("products", initialCatalogueProducts);
  const [categoriesList] = useCatalogueState<CatalogueCategory[]>("categories", initialCatalogueCategories);
  const [draft, setDraft] = useState<ProductDraft>(blankProductDraft);
  const [imageError, setImageError] = useState("");
  const [imageUpload, setImageUpload] = useState<{ fileName: string; percent: number; phase: ProductImageUploadProgress["phase"] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const editing = Boolean(productSlug);
  const availableCategories = categoriesList.filter((item) => item.active || item.slug === draft.category);

  useEffect(() => {
    if (!ready || !productSlug) return;
    const product = products.find((item) => item.slug === productSlug);
    if (!product) return;
    setDraft({ name: product.name, category: product.category, type: product.type, price: String(product.priceGhs), description: product.description, material: product.material, sku: product.sku, stock: String(product.stock), variantStock: Object.fromEntries(Object.entries(product.variantStock ?? {}).map(([key, value]) => [key, String(value)])), colour: product.colours.map((colour) => colour.name).join(", "), hex: product.colours[0]?.hex ?? "#765139", sizes: product.sizes.join(", "), status: product.status, featured: product.featured, image: product.image, imageMedia: product.imageMedia, imageAlt: product.imageAlt ?? "", metaTitle: product.metaTitle ?? "", metaDescription: product.metaDescription ?? "" });
  }, [productSlug, products, ready]);

  function update<K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  const variantOptions = productVariantOptions(draft.colour, draft.sizes, draft.hex);
  const allocatedStock = stockAllocation(Math.max(0, Number.parseInt(draft.stock, 10) || 0), variantOptions.length);
  function updateVariantStock(key: string, raw: string) {
    setDraft((current) => {
      const options = productVariantOptions(current.colour, current.sizes, current.hex);
      const defaults = stockAllocation(Math.max(0, Number.parseInt(current.stock, 10) || 0), options.length);
      const nextStocks = { ...Object.fromEntries(options.map((option, index) => [option.key, current.variantStock[option.key] ?? String(defaults[index])])), [key]: raw };
      return { ...current, variantStock: nextStocks, stock: String(options.reduce((sum, option) => sum + Math.max(0, Number.parseInt(nextStocks[option.key] ?? "0", 10) || 0), 0)) };
    });
    setSaved(false);
  }

  function distributeTotalStock(raw: string) {
    setDraft((current) => {
      const options = productVariantOptions(current.colour, current.sizes, current.hex);
      const allocation = stockAllocation(Math.max(0, Number.parseInt(raw, 10) || 0), options.length);
      return { ...current, stock: raw, variantStock: Object.fromEntries(options.map((option, index) => [option.key, String(allocation[index])])) };
    });
    setSaved(false);
  }

  async function selectImage(file: File | undefined) {
    if (!file) return;
    setImageError("");
    setImageUpload({ fileName: file.name, percent: 0, phase: "uploading" });
    try { const media = await uploadProductImage(file, (progress) => setImageUpload((current) => current ? { ...current, ...progress } : current)); setDraft((current) => ({ ...current, image: media.url, imageMedia: media })); setSaved(false); }
    catch (error) { setImageError(error instanceof Error ? error.message : "Could not use this image."); }
    finally { setImageUpload(null); }
  }

  async function saveProduct(status: CatalogueProduct["status"]) {
    const existing = productSlug ? products.find((item) => item.slug === productSlug) : undefined;
    const slug = existing?.slug ?? `${draft.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${Date.now().toString().slice(-4)}`;
    const fallbackImage = existing?.image ?? products.find((item) => item.category === draft.category)?.image ?? products[0]?.image ?? "/images/products/sera-block-heel.webp";
    const colours = draft.colour.split(",").map((name) => name.trim()).filter(Boolean).map((name) => ({ name, hex: draft.hex }));
    const next: CatalogueProduct = {
      ...(existing ?? { badge: undefined }),
      slug, name: draft.name.trim(), category: draft.category, type: draft.type.trim() || draft.category,
      priceGhs: Number(draft.price), description: draft.description.trim(), material: draft.material.trim() || "Material details to be confirmed",
      image: draft.image || fallbackImage, imageAlt: draft.imageAlt.trim() || `${draft.name.trim()} product image`, metaTitle: draft.metaTitle.trim() || `${draft.name.trim()} | BASNY Enterprise`, metaDescription: draft.metaDescription.trim() || draft.description.trim().slice(0, 160), sku: draft.sku.trim() || `BAS-${slug.slice(0, 6).toUpperCase()}`,
      ...(draft.imageMedia ? { imageMedia: draft.imageMedia } : existing?.imageMedia ? { imageMedia: existing.imageMedia } : {}),
      stock: Math.max(0, Number.parseInt(draft.stock, 10) || 0), status, featured: draft.featured,
      updatedAt: "Just now", colours, sizes: draft.sizes.split(",").map((size) => size.trim()).filter(Boolean), variantStock: Object.fromEntries(variantOptions.map((option, index) => [option.key, Math.max(0, Number.parseInt(draft.variantStock[option.key] ?? String(allocatedStock[index]), 10) || 0)])),
    };
    next.stock = Object.values(next.variantStock ?? {}).reduce((sum, stock) => sum + stock, 0);
    setSaving(true); setImageError("");
    try {
      const database = queryClient.getQueryData<AdminCatalogueData>(["admin-catalogue"]);
      if (!database) throw new Error("Catalogue data is still loading. Please try saving again.");
      const after = existing ? products.map((item) => item.slug === existing.slug ? next : item) : [next, ...products];
      await persistCatalogueChange("products", products, after, database);
      setDraft((current) => ({ ...current, status })); setSaved(true);
      toast.success(editing ? "Product changes saved." : status === "Draft" ? "Product saved as draft." : "Product published.");
      void Promise.all([queryClient.invalidateQueries({ queryKey: ["admin-catalogue"] }), queryClient.invalidateQueries({ queryKey: ["catalogue"] })]);
      if (!editing) router.push("/admin/catalogue/products" as Route);
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "Product could not be saved. Please try again.");
    } finally { setSaving(false); }
  }

  const canSave = !imageUpload && draft.name.trim().length > 0 && Number(draft.price) > 0 && Boolean(draft.category);
  const missingProduct = ready && Boolean(productSlug) && !products.some((item) => item.slug === productSlug);
  if (queryState.isLoading) return <div className="catalogue-workspace"><CatalogueHeading eyebrow="CATALOGUE · PRODUCTS" title={editing ? "Edit product" : "Add a product"} description="Loading the shared product catalogue." /><CatalogueProductFormSkeleton /></div>;
  if (queryState.isError) return <div className="catalogue-workspace"><CatalogueHeading eyebrow="CATALOGUE · PRODUCTS" title={editing ? "Edit product" : "Add a product"} description="Loading the shared product catalogue." /><CatalogueLoadState {...queryState} label="product data" /></div>;
  if (missingProduct) return <div className="catalogue-workspace"><CatalogueHeading eyebrow="CATALOGUE · PRODUCTS" title="Product not found" description="This product is no longer in the catalogue." action={<Link href="/admin/catalogue/products" className="admin-secondary-button">Back to products</Link>} /></div>;
  return <div className="catalogue-workspace catalogue-form-workspace"><CatalogueHeading eyebrow={`CATALOGUE · ${editing ? "EDIT PRODUCT" : "PRODUCT SETUP"}`} title={editing ? "Edit product" : "Add a product"} description="Product details, options, and visibility in one place." action={<Link href="/admin/catalogue/products" className="admin-secondary-button">Back to products</Link>} />
    <div className="catalogue-form-layout"><form className="catalogue-form-main" onSubmit={(event) => event.preventDefault()}>
      <section className="catalogue-form-section"><div className="catalogue-form-section__heading"><span>01</span><div><h2>Product details</h2><p>Start with the information customers need to recognize this item.</p></div></div><div className="catalogue-form-grid"><label className="catalogue-field catalogue-field--wide">Product name <span aria-hidden="true">*</span><input required value={draft.name} onChange={(event) => update("name", event.target.value)} placeholder="e.g. Sera Block Heel" /></label><label className="catalogue-field">Category<select value={draft.category} onChange={(event) => update("category", event.target.value)}>{availableCategories.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label><label className="catalogue-field">Product type<input value={draft.type} onChange={(event) => update("type", event.target.value)} placeholder="e.g. Block heels" /></label><label className="catalogue-field catalogue-field--wide">Description<textarea rows={4} value={draft.description} onChange={(event) => update("description", event.target.value)} placeholder="Describe the shape, feel, and details." /></label><label className="catalogue-field catalogue-field--wide">Material and care<input value={draft.material} onChange={(event) => update("material", event.target.value)} placeholder="e.g. Leather look upper · wipe clean" /></label></div></section>
      <section className="catalogue-form-section"><div className="catalogue-form-section__heading"><span>02</span><div><h2>Price & stock</h2><p>Set the Ghana cedi price and the current unit count.</p></div></div><div className="catalogue-form-grid"><label className="catalogue-field">Price (GHS) <span aria-hidden="true">*</span><div className="catalogue-input-prefix"><span>GHS</span><input required inputMode="decimal" type="number" min="0.01" step="0.01" value={draft.price} onChange={(event) => update("price", event.target.value)} placeholder="0.00" /></div></label><label className="catalogue-field">Total units<input type="number" min="0" step="1" value={draft.stock} onChange={(event) => distributeTotalStock(event.target.value)} /><small>Entering a total distributes it evenly across the options below.</small></label><label className="catalogue-field catalogue-field--wide">SKU <small>Optional · Leave blank to create one</small><input value={draft.sku} onChange={(event) => update("sku", event.target.value.toUpperCase())} placeholder="BAS-SHO-009" /></label></div></section>
      <section className="catalogue-form-section"><div className="catalogue-form-section__heading"><span>03</span><div><h2>Colours & sizes</h2><p>Set the options a customer can choose from.</p></div></div><div className="catalogue-form-grid"><label className="catalogue-field">Colour names <small>Separate multiple colours with commas</small><input value={draft.colour} onChange={(event) => update("colour", event.target.value)} placeholder="Chocolate, Tan" /></label><label className="catalogue-field">Colour swatch<input type="color" className="catalogue-color-input" value={draft.hex} onChange={(event) => update("hex", event.target.value)} /></label><label className="catalogue-field catalogue-field--wide">Sizes <small>Separate sizes with commas. Leave blank for one-size products.</small><input value={draft.sizes} onChange={(event) => update("sizes", event.target.value)} placeholder="36, 37, 38, 39, 40" /></label></div><div className="catalogue-variant-hint"><Icon icon={Package01Icon} /><p>New options start at zero stock. Set or correct on-hand quantities under Inventory after saving.</p></div><div className="catalogue-variant-stock-grid">{variantOptions.map((option, index) => <label className="catalogue-field" key={option.key}>{option.colour.name}{option.size ? ` · EU ${option.size}` : " · One size"}<input type="number" min="0" step="1" value={draft.variantStock[option.key] ?? String(allocatedStock[index])} onChange={(event) => updateVariantStock(option.key, event.target.value)} /></label>)}</div></section>
      <section className="catalogue-form-section"><div className="catalogue-form-section__heading"><span>04</span><div><h2>Product image</h2><p>Add a clear image of the item on a simple background.</p></div></div><label className={`catalogue-image-upload${imageUpload ? " is-uploading" : ""}`}><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={Boolean(imageUpload)} onChange={(event) => { const input = event.currentTarget; const file = input.files?.[0]; void selectImage(file).finally(() => { input.value = ""; }); }} /><span className="catalogue-image-upload__preview">{draft.image ? <Image src={draft.image} alt="Selected product" fill unoptimized sizes="160px" /> : <Icon icon={PlusSignIcon} />}</span><span><strong>{draft.image ? "Image selected" : "Choose a product image"}</strong><small>JPG, PNG, WebP or AVIF · up to 12 MB. BASNY stores responsive WebP sizes for you.</small><em>{imageUpload ? "Uploading…" : "Browse files"}</em></span></label>{imageUpload && <div className="catalogue-upload-progress"><div><span>{imageUpload.fileName}</span><strong>{imageUpload.percent}%</strong></div><div className="catalogue-upload-progress__track" role="progressbar" aria-label={`Upload progress for ${imageUpload.fileName}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={imageUpload.percent}><span style={{ width: `${imageUpload.percent}%` }} /></div><p aria-live="polite">{imageUpload.phase === "processing" ? "Upload complete · Preparing responsive images…" : "Uploading product image…"}</p></div>}<label className="catalogue-field catalogue-field--wide">Image alt text <small>Describe what is visible in the product photo for shoppers using screen readers.</small><input value={draft.imageAlt} onChange={(event) => update("imageAlt", event.target.value)} placeholder={`${draft.name || "Product"} product image`} /></label>{imageError && <p className="catalogue-form-error" role="alert">{imageError}</p>}</section>
      <section className="catalogue-form-section"><div className="catalogue-form-section__heading"><span>05</span><div><h2>Search preview</h2><p>Help customers find this product through clear search results.</p></div></div><div className="catalogue-form-grid"><label className="catalogue-field catalogue-field--wide">Meta title <small>{draft.metaTitle.length}/60 · Defaults to product name and store name</small><input maxLength={60} value={draft.metaTitle} onChange={(event) => update("metaTitle", event.target.value)} placeholder={`${draft.name || "Product name"} | BASNY Enterprise`} /></label><label className="catalogue-field catalogue-field--wide">Meta description <small>{draft.metaDescription.length}/160 · Summarize the product accurately</small><textarea rows={3} maxLength={160} value={draft.metaDescription} onChange={(event) => update("metaDescription", event.target.value)} placeholder={draft.description || "Describe the product in one concise sentence."} /></label></div></section>
    </form>
    <aside className="catalogue-publish-panel"><p className="admin-eyebrow">STORE VISIBILITY</p><h2>{editing ? "Visibility & changes" : "Ready for customers?"}</h2><p>{editing ? "Choose where this product appears and save your updates." : "Save this product as a draft while you complete details, or publish it to make it visible in the catalogue."}</p>{editing && <label className="catalogue-field">Status<select value={draft.status} onChange={(event) => update("status", event.target.value as CatalogueProduct["status"])}><option>Draft</option><option>Published</option><option>Archived</option></select></label>}<label className="catalogue-featured-choice"><input type="checkbox" checked={draft.featured} onChange={(event) => update("featured", event.target.checked)} /><span><strong>Featured product</strong><small>Show this item in “Pieces to know” on the homepage when published.</small></span></label><div className="catalogue-publish-preview"><span>{draft.image ? <Image src={draft.image} alt="" fill unoptimized sizes="80px" /> : <Icon icon={Package01Icon} />}</span><div><strong>{draft.name || "Product name"}</strong><small>{draft.category} · {draft.price ? formatGhs(Number(draft.price)) : "Set a price"}</small></div></div>{saved && <p className="catalogue-form-saved"><Icon icon={CheckmarkCircle02Icon} /> Product saved to the catalogue.</p>}{!editing && <button type="button" className="admin-secondary-button" disabled={!canSave || saving} onClick={() => void saveProduct("Draft")}>{saving ? "Saving…" : "Save as draft"}</button>}<button type="button" className="admin-primary-button" disabled={!canSave || saving} onClick={() => void saveProduct(editing ? draft.status : "Published")}>{saving ? "Saving…" : editing ? "Save changes" : "Publish product"}<Icon icon={CheckmarkCircle02Icon} /></button><small className="catalogue-local-note">Product details are shared with your storefront.</small></aside></div>
  </div>;
}

export function CategoriesWorkspace() {
  const [categoriesList, setCategoriesList, , queryState] = useCatalogueState<CatalogueCategory[]>("categories", initialCatalogueCategories);
  const [products] = useProducts();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const counts = useMemo(() => products.reduce<Record<string, number>>((result, product) => ({ ...result, [product.category]: (result[product.category] ?? 0) + 1 }), {}), [products]);
  if (queryState.isLoading || queryState.isError) return <div className="catalogue-workspace"><CatalogueHeading eyebrow="CATALOGUE · ORGANIZATION" title="Categories" description="Keep the shop easy to browse with clear product groupings." /><CatalogueLoadState {...queryState} label="categories" /></div>;

  function saveCategory() {
    const cleanName = name.trim();
    if (!cleanName) return;
    if (editing) {
      setCategoriesList((current) => current.map((item) => item.slug === editing ? { ...item, name: cleanName, description: description.trim() } : item));
      setEditing(null);
    } else {
      const slug = `${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${Date.now().toString().slice(-3)}`;
      setCategoriesList((current) => [...current, { slug, name: cleanName, description: description.trim(), active: true }]);
    }
    setName(""); setDescription("");
  }
  function beginEdit(item: CatalogueCategory) { setEditing(item.slug); setName(item.name); setDescription(item.description); }

  return <div className="catalogue-workspace"><CatalogueHeading eyebrow="CATALOGUE · ORGANIZATION" title="Categories" description="Keep the shop easy to browse with clear product groupings." /><CatalogueLoadState {...queryState} label="categories" /><div className="catalogue-category-layout"><section className="catalogue-category-list"><div className="catalogue-subheading"><div><h2>Store categories</h2><p>These groupings organize the customer catalogue.</p></div><span>{categoriesList.length} categories</span></div>{categoriesList.map((item) => <article className={`catalogue-category-card${item.active ? "" : " is-inactive"}`} key={item.slug}><span className="catalogue-category-icon"><Icon icon={Folder01Icon} /></span><div className="catalogue-category-copy"><h3>{item.name}</h3><p>{item.description || "No description added."}</p><small>{counts[item.slug] ?? 0} products · {item.active ? "Active" : "Hidden from store"}</small></div><div className="catalogue-category-actions"><button type="button" className="catalogue-text-action" onClick={() => beginEdit(item)}>Edit</button><button type="button" className="catalogue-text-action" onClick={() => setCategoriesList((current) => current.map((entry) => entry.slug === item.slug ? { ...entry, active: !entry.active } : entry))}>{item.active ? "Hide" : "Show"}</button></div></article>)}</section><section className="catalogue-category-editor"><p className="admin-eyebrow">{editing ? "EDIT CATEGORY" : "NEW CATEGORY"}</p><h2>{editing ? "Update category" : "Add a category"}</h2><p>Give customers a short, clear way to narrow their browse.</p><label className="catalogue-field">Category name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Work bags" /></label><label className="catalogue-field">Description<textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="A short line to explain this group." /></label><button type="button" className="admin-primary-button" disabled={!name.trim()} onClick={saveCategory}>{editing ? "Save category" : "Add category"}<Icon icon={PlusSignIcon} /></button>{editing && <button type="button" className="catalogue-cancel-edit" onClick={() => { setEditing(null); setName(""); setDescription(""); }}>Cancel edit</button>}</section></div><p className="catalogue-data-note">Category changes update the shared storefront catalogue. Hide a category to remove it and its products from customer browsing.</p></div>;
}

export function CollectionsWorkspace() {
  const [collections, setCollections, , queryState] = useCatalogueState<CatalogueCollection[]>("collections", initialCatalogueCollections);
  const [products] = useProducts();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [status, setStatus] = useState<CatalogueCollection["status"]>("Draft");
  const [featured, setFeatured] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const selected = collections.find((item) => item.id === selectedId);
  if (queryState.isLoading || queryState.isError) return <div className="catalogue-workspace"><CatalogueHeading eyebrow="CATALOGUE · MERCHANDISING" title="Collections" description="Curate products into edits that make the catalogue feel considered." /><CatalogueLoadState {...queryState} label="collections" /></div>;

  function editCollection(item: CatalogueCollection) { setSelectedId(item.id); setName(item.name); setDescription(item.description); setPicked(item.products); setStatus(item.status); setFeatured(item.featured); setFormOpen(true); }
  function resetForm() { setSelectedId(null); setName(""); setDescription(""); setPicked([]); setStatus("Draft"); setFeatured(false); setFormOpen(false); }
  function saveCollection() {
    if (!name.trim()) return;
    const id = selectedId ?? `COL-${String(Date.now()).slice(-5)}`;
    const next: CatalogueCollection = { id, name: name.trim(), description: description.trim(), products: picked, status, featured };
    setCollections((current) => selectedId ? current.map((item) => item.id === selectedId ? next : item) : [next, ...current]);
    resetForm();
  }

  return <div className="catalogue-workspace"><CatalogueHeading eyebrow="CATALOGUE · MERCHANDISING" title="Collections" description="Curate products into edits that make the catalogue feel considered." action={<button type="button" className="admin-primary-button" onClick={() => { resetForm(); setFormOpen(true); }}><Icon icon={PlusSignIcon} /> New collection</button>} /><CatalogueLoadState {...queryState} label="collections" /><div className="catalogue-collection-grid">{collections.map((item) => <article className="catalogue-collection-card" key={item.id}><div className="catalogue-collection-card__images">{item.products.slice(0, 3).map((slug) => { const product = products.find((entry) => entry.slug === slug); return product ? <ProductImage key={slug} product={product} /> : null; })}{item.products.length === 0 && <Icon icon={SaleTag01Icon} />}</div><div className="catalogue-collection-card__body"><div><CatalogueStatus status={item.status} />{item.featured && <span className="catalogue-featured-tag">Featured</span>}</div><h2>{item.name}</h2><p>{item.description || "No description added."}</p><span>{item.products.length} products · {item.id}</span><div className="catalogue-collection-card__actions"><button type="button" className="catalogue-text-action" onClick={() => editCollection(item)}>Edit collection</button><button type="button" className="catalogue-text-action" onClick={() => setCollections((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: entry.status === "Published" ? "Draft" : "Published" } : entry))}>{item.status === "Published" ? "Unpublish" : "Publish"}</button></div></div></article>)}</div><p className="catalogue-data-note">Published collections appear in the storefront and update as soon as the catalogue refreshes.</p>
    {formOpen && <div className="catalogue-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) resetForm(); }}><section className="catalogue-modal catalogue-collection-modal" role="dialog" aria-modal="true" aria-labelledby="collection-form-title"><button className="catalogue-modal__close" type="button" aria-label="Close" onClick={resetForm}>×</button><p className="admin-eyebrow">CATALOGUE · COLLECTION</p><h2 id="collection-form-title">{selected ? "Edit collection" : "Create a collection"}</h2><label className="catalogue-field">Collection name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Weekend edit" /></label><label className="catalogue-field">Description<textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Tell the story of this edit." /></label><label className="catalogue-field">Visibility<select value={status} onChange={(event) => setStatus(event.target.value as CatalogueCollection["status"])}><option>Draft</option><option>Published</option></select></label><label className="catalogue-featured-choice"><input type="checkbox" checked={featured} onChange={(event) => setFeatured(event.target.checked)} /> Feature this collection in the storefront</label><fieldset className="catalogue-product-picker"><legend>Add products <span>{picked.length} selected</span></legend>{products.map((product) => <label key={product.slug}><input type="checkbox" checked={picked.includes(product.slug)} onChange={(event) => setPicked((current) => event.target.checked ? [...current, product.slug] : current.filter((slug) => slug !== product.slug))} /><ProductImage product={product} /><span><strong>{product.name}</strong><small>{formatGhs(product.priceGhs)}</small></span></label>)}</fieldset><div className="catalogue-modal__actions"><button type="button" className="admin-secondary-button" onClick={resetForm}>Cancel</button><button type="button" className="admin-primary-button" disabled={!name.trim()} onClick={saveCollection}>{selected ? "Save collection" : "Create collection"}<Icon icon={CheckmarkCircle02Icon} /></button></div></section></div>}
  </div>;
}

export function ReviewsWorkspace() {
  const [reviews, setReviews, , queryState] = useCatalogueState<CatalogueReview[]>("reviews", []);
  const [filter, setFilter] = useState("All reviews");
  const [query, setQuery] = useState("");
  const [submittedFrom, setSubmittedFrom] = useState("");
  const [submittedTo, setSubmittedTo] = useState("");
  const [reviewPage, setReviewPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<CatalogueReview | null>(null);
  const products = useProducts()[0];
  const productBySlug = useMemo(() => new Map(products.map((product) => [product.slug, product])), [products]);
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Accra", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const submittedDateKey = (value: string) => {
    if (/^today\b/i.test(value)) return todayKey;
    if (/^yesterday\b/i.test(value)) { const date = new Date(`${todayKey}T00:00:00Z`); date.setUTCDate(date.getUTCDate() - 1); return date.toISOString().slice(0, 10); }
    const iso = value.match(/\b\d{4}-\d{2}-\d{2}\b/);
    const match = value.match(/\b(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\b/);
    const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].findIndex((name) => name.toLowerCase() === match?.[2]?.toLowerCase());
    if (iso) return iso[0];
    return match && month >= 0 ? `${match[3]}-${String(month + 1).padStart(2, "0")}-${String(Number(match[1])).padStart(2, "0")}` : "0000-00-00";
  };
  const filtered = reviews.filter((review) => {
    const product = productBySlug.get(review.productSlug);
    const submitted = submittedDateKey(review.submitted);
    return (filter === "All reviews" || review.status === filter) && (!submittedFrom || submitted >= submittedFrom) && (!submittedTo || submitted <= submittedTo) && `${review.customer} ${review.title} ${review.body} ${product?.name ?? ""}`.toLowerCase().includes(query.toLowerCase());
  }).sort((a, b) => submittedDateKey(b.submitted).localeCompare(submittedDateKey(a.submitted)));
  const pageReviews = paginateItems(filtered, reviewPage, 25);
  function updateReview(id: string, changes: Partial<CatalogueReview>) { setReviews((current) => current.map((review) => review.id === id ? { ...review, ...changes } : review)); }
  const publishedReviews = reviews.filter((review) => review.status === "Published");
  return <div className="catalogue-workspace"><CatalogueHeading eyebrow="CATALOGUE · CUSTOMER VOICE" title="Reviews" description="Read product feedback, moderate visibility, and reply to customers." action={<div className="catalogue-review-summary"><strong>{(publishedReviews.reduce((sum, item) => sum + item.rating, 0) / (publishedReviews.length || 1)).toFixed(1)}<span>/ 5</span></strong><span>{publishedReviews.length} published reviews</span></div>} /><CatalogueLoadState {...queryState} label="reviews" /><div className="catalogue-toolbar"><label className="catalogue-search"><Icon icon={Search01Icon} /><input value={query} onChange={(event) => { setQuery(event.target.value); setReviewPage(1); }} placeholder="Search reviews or products" /></label><label className="catalogue-date-filter">Submitted from<input type="date" value={submittedFrom} max={submittedTo || undefined} onChange={(event) => { setSubmittedFrom(event.target.value); setReviewPage(1); }} /></label><label className="catalogue-date-filter">Submitted to<input type="date" value={submittedTo} min={submittedFrom || undefined} onChange={(event) => { setSubmittedTo(event.target.value); setReviewPage(1); }} /></label>{(submittedFrom || submittedTo) && <button className="catalogue-text-action" type="button" onClick={() => { setSubmittedFrom(""); setSubmittedTo(""); setReviewPage(1); }}>Clear dates</button>}<div className="catalogue-filter-tabs" role="tablist" aria-label="Filter reviews">{["All reviews", "Pending", "Published", "Hidden", "Rejected"].map((item) => <button key={item} type="button" role="tab" aria-selected={filter === item} className={filter === item ? "is-active" : ""} onClick={() => { setFilter(item); setReviewPage(1); }}>{item}<span>{item === "All reviews" ? reviews.length : reviews.filter((review) => review.status === item).length}</span></button>)}</div></div><div className="catalogue-review-list">{pageReviews.map((review) => { const product = productBySlug.get(review.productSlug); return <article className="catalogue-review-card" key={review.id}><div className="catalogue-review-card__head"><div className="catalogue-review-customer"><span>{review.customer.slice(0, 1)}</span><div><strong>{review.customer}</strong><small>{review.submitted} · {review.id} {review.verifiedPurchase ? "· Verified purchase" : ""}</small></div></div><CatalogueStatus status={review.status} /></div><div className="catalogue-review-rating" aria-label={`${review.rating} out of 5 stars`}>{Array.from({ length: 5 }, (_, index) => <Icon key={index} icon={StarIcon} />).map((star, index) => <span className={index < review.rating ? "is-filled" : ""} key={index}>{star}</span>)}</div><h2>{review.title}</h2><p className="catalogue-review-body">{review.body}</p><div className="catalogue-review-product">{product && <ProductImage product={product} />}<span>Review for<strong>{product?.name ?? "Removed product"}</strong></span></div><label className="catalogue-field catalogue-review-reply">Reply to customer<textarea rows={2} value={review.reply} onChange={(event) => updateReview(review.id, { reply: event.target.value })} placeholder="Write a thoughtful response." /></label><div className="catalogue-review-actions"><button className="catalogue-text-action" type="button" onClick={() => updateReview(review.id, { status: review.status === "Published" ? "Hidden" : "Published" })}>{review.status === "Published" ? "Hide review" : "Publish review"}</button><button className="catalogue-text-action" type="button" onClick={() => updateReview(review.id, { status: "Rejected" })}>Reject</button><button className="catalogue-text-action" type="button" onClick={() => setPendingDelete(review)}>Delete</button><button className="admin-primary-button" type="button" onClick={() => updateReview(review.id, { status: "Published" })}>Save & publish <Icon icon={CheckmarkCircle02Icon} /></button></div></article>; })}</div><AdminPagination total={filtered.length} page={reviewPage} pageSize={25} onPageChange={setReviewPage} label="reviews" />{filtered.length === 0 && <p className="catalogue-empty">No reviews found for this filter.</p>}<p className="catalogue-data-note">Only reviews submitted for delivered orders appear here. Reviews can be moderated or hidden without removing the order-linked record.</p>{pendingDelete && <ConfirmActionDialog eyebrow="REVIEW MODERATION" title="Delete this review?" description="The review is removed from public moderation lists while its order-linked record remains available for audit." confirmLabel="Delete review" onCancel={() => setPendingDelete(null)} onConfirm={() => { setReviews((current) => current.filter((review) => review.id !== pendingDelete.id)); setPendingDelete(null); }} />}</div>;
}
