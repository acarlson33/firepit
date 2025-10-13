import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "nyc.cloud.appwrite.io",
        pathname: "/v1/storage/buckets/avatars/files/**",
      },
    ],
  },
};

export default nextConfig;
