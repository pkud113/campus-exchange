import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: { optimizePackageImports: ["lucide-react"] },
  images: { unoptimized: true },
  transpilePackages: ["@campus-exchange/contracts", "@campus-exchange/domain"]
};

export default nextConfig;
