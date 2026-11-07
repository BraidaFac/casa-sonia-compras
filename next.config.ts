import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Adjuntos de Tesorería: hasta 10 MB por archivo + el sobre del multipart
  experimental: { proxyClientMaxBodySize: "12mb" },
};

export default nextConfig;
