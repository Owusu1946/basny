import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";

import HeroSlider from "@/components/hero-slider";
import ProductGrid from "@/components/product-grid";
import { defaultHomeContent } from "@basny-web/api/content/home";
import { client } from "@/utils/orpc";
import { getPublicCatalogue } from "@/lib/public-catalogue.server";

const categories = [
  {
    number: "01",
    title: "Shoes",
    description: "Heels, flats, sandals and more",
    href: "/shop/shoes",
    tone: "sand",
  },
  {
    number: "02",
    title: "Bags",
    description: "Everyday shapes and occasion pieces",
    href: "/shop/bags",
    tone: "stone",
  },
  {
    number: "03",
    title: "Accessories",
    description: "The finishing touches",
    href: "/shop/accessories",
    tone: "clay",
  },
] as const;

export default async function Home() {
  let content = defaultHomeContent;
  let catalogue = { products: [] as Awaited<ReturnType<typeof getPublicCatalogue>>["products"], categories: [] as Awaited<ReturnType<typeof getPublicCatalogue>>["categories"] };
  try {
    [content, catalogue] = await Promise.all([client.homeContent(), getPublicCatalogue().then(({ products, categories }) => ({ products, categories }))]);
  } catch {
    // Preview remains available before the content API and database are configured.
  }
  const featuredProducts = catalogue.products.filter((product) => product.featured).slice(0, 4);
  return (
    <main>
      <HeroSlider slides={content.slides} />

      <section className="category-section page-shell" id="new-arrivals" aria-labelledby="category-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Find your thing</p>
            <h2 id="category-title">Shop by category</h2>
          </div>
          <p className="section-note">Good pieces make getting dressed feel easy.</p>
        </div>

        <div className="category-grid">
          {(catalogue.categories.length ? catalogue.categories.map((item, index) => ({ number: String(index + 1).padStart(2, "0"), title: item.name, description: item.description, href: `/shop/${item.slug}`, tone: ["sand", "stone", "clay"][index % 3] })) : categories).map((category) => (
            <Link
              className={`category-card category-card--${category.tone}`}
              href={category.href as Route}
              key={category.title}
            >
              <span className="category-number">{category.number}</span>
              <span className="category-card__bottom">
                <span>
                  <span className="category-card__title">{category.title}</span>
                  <span className="category-card__description">{category.description}</span>
                </span>
                <span className="category-card__arrow" aria-hidden="true">↗</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {featuredProducts.length > 0 && <section className="home-products page-shell" aria-labelledby="home-products-title">
        <div className="home-products__heading">
          <div><p className="eyebrow">A first look</p><h2 id="home-products-title">Pieces to know</h2></div>
          <Link href="/shop">Shop all <span aria-hidden="true">↗</span></Link>
        </div>
        <ProductGrid products={featuredProducts} />
      </section>}

      <section className="delivery-note" aria-label="Delivery fees">
        <div className="page-shell delivery-note__inner">
          <span>From Accra, to your door.</span>
          <span>Accra <strong>GHS 60</strong></span>
          <span>Elsewhere in Ghana <strong>GHS 100</strong></span>
        </div>
      </section>

      <section className="editorial-section page-shell" aria-labelledby="editorial-title">
        <div className="editorial-image">
          <Image
            src={content.editorial.image}
            alt={content.editorial.alt}
            fill
            sizes="(max-width: 760px) 100vw, 48vw"
            className="editorial-image__asset"
          />
        </div>
        <div className="editorial-copy">
          <p className="eyebrow">{content.editorial.eyebrow}</p>
          <h2 id="editorial-title">{content.editorial.title}</h2>
          <p>{content.editorial.description}</p>
          <Link className="text-link" href={content.editorial.linkHref as Route}>{content.editorial.linkLabel} <span aria-hidden="true">↗</span></Link>
        </div>
      </section>

    </main>
  );
}
