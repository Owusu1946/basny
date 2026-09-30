import { varlockNextConfigPlugin } from "@varlock/nextjs-integration/plugin";

const withVarlock = varlockNextConfigPlugin();
import type { NextConfig } from "next";

import { withPwa } from "./pwa.config";

const nextConfig: NextConfig = {
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
