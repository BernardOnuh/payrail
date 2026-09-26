import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@rainbow-me/rainbowkit"],
  webpack: (config) => {
    // The dev box is chronically near-full; don't churn gigabytes of webpack
    // pack cache on every build.
    config.cache = false;
    return config;
  },
};

export default nextConfig;