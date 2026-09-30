import { varlockNextConfigPlugin } from "@varlock/nextjs-integration/plugin";

const withVarlock = varlockNextConfigPlugin();
import type { NextConfig } from "next";

import { withPwa } from "./pwa.config";

const nextConfig: NextConfig = {
  async rewrites() {
    const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL?.replace(/\/$/, "");
    if (!serverUrl) throw new Error("NEXT_PUBLIC_SERVER_URL must point to the backend service.");
    return [
      { source: "/api/auth/:path*", destination: `${serverUrl}/api/auth/:path*` },
      { source: "/rpc/:path*", destination: `${serverUrl}/rpc/:path*` },
      { source: "/api/realtime/:path*", destination: `${serverUrl}/api/realtime/:path*` },
      { source: "/api/admin/:path*", destination: `${serverUrl}/api/admin/:path*` },
    ];
  },
  typedRoutes: true,
  reactCompiler: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "br-frosty-rice-b5t18xz9.storage.c-7.us-east-2.aws.neon.tech",
        port: "",
        pathname: "/basny-product-media/**",
        search: "",
      },
    ],
  },
};

export default withVarlock(withPwa(nextConfig));
