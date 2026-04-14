import type { NextConfig } from "next";

const envAllowedDevOrigins =
  process.env.ALLOWED_DEV_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "10.105.12.231",
    "*.use.devtunnels.ms",
    ...envAllowedDevOrigins,
  ],
};

export default nextConfig;
