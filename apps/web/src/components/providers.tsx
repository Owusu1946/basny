"use client";

import { Toaster } from "@basny-web/ui/components/sonner";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

import { queryClient } from "@/utils/orpc";

import { ThemeProvider } from "./theme-provider";
import { CartProvider } from "@/lib/cart-context";
import RealtimeProvider from "./realtime-provider";
import { WishlistProvider } from "@/lib/wishlist-context";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <CartProvider><WishlistProvider>{children}</WishlistProvider><RealtimeProvider /></CartProvider>
        <ReactQueryDevtools />
      </QueryClientProvider>
      <Toaster richColors />
    </ThemeProvider>
  );
}
