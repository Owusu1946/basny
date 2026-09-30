import Image from "next/image";
import Link from "next/link";

import { formatGhs } from "@/lib/sample-catalog";
import type { StoreProduct } from "@/lib/catalogue";
import WishlistButton from "@/components/wishlist-button";
import ProductCardActions from "@/components/product-card-actions";
import ProductCardStock from "@/components/product-card-stock";

export default function ProductCard({ product }: { product: StoreProduct }) {
  return (
    <article className="product-card">
      <div className="product-card__media">
        <Link className="product-card__image" href={`/products/${product.slug}`} aria-label={`View ${product.name}`}>
          <Image src={product.image} alt={product.imageAlt} fill unoptimized={product.image.startsWith("http")} sizes="(max-width: 600px) 50vw, (max-width: 1100px) 33vw, 25vw" />
          {product.stock <= 0 ? <span className="product-card__badge product-card__badge--sold-out">Out of stock</span> : product.badge && <span className="product-card__badge">{product.badge}</span>}
        </Link>
        <WishlistButton slug={product.slug} name={product.name} />
        <ProductCardActions product={product} />
      </div>
      <div className="product-card__details">
        <p className="product-card__type">{product.type}</p>
        <h3><Link href={`/products/${product.slug}`}>{product.name}</Link></h3>
        <div className="product-card__price-row"><p className="product-card__price">{formatGhs(product.priceGhs)}{product.regularPriceGhs && product.regularPriceGhs > product.priceGhs ? <del>{formatGhs(product.regularPriceGhs)}</del> : null}</p><ProductCardStock product={product} /></div>
      </div>
    </article>
  );
}
