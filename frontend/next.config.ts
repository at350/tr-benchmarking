import type { NextConfig } from "next";

const envAllowedDevOrigins =
  process.env.ALLOWED_DEV_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];

const nextConfig: NextConfig = {
  // Extra hosts allowed to reach the dev server (comma-separated), e.g. a LAN IP or tunnel domain.
  allowedDevOrigins: envAllowedDevOrigins,
};

export default nextConfig;
