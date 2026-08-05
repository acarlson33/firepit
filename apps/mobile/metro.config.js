const {
    getBundleModeMetroConfig,
} = require("react-native-worklets/bundleMode");
const { getSentryExpoConfig } = require("@sentry/react-native/metro");

/** @type {import('expo/metro-config').MetroConfig} */
let config = getSentryExpoConfig(__dirname);

// Add wasm asset support
config.resolver.assetExts.push("wasm");

// Add COEP and COOP headers to support SharedArrayBuffer
config.server.enhanceMiddleware = (middleware) => {
    return (req, res, next) => {
        res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
        res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
        middleware(req, res, next);
    };
};

config.transformer = {
    ...config.transformer,
    getTransformOptions: async () => ({
        transform: {
            experimentalImportSupport: true,
            inlineRequires: true,
        },
    }),
    minifierConfig: {
        compress: {
            // Remove console logs in production builds
            drop_console: process.env.APP_ENV === "production",
        },
    },
};
config = getBundleModeMetroConfig(config);

module.exports = config;
