import { ArrowRight01Icon, ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

export default function DirectionalIcon({ direction = "diagonal" }: { direction?: "diagonal" | "right" }) {
  return <HugeiconsIcon className="directional-icon" icon={direction === "right" ? ArrowRight01Icon : ArrowUpRight01Icon} size={18} aria-hidden="true" />;
}
