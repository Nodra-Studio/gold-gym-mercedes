import type { NextConfig } from "next";
import path from "node:path";
import { browserSecurityHeaders, contentSecurityPolicy } from "./lib/security-headers.mjs";

const nextConfig: NextConfig = {
  distDir: ".next-vercel",
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          ...browserSecurityHeaders,
          { key: "Content-Security-Policy", value: contentSecurityPolicy({ development: process.env.NODE_ENV === "development" }) },
        ],
      },
      {
        source: "/terminal-offline.html",
        headers: [{ key: "Content-Security-Policy", value: contentSecurityPolicy({ terminal: true }) }],
      },
    ];
  },
  webpack(config) {
    config.resolve.alias["@club/runtime"] = path.resolve(process.cwd(), "lib/runtime-node.ts");
    return config;
  },
};

export default nextConfig;
