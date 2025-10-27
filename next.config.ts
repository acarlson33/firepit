import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,

  // Expose environment variables at runtime for deployed environments
  // These are server-side only and will not be exposed to the browser
  env: {
    APPWRITE_ENDPOINT: process.env.APPWRITE_ENDPOINT,
    APPWRITE_PROJECT_ID: process.env.APPWRITE_PROJECT_ID,
    APPWRITE_PROJECT: process.env.APPWRITE_PROJECT,
    APPWRITE_API_KEY: process.env.APPWRITE_API_KEY,
    APPWRITE_DATABASE_ID: process.env.APPWRITE_DATABASE_ID,
    APPWRITE_SERVERS_COLLECTION_ID: process.env.APPWRITE_SERVERS_COLLECTION_ID,
    APPWRITE_CHANNELS_COLLECTION_ID: process.env.APPWRITE_CHANNELS_COLLECTION_ID,
    APPWRITE_MESSAGES_COLLECTION_ID: process.env.APPWRITE_MESSAGES_COLLECTION_ID,
    APPWRITE_MEMBERSHIPS_COLLECTION_ID: process.env.APPWRITE_MEMBERSHIPS_COLLECTION_ID,
    APPWRITE_TYPING_COLLECTION_ID: process.env.APPWRITE_TYPING_COLLECTION_ID,
    APPWRITE_PROFILES_COLLECTION_ID: process.env.APPWRITE_PROFILES_COLLECTION_ID,
    APPWRITE_CONVERSATIONS_COLLECTION_ID: process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID,
    APPWRITE_DIRECT_MESSAGES_COLLECTION_ID: process.env.APPWRITE_DIRECT_MESSAGES_COLLECTION_ID,
    APPWRITE_STATUSES_COLLECTION_ID: process.env.APPWRITE_STATUSES_COLLECTION_ID,
    APPWRITE_AUDIT_COLLECTION_ID: process.env.APPWRITE_AUDIT_COLLECTION_ID,
    APPWRITE_AVATARS_BUCKET_ID: process.env.APPWRITE_AVATARS_BUCKET_ID,
    APPWRITE_ADMIN_TEAM_ID: process.env.APPWRITE_ADMIN_TEAM_ID,
    APPWRITE_MODERATOR_TEAM_ID: process.env.APPWRITE_MODERATOR_TEAM_ID,
    APPWRITE_ADMIN_USER_IDS: process.env.APPWRITE_ADMIN_USER_IDS,
    APPWRITE_MODERATOR_USER_IDS: process.env.APPWRITE_MODERATOR_USER_IDS,
    SERVER_URL: process.env.SERVER_URL,
    NEW_RELIC_LICENSE_KEY: process.env.NEW_RELIC_LICENSE_KEY,
    NEW_RELIC_APP_NAME: process.env.NEW_RELIC_APP_NAME,
  },

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
      {
        protocol: "https",
        hostname: "nyc.cloud.appwrite.io",
        pathname: "/v1/storage/buckets/emojis/files/**",
      },
      {
        protocol: "https",
        hostname: "nyc.cloud.appwrite.io",
        pathname: "/v1/storage/buckets/images/files/**",
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
