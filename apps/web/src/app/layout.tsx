import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "../index.css";
import Providers from "@/components/providers";
import PwaRegistration from "@/components/pwa-registration";
import StorefrontChrome from "@/components/storefront-chrome";
import { getPublicStoreSeoSettings } from "@/lib/public-catalogue.server";
import { getPublicSiteOrigin } from "@/lib/public-site.server";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const seo = await getPublicStoreSeoSettings();
  const origin = getPublicSiteOrigin(seo);
  return {
    metadataBase: origin,
    title: { default: seo.siteTitle, template: "%s | BASNY Enterprise" },
    description: seo.siteDescription,
    robots: { index: seo.indexingEnabled, follow: seo.indexingEnabled },
    openGraph: { type: "website", siteName: seo.siteTitle, description: seo.siteDescription },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <PwaRegistration />

        <Providers>
          <StorefrontChrome>{children}</StorefrontChrome>
        </Providers>
      </body>
    </html>
  );
}
