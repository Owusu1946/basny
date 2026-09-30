export const categories = [
  { slug: "shoes", name: "Shoes", description: "Heels, flats and sandals for wherever the day goes." },
  { slug: "bags", name: "Bags", description: "The pieces you reach for on ordinary days and special ones." },
  { slug: "accessories", name: "Accessories", description: "Small finishing touches, chosen with care." },
] as const;

export type CategorySlug = (typeof categories)[number]["slug"];

export type SampleProduct = {
  slug: string;
  name: string;
  category: CategorySlug;
  type: string;
  priceGhs: number;
  description: string;
  material: string;
  image: string;
  imageAlt: string;
  badge?: string;
  colours: { name: string; hex: string }[];
  sizes: string[];
};

// Preview content only. Stock and purchasable variants will come from the commerce API.
export const sampleProducts: SampleProduct[] = [
  {
    slug: "sera-block-heel",
    name: "Sera Block Heel",
    category: "shoes",
    type: "Heels",
    priceGhs: 340,
    description: "An easy mid heel with a steady block shape and a clean leather finish. Made for the plans that run a little longer.",
    material: "Leather look upper · cushioned insole",
    image: "/images/products/sera-block-heel.webp",
    imageAlt: "A pair of dark chocolate brown block heel shoes on an ivory background",
    badge: "New",
    colours: [{ name: "Chocolate", hex: "#503326" }],
    sizes: ["37", "38", "39", "40", "41"],
  },
  {
    slug: "adwoa-ballet-flat",
    name: "Adwoa Ballet Flat",
    category: "shoes",
    type: "Flats",
    priceGhs: 265,
    description: "A soft, simple flat that works with just about everything. The small bow keeps the shape classic.",
    material: "Leather look upper · flexible sole",
    image: "/images/products/adwoa-ballet-flat.webp",
    imageAlt: "A pair of tan ballet flats with small bows on an ivory background",
    colours: [{ name: "Tan", hex: "#a96835" }],
    sizes: ["36", "37", "38", "39", "40", "41"],
  },
  {
    slug: "nia-strap-sandal",
    name: "Nia Strap Sandal",
    category: "shoes",
    type: "Sandals",
    priceGhs: 295,
    description: "A polished sandal with an ankle strap and a comfortable low heel for warm days and evenings out.",
    material: "Leather look upper · adjustable buckle",
    image: "/images/products/nia-strap-sandal.webp",
    imageAlt: "A pair of bronze brown ankle strap sandals on an ivory background",
    badge: "Popular",
    colours: [{ name: "Bronze", hex: "#764d34" }],
    sizes: ["37", "38", "39", "40", "41"],
  },
  {
    slug: "mira-shoulder-bag",
    name: "Mira Shoulder Bag",
    category: "bags",
    type: "Shoulder bags",
    priceGhs: 425,
    description: "A clean crescent shape with room for daily essentials. The warm cream finish pairs easily with the rest of your wardrobe.",
    material: "Leather look outer · lined interior",
    image: "/images/products/mira-shoulder-bag.webp",
    imageAlt: "A cream crescent shoulder bag on an ivory background",
    badge: "New",
    colours: [{ name: "Cream", hex: "#d5c9af" }],
    sizes: [],
  },
  {
    slug: "everyday-tote",
    name: "Everyday Tote",
    category: "bags",
    type: "Tote bags",
    priceGhs: 480,
    description: "A roomy tote with a soft structure and two easy handles. Ready for the workday and the weekend.",
    material: "Leather look outer · lined interior",
    image: "/images/products/everyday-tote.webp",
    imageAlt: "A dark brown structured tote bag on an ivory background",
    colours: [{ name: "Cocoa", hex: "#49342c" }],
    sizes: [],
  },
  {
    slug: "twist-hoops",
    name: "Twist Hoops",
    category: "accessories",
    type: "Jewellery",
    priceGhs: 145,
    description: "Small twisted hoops that add just enough shine, whether you are dressing up or keeping it simple.",
    material: "Gold tone metal",
    image: "/images/products/twist-hoops.webp",
    imageAlt: "A pair of gold twisted hoop earrings on an ivory background",
    colours: [{ name: "Gold", hex: "#b59655" }],
    sizes: [],
  },
  {
    slug: "kora-satin-scarf",
    name: "Kora Satin Scarf",
    category: "accessories",
    type: "Scarves",
    priceGhs: 125,
    description: "A soft satin scarf in warm, easy colours. Tie it at the neck, in your hair, or around a bag handle.",
    material: "Satin look fabric",
    image: "/images/products/kora-satin-scarf.webp",
    imageAlt: "A warm cream, cocoa and bronze satin scarf on an ivory background",
    badge: "New",
    colours: [{ name: "Cream print", hex: "#d4c2a5" }],
    sizes: [],
  },
  {
    slug: "tortoiseshell-clips",
    name: "Tortoiseshell Clips",
    category: "accessories",
    type: "Hair accessories",
    priceGhs: 95,
    description: "A pair of smooth tortoiseshell clips for a simple finishing touch.",
    material: "Acetate look finish",
    image: "/images/products/tortoiseshell-clips.webp",
    imageAlt: "A pair of tortoiseshell hair clips on an ivory background",
    colours: [{ name: "Tortoiseshell", hex: "#744e31" }],
    sizes: [],
  },
];

export function getProduct(slug: string) {
  return sampleProducts.find((product) => product.slug === slug);
}

export function getCategory(slug: string) {
  return categories.find((category) => category.slug === slug);
}

export function formatGhs(amount: number) {
  return `GHS ${new Intl.NumberFormat("en-GH", { maximumFractionDigits: 0 }).format(amount)}`;
}
