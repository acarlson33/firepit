import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,

  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? {
      exclude: ["error", "warn"],
    } : false,
  },

  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "sonner",
    ]
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "nyc.cloud.appwrite.io",
        pathname: "/v1/storage/buckets/avatars/files/**",
      },
    ],
    formats: ["image/avif", "image/webp"],
  },

  turbopack: {
    resolveAlias: {
      // Optimize imports for better tree-shaking
      "lucide-react": "lucide-react/dist/esm/lucide-react.js",
    }
  }
};

export default nextConfig;
