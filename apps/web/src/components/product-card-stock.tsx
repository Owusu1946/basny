"use client";

import { useQuery } from "@tanstack/react-query";
import type { StoreProduct } from "@/lib/catalogue";
import { mapStoreCatalogue } from "@/lib/catalogue";
import { client } from "@/utils/orpc";

export default function ProductCardStock({ product }: { product: StoreProduct }) {
  const catalogue = useQuery({
    queryKey: ["catalogue", "public"],
    queryFn: async () => mapStoreCatalogue(await client.listPublicCatalogue()),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const stock = catalogue.data?.products.find((item) => item.slug === product.slug)?.stock ?? product.stock;
  return <span className={`product-card__stock${stock > 0 && stock <= 5 ? " product-card__stock--low" : ""}`} aria-label={stock === 1 ? "1 unit left" : `${stock} units left`}>{stock === 0 ? "Out of stock" : `${stock} ${stock === 1 ? "unit" : "units"} left`}</span>;
}
