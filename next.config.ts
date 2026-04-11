import { withPostHogConfig } from "@posthog/nextjs-config";
import type { NextConfig } from "next";

// Bundle analyzer for analyzing bundle size
const withBundleAnalyzer = require("@next/bundle-analyzer")({
    enabled: process.env.ANALYZE === "true",
});

function normalizeRewritePath(path: string) {
    const clean = path.replace(/^\/+|\/+$/g, "");
    return clean ? `/${clean}` : "";
}

function stripTrailingSlash(url: string) {
    return url.replace(/\/$/, "");
}

function getHostnameFromEndpoint(endpoint: string | undefined) {
    if (!endpoint) {
        return "nyc.cloud.appwrite.io";
    }

    try {
        const normalizedEndpoint = /^https?:\/\//.test(endpoint)
            ? endpoint
            : `https://${endpoint}`;
        return new URL(normalizedEndpoint).hostname;
    } catch {
        return "nyc.cloud.appwrite.io";
    }
}

const appwriteImageHostname = getHostnameFromEndpoint(
    process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT ?? process.env.APPWRITE_ENDPOINT,
);

const nextConfig: NextConfig = {
    typedRoutes: true,
    async rewrites() {
        const rewritesEnabled = process.env.POSTHOG_REWRITE_ENABLED !== "false";
        if (!rewritesEnabled) {
            return [];
        }

        const rewritePath = normalizeRewritePath(
            process.env.POSTHOG_REWRITE_PATH ?? "/ingest",
        );
        if (!rewritePath) {
            return [];
        }
        const ingestHost = stripTrailingSlash(
            process.env.POSTHOG_REWRITE_INGEST_HOST ??
                "https://us.i.posthog.com",
        );
        const staticHost = stripTrailingSlash(
            process.env.POSTHOG_REWRITE_STATIC_HOST ??
                "https://us-assets.i.posthog.com",
        );

        return [
            {
                source: `${rewritePath}/static/:path*`,
                destination: `${staticHost}/static/:path*`,
            },
            {
                source: `${rewritePath}/:path*`,
                destination: `${ingestHost}/:path*`,
            },
        ];
    },
    // This is required to support PostHog trailing slash API requests
    skipTrailingSlashRedirect: true,
    reactStrictMode: true,
    poweredByHeader: false,
    compress: true,
    reactCompiler: true,

    // Optimize production build
    output: process.env.NODE_ENV === "production" ? "standalone" : undefined,

    // Map fallback env vars so NEXT_PUBLIC_* are always populated.
    // IMPORTANT: The `env` key in next.config.ts inlines values into BOTH
    // server and client bundles. Never put secrets (API keys, etc.) here.
    // Server-only vars like APPWRITE_API_KEY must only be read via
    // process.env at runtime in server code.
    env: {
        NEXT_PUBLIC_APPWRITE_ENDPOINT:
            process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT ??
            process.env.APPWRITE_ENDPOINT,
        NEXT_PUBLIC_APPWRITE_PROJECT_ID:
            process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID ??
            process.env.APPWRITE_PROJECT_ID,
    },

    compiler: {
        removeConsole:
            process.env.NODE_ENV === "production"
                ? {
                      exclude: ["error", "warn"],
                  }
                : false,
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
    },

    // Turbopack configuration for Next.js 15+ (successor to Webpack)
    // Use with: next dev
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
                hostname: appwriteImageHostname,
                pathname: "/v1/storage/buckets/avatars/files/**",
            },
            {
                protocol: "https",
                hostname: appwriteImageHostname,
                pathname: "/v1/storage/buckets/emojis/files/**",
            },
            {
                protocol: "https",
                hostname: appwriteImageHostname,
                pathname: "/v1/storage/buckets/images/files/**",
            },
            {
                protocol: "https",
                hostname: appwriteImageHostname,
                pathname: "/v1/storage/buckets/profile-backgrounds/files/**",
            },
            {
                protocol: "https",
                hostname: appwriteImageHostname,
                pathname:
                    "/v1/storage/buckets/avatar-frames-predefined/files/**",
            },
        ],
        formats: ["image/avif", "image/webp"],
    },
};

const posthogProjectId = process.env.POSTHOG_PROJECT_ID;
const posthogPersonalApiKey = process.env.POSTHOG_API_KEY;
const posthogConfigHost =
    process.env.POSTHOG_HOST ??
    process.env.NEXT_PUBLIC_POSTHOG_HOST ??
    "https://us.posthog.com";

const configWithPostHog =
    posthogProjectId && posthogPersonalApiKey
        ? withPostHogConfig(nextConfig, {
              personalApiKey: posthogPersonalApiKey,
              projectId: posthogProjectId,
              host: posthogConfigHost,
              sourcemaps: {
                  enabled: process.env.NODE_ENV === "production",
                  deleteAfterUpload: true,
              },
          })
        : nextConfig;

export default withBundleAnalyzer(configWithPostHog);
