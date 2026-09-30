import { z } from "zod";

const shopLink = z.string().regex(/^\/(?:shop(?:\/[a-z-]+)?|products\/[a-z0-9-]+)$/);

export const heroSlideSchema = z.object({
  eyebrow: z.string().trim().min(2).max(60),
  title: z.string().trim().min(5).max(90),
  description: z.string().trim().min(10).max(180),
  image: z.enum([
    "/images/hero/sandals-shoulder-bag.png",
    "/images/hero/heels-getting-ready.png",
    "/images/hero/flats-tote-clutch.png",
  ]),
  alt: z.string().trim().min(10).max(160),
  primaryLabel: z.string().trim().min(2).max(32),
  primaryHref: shopLink,
  secondaryLabel: z.string().trim().min(2).max(32),
  secondaryHref: shopLink,
});

export const homeContentSchema = z.object({
  slides: z.array(heroSlideSchema).length(3),
  editorial: z.object({
    eyebrow: z.string().trim().min(2).max(60),
    title: z.string().trim().min(5).max(90),
    description: z.string().trim().min(10).max(220),
    image: heroSlideSchema.shape.image,
    alt: z.string().trim().min(10).max(160),
    linkLabel: z.string().trim().min(2).max(40),
    linkHref: shopLink,
  }),
});

export type HomeContent = z.infer<typeof homeContentSchema>;

export const defaultHomeContent: HomeContent = {
  slides: [
    { eyebrow: "Shoes & bags, Accra", title: "Shoes for your kind of day.", description: "Find the pair you’ll reach for, and the bag that goes with it.", image: "/images/hero/sandals-shoulder-bag.png", alt: "Chocolate brown heeled sandals with a cream shoulder bag", primaryLabel: "Shop shoes", primaryHref: "/shop/shoes", secondaryLabel: "Explore bags", secondaryHref: "/shop/bags" },
    { eyebrow: "Made for going out", title: "A pair for the plans.", description: "A little polish for dinner, a celebration, or just because.", image: "/images/hero/heels-getting-ready.png", alt: "Black block heels worn with cream trousers, beside a burgundy bag", primaryLabel: "Browse heels", primaryHref: "/shop/shoes", secondaryLabel: "See accessories", secondaryHref: "/shop/accessories" },
    { eyebrow: "The everyday edit", title: "Bags, flats, out the door.", description: "Easy pieces that fit into the way you already dress.", image: "/images/hero/flats-tote-clutch.png", alt: "Tan ballet flats, a dark brown tote and a cream clutch", primaryLabel: "Explore bags", primaryHref: "/shop/bags", secondaryLabel: "Shop shoes", secondaryHref: "/shop/shoes" },
  ],
  editorial: { eyebrow: "BASNY, Accra", title: "Good things, chosen with care.", description: "Explore shoes, bags and accessories for the plans you make and the days that just happen.", image: "/images/hero/flats-tote-clutch.png", alt: "Tan flats, a dark brown tote and a cream clutch arranged on an ivory background", linkLabel: "Explore the collection", linkHref: "/shop" },
};
