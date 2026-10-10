import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  serverExternalPackages: ["@react-pdf/renderer"],  // <- see SPIKE-NOTES (toggle tested)
};
export default nextConfig;
