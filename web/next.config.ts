import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["161.97.115.0"],
  experimental: {
    webpackBuildWorker: false,
  },
};

export default nextConfig;
