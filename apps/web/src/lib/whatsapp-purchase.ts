import { formatGhs } from "@/lib/sample-catalog";

// BASNY business number in international format without a leading plus.
const BASNY_WHATSAPP_NUMBER = "233559182794";

export function buildWhatsAppPurchaseUrl({
  productName,
  colour,
  size,
  quantity,
  unitPriceGhs,
  productUrl,
  imageUrl,
}: {
  productName: string;
  colour: string;
  size: string | null;
  quantity: number;
  unitPriceGhs: number;
  productUrl: string;
  imageUrl: string;
}) {
  const message = [
    `Hello BASNY, I want to purchase this ${productName}.`,
    `Colour: ${colour}`,
    ...(size ? [`Size: EU ${size}`] : []),
    `Quantity: ${quantity}`,
    `Price: ${formatGhs(unitPriceGhs * quantity)}`,
    `Product: ${productUrl}`,
    `Image: ${imageUrl}`,
    "Please confirm availability and delivery. Thank you.",
  ].join("\n");

  return `https://wa.me/${BASNY_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
