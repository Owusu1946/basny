"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import ProductGrid from "@/components/product-grid";
import type { StoreCatalogue, StoreProduct } from "@/lib/catalogue";
import { useQuery } from "@tanstack/react-query";
import { client } from "@/utils/orpc";

type SortValue = "featured" | "price-asc" | "price-desc" | "name";

export default function CatalogListing({
  products: initialProducts,
  initialCategories = [],
  title,
  description,
  initialCategory,
  query,
}: {
  products: StoreProduct[];
  initialCategories?: StoreCatalogue["categories"];
  title: string;
  description: string;
  initialCategory?: string;
  query?: string;
}) {
  const catalogueQuery = useQuery({
    queryKey: ["catalogue", "public"],
    queryFn: async (): Promise<Pick<StoreCatalogue, "products" | "categories">> => {
      const { mapStoreCatalogue } = await import("@/lib/catalogue");
      const data = mapStoreCatalogue(await client.listPublicCatalogue());
      return { products: data.products, categories: data.categories };
    },
    initialData: { products: initialProducts, categories: initialCategories },
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const products = catalogueQuery.data.products;
  const categories = catalogueQuery.data.categories;
  const [category, setCategory] = useState<string>(initialCategory ?? "all");
  const [sort, setSort] = useState<SortValue>("featured");
  const [size, setSize] = useState("all");
  const [colour, setColour] = useState("all");
  const [price, setPrice] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const colours = useMemo(() => Array.from(new Set(products.filter((product) => category === "all" || product.category === category).flatMap((product) => product.colours.map((option) => option.name)))), [products, category]);
  const activeFilterCount = Number(category !== "all") + Number(size !== "all") + Number(colour !== "all") + Number(price !== "all");

  function clearFilters() {
    setCategory("all");
    setSize("all");
    setColour("all");
    setPrice("all");
  }

  const filtered = useMemo(() => {
    const result = products.filter((product) =>
      (category === "all" || product.category === category) &&
      (size === "all" || product.sizes.includes(size)) &&
      (colour === "all" || product.colours.some((option) => option.name === colour)) &&
      (price === "all" || (price === "under-300" && product.priceGhs < 300) || (price === "300-450" && product.priceGhs >= 300 && product.priceGhs <= 450) || (price === "over-450" && product.priceGhs > 450))
    );

    if (sort === "price-asc") result.sort((a, b) => a.priceGhs - b.priceGhs);
    if (sort === "price-desc") result.sort((a, b) => b.priceGhs - a.priceGhs);
    if (sort === "name") result.sort((a, b) => a.name.localeCompare(b.name));
    return result;
  }, [products, category, size, colour, price, sort]);

  return (
    <main className="catalog-page page-shell">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link><span aria-hidden="true">/</span><span>{query ? "Search" : title}</span>
      </nav>
      <div className="catalog-intro">
        <div className="catalog-intro__copy">
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>
      <div className="catalog-layout">
        <aside className="catalog-filters" aria-label="Filter products">
          <h2>Filter</h2>
          <button className="catalog-filter-toggle" type="button" aria-expanded={filtersOpen} aria-controls="catalog-filter-fields" onClick={() => setFiltersOpen((open) => !open)}>
            <span>Filters {activeFilterCount > 0 && `(${activeFilterCount})`}</span>
            <span aria-hidden="true">{filtersOpen ? "−" : "+"}</span>
          </button>
          <div id="catalog-filter-fields" className={`catalog-filter-fields${filtersOpen ? " catalog-filter-fields--open" : ""}`}>
          <fieldset>
            <legend>Category</legend>
            <label><input type="radio" name="category" checked={category === "all"} onChange={() => { setCategory("all"); setSize("all"); setColour("all"); }} /> All products</label>
            {categories.map((item) => (
              <label key={item.slug}>
                <input type="radio" name="category" checked={category === item.slug} onChange={() => { setCategory(item.slug); setSize("all"); setColour("all"); }} /> {item.name}
              </label>
            ))}
          </fieldset>
          {category === "shoes" && (
            <div className="catalog-filter-group">
              <label htmlFor="catalog-size">Shoe size</label>
              <select id="catalog-size" value={size} onChange={(event) => setSize(event.target.value)}>
                <option value="all">All sizes</option>
                {["36", "37", "38", "39", "40", "41"].map((option) => <option key={option} value={option}>EU {option}</option>)}
              </select>
            </div>
          )}
          <div className="catalog-filter-group">
            <label htmlFor="catalog-price">Price</label>
            <select id="catalog-price" value={price} onChange={(event) => setPrice(event.target.value)}>
              <option value="all">All prices</option>
              <option value="under-300">Under GHS 300</option>
              <option value="300-450">GHS 300–450</option>
              <option value="over-450">Over GHS 450</option>
            </select>
          </div>
          {colours.length > 1 && <div className="catalog-filter-group">
            <label htmlFor="catalog-colour">Colour</label>
            <select id="catalog-colour" value={colour} onChange={(event) => setColour(event.target.value)}>
              <option value="all">All colours</option>
              {colours.map((option) => <option value={option} key={option}>{option}</option>)}
            </select>
          </div>}
          {(category !== "all" || size !== "all" || colour !== "all" || price !== "all") && <button className="filter-clear" type="button" onClick={clearFilters}>Clear filters</button>}
          </div>
        </aside>
        <div className="catalog-results">
          <div className="catalog-toolbar">
            <span aria-live="polite">{filtered.length} {filtered.length === 1 ? "piece" : "pieces"}</span>
            <label>Sort by <select value={sort} onChange={(event) => setSort(event.target.value as SortValue)}>
              <option value="featured">Featured</option>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
              <option value="name">Name: A to Z</option>
            </select></label>
          </div>
          {catalogueQuery.isError && <div className="catalogue-load-state" role="alert"><div className="catalogue-load-state__mark">!</div><div><strong>Catalogue refresh failed</strong><p>Showing the last available products. Try again to check for updates.</p></div><button type="button" className="admin-secondary-button" onClick={() => void catalogueQuery.refetch()}>Try again</button></div>}{filtered.length ? <ProductGrid products={filtered} /> : (
            <div className="catalog-empty"><h2>{query ? "No products found." : "No pieces match these filters."}</h2><p>{query ? "Try a different search, or browse the collection." : "Try another size, colour or price."}</p>{query ? <Link href="/shop">Browse all products</Link> : <button type="button" onClick={clearFilters}>Clear filters</button>}</div>
          )}
        </div>
      </div>
    </main>
  );
}
