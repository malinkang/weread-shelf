import type { NextConfig } from "next";

const isVercelBuild = process.env.VERCEL === "1";

const nextConfig: NextConfig = {
  output: isVercelBuild ? undefined : "export",
  distDir: isVercelBuild ? ".next" : "dist",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
