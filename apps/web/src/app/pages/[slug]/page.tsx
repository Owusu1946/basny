import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { client } from "@/utils/orpc";
import { getPublicStoreRedirect } from "@/lib/public-catalogue.server";
import { getPublicStoreSeoSettings } from "@/lib/public-catalogue.server";
import { getPublicSiteOrigin } from "@/lib/public-site.server";

type Props = { params: Promise<{ slug: string }> };
async function getPage(slug: string) {
  try { return await client.getPublishedStorePage({ slug }); }
  catch { return null; }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) return { title: "Page not found | BASNY Enterprise" };
  const seo = await getPublicStoreSeoSettings();
  const origin = getPublicSiteOrigin(seo);
  return { ...(origin ? { metadataBase: origin } : {}), title: page.metaTitle || `${page.title} | BASNY Enterprise`, description: page.metaDescription || page.summary, alternates: { canonical: `/pages/${page.slug}` } };
}

export default async function StoreInformationPage({ params }: Props) {
  const { slug } = await params;
  const page = await getPage(slug);
  if (!page) {
    const destination = await getPublicStoreRedirect(`/pages/${slug}`);
    if (destination) permanentRedirect(destination as Route);
    notFound();
  }
  return <main className="page-shell store-information-page"><nav aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true"> / </span><span>{page.title}</span></nav><header><p className="admin-eyebrow">BASNY ENTERPRISE · INFORMATION</p><h1>{page.title}</h1><p>{page.summary}</p></header><article>{page.body.split(/\n{2,}/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</article></main>;
}
