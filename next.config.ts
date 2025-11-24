/** @type {import('next').NextConfig} */

// Bundle analyzer for analyzing bundle size
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig = {
  typedRoutes: true,
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  
  // Optimize production build
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,

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
  },

  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? {
      exclude: ["error", "warn"],
    } : false,
  },

  // Moved from experimental in Next.js 16
  cacheComponents: true,

  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-avatar",
      "@radix-ui/react-select",
      "@radix-ui/react-tooltip",
      "@radix-ui/react-popover",
      "sonner",
      "date-fns",
      "emoji-picker-react",
      "react-virtuoso",
    ],
    // Enable Server Actions for better data fetching
    serverActions: {
      bodySizeLimit: "2mb",
    },
    cssChunking: true,
    inlineCss: true,
    useLightningcss: true,
  },

  // Turbopack configuration for Next.js 15+ (successor to Webpack)
  // Use with: next dev --turbo
  turbopack: {
    // Rules for transforming/loading files
    rules: {
      // Optimize image loading
      "*.svg": {
        loaders: ["@svgr/webpack"],
        as: "*.js",
      },
    },
    // Module resolution options
    resolveAlias: {
      // Aliases are already handled by tsconfig paths
      // This ensures Turbopack respects them
      "@": "./src",
    },
  },

  // Optimize webpack bundles
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  webpack: (config: any, { isServer }: { isServer: boolean }) => {
    if (!isServer) {
      // Split vendor chunks for better caching
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: "all",
          cacheGroups: {
            default: false,
            vendors: false,
            // Vendor chunk for react ecosystem
            framework: {
              name: "framework",
              chunks: "all",
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 40,
              enforce: true,
            },
            // Chunk for UI libraries
            lib: {
              test: /[\\/]node_modules[\\/](@radix-ui|lucide-react)[\\/]/,
              name: "lib",
              priority: 30,
              minChunks: 1,
              reuseExistingChunk: true,
            },
            // Chunk for other common node_modules
            commons: {
              name: "commons",
              minChunks: 2,
              priority: 20,
            },
          },
        },
      };
    }
    return config;
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

  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,

  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },

  // Add caching headers for static assets
  async headers() {
    return [
      {
        source: "/:all*(svg|jpg|jpeg|png|gif|ico|webp|avif)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
