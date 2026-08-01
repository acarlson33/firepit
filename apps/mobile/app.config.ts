import type { ExpoConfig, ConfigContext } from "expo/config";

const packageJson = require("./package.json");

// Use APP_ENV instead of NODE_ENV for Expo/EAS compatibility
const APP_ENV = process.env.APP_ENV || "development";
const IS_DEV = APP_ENV === "development";
const IS_PREVIEW = APP_ENV === "preview";
const IS_PROD = APP_ENV === "production";

export default ({ config }: ConfigContext): ExpoConfig => {
    return {
        ...config,
        name: IS_DEV ? "firepit (Dev)" : "firepit",
        slug: "firepit",
        version: packageJson.version,
        orientation: "portrait",
        icon: "./assets/images/icon.png",
        scheme: "firepit",
        userInterfaceStyle: "automatic",
        sdkVersion: "57.0.9",

        // Dynamic iOS Config
        ios: {
            icon: "./assets/images/icon.png",
            bundleIdentifier: IS_DEV
                ? "com.acarlson33.firepit.dev"
                : IS_PREVIEW
                  ? "com.acarlson33.firepit.preview"
                  : "com.acarlson33.firepit",
            bitcode: IS_PROD,
            entitlements: {
                "aps-environment": IS_PROD ? "production" : "development",
            },
        },

        // Dynamic Android Config
        android: {
            adaptiveIcon: {
                backgroundColor: "#E6F4FE",
                foregroundImage: "./assets/images/android-icon-foreground.png",
                backgroundImage: "./assets/images/android-icon-background.png",
                monochromeImage: "./assets/images/android-icon-monochrome.png",
            },
            predictiveBackGestureEnabled: false,
            package: IS_DEV
                ? "com.acarlson33.firepit.dev"
                : IS_PREVIEW
                  ? "com.acarlson33.firepit.preview"
                  : "com.acarlson33.firepit",
            googleServicesFile: IS_DEV
                ? process.env.GOOGLE_SERVICES_DEV
                : IS_PREVIEW
                  ? process.env.GOOGLE_SERVICES_PREVIEW
                  : process.env.GOOGLE_SERVICES,
            permissions: [
                "android.permission.REQUEST_INSTALL_PACKAGES",
                "android.permission.INTERNET",
                "android.permission.ACCESS_NETWORK_STATE",
                "android.permission.WRITE_EXTERNAL_STORAGE",
                "android.permission.READ_EXTERNAL_STORAGE",
            ],
        },

        plugins: [
            "expo-router",
            [
                "expo-splash-screen",
                {
                    backgroundColor: "#F97316",
                    android: {
                        image: "./assets/images/splash-icon.png",
                        imageWidth: 100,
                    },
                },
            ],
            [
                "expo-notifications",
                {
                    icon: "./assets/images/icon.png",
                    color: "#D9792B",
                    defaultChannel: "firepit-messages",
                },
            ],
            [
                "@sentry/react-native",
                {
                    organization: process.env.SENTRY_ORG,
                    project: process.env.SENTRY_PROJECT,
                    authToken: process.env.SENTRY_AUTH_TOKEN,
                },
            ],
            [
                "@sentry/react-native/expo",
                {
                    url: "https://sentry.io/",
                    project: process.env.SENTRY_PROJECT,
                    organization: process.env.SENTRY_ORG,
                },
            ],
            "expo-secure-store",
            "expo-font",
            "expo-image",
            "expo-sqlite",
            "expo-status-bar",
            "expo-web-browser",
            ["react-native-libsodium", {}],
            [
                "expo-build-properties",
                {
                    android: {
                        usePrecompiledHeaders: true,
                        enableMinifyInReleaseBuilds: IS_PROD,
                        extraProguardRules: [
                            "-keep,allowshrinking class com.facebook.react.** { *; }",
                            "-keep,allowshrinking class com.facebook.hermes.** { *; }",
                            "-keep,allowshrinking class com.facebook.jni.** { *; }",
                            "-keep,allowshrinking class com.swmansion.reanimated.** { *; }",
                            "-keep,allowshrinking class com.swmansion.gesturehandler.** { *; }",
                            "-keep,allowshrinking class com.facebook.react.turbomodule.** { *; }",
                            "-keep,allowshrinking class com.reactnativecommunity.** { *; }",
                            "-optimizationpasses 2",
                        ].join("\n"),
                    },
                    ios: {
                        ccacheEnabled: true,
                        privacyManifestAggregationEnabled: true,
                        usePrecompiledModules: true,
                    },
                },
            ],
        ],

        experiments: {
            typedRoutes: true,
            reactCompiler: true,
        },

        extra: {
            router: {},
            eas: {
                projectId: "78d141eb-a639-4ba4-bef0-636154bf80c8",
            },
            appEnv: APP_ENV,
            sentryDsn:
                "https://74183b0682fef4020487ca90ca072b1f@o4508242166153216.ingest.us.sentry.io/4511684848123904",
        },

        owner: "firepit",
        platforms: ["android", "ios"],
    };
};
