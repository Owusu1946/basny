"use client";

import { usePathname } from "next/navigation";
import Header from "@/components/header";
import SiteFooter from "@/components/site-footer";

const authPaths = ["/login", "/register", "/forgot-password", "/reset-password", "/verify-email"];

export default function StorefrontChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthScreen = authPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const hideChrome = isAuthScreen || pathname === "/admin" || pathname.startsWith("/admin/");
  return <div className="min-h-screen">
    {!hideChrome && <a className="skip-link" href="#main-content">Skip to content</a>}
    {!hideChrome && <Header />}
    <div id="main-content" tabIndex={-1}>{children}</div>
    {!hideChrome && <SiteFooter />}
  </div>;
}
