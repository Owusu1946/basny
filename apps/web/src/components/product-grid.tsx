import ProductCard from "@/components/product-card";
import type { StoreProduct } from "@/lib/catalogue";

export default function ProductGrid({ products }: { products: StoreProduct[] }) {
  return (
    <div className="product-grid">
      {products.map((product) => <ProductCard product={product} key={product.slug} />)}
    </div>
  );
}
