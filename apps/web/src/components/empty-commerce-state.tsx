import DirectionalIcon from "@/components/directional-icon";
import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";

type EmptyCommerceStateProps = {
  icon: IconSvgElement;
  title: string;
  description: string;
  actionLabel?: string;
  query?: string;
};

export default function EmptyCommerceState({
  icon,
  title,
  description,
  actionLabel = "Back to BASNY",
  query,
}: EmptyCommerceStateProps) {
  return (
    <main className="empty-state page-shell">
      <div className="empty-state__icon"><HugeiconsIcon icon={icon} aria-hidden="true" /></div>
      {query ? <p className="eyebrow">Search results</p> : null}
      <h1>{title}</h1>
      <p className="empty-state__description">{description}</p>
      {query ? <p className="empty-state__query">Your search: “{query}”</p> : null}
      <Link className="button-primary" href="/#shoes">{actionLabel}<DirectionalIcon /></Link>
    </main>
  );
}
