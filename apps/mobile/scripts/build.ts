import { execSync } from "node:child_process";
import { platform } from "node:os";
import {
    appendFileSync,
    copyFileSync,
    existsSync,
    readFileSync,
    writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { ensureEnv } from "./env";

const os = platform();
const isMac = os === "darwin";

const VALID_ARCHES = ["arm64-v8a", "armeabi-v7a", "x86", "x86_64"] as const;
type Arch = (typeof VALID_ARCHES)[number];

function parseArgs(): { arch: Arch | null } {
    const args = process.argv.slice(2);
    const archIndex = args.indexOf("--arch");
    if (archIndex === -1) return { arch: null };
    if (archIndex + 1 >= args.length) {
        console.error(
            `--arch requires a value. Valid: ${VALID_ARCHES.join(", ")}`,
        );
        process.exit(1);
    }
    const arch = args[archIndex + 1];
    if (!VALID_ARCHES.includes(arch as Arch)) {
        console.error(
            `Invalid arch "${arch}". Valid: ${VALID_ARCHES.join(", ")}`,
        );
        process.exit(1);
    }
    return { arch: arch as Arch };
}

function addAbiSplits(gradlePath: string, arch: Arch | null) {
    let gradle = readFileSync(gradlePath, "utf-8");

    const splitsBlock = arch
        ? `    splits {
        abi {
            enable true
            reset()
            include "${arch}"
            universalApk false
        }
    }
`
        : `    splits {
        abi {
            enable true
            reset()
            include "${VALID_ARCHES.join('", "')}"
            universalApk true
        }
    }
`;

    if (gradle.includes("splits {")) {
        gradle = gradle.replace(
            /^ {4}splits \{[\s\S]*?^ {4}\}\n/m,
            splitsBlock,
        );
    } else {
        gradle = gradle.replace(
            /(^ {4}externalNativeBuild \{[\s\S]*?^ {4}\}\n)(\})/m,
            `$1${splitsBlock}$2`,
        );
    }

    writeFileSync(gradlePath, gradle);
}

function androidBuild() {
    const { arch } = parseArgs();
    if (arch) {
        console.log(`Building for arch: ${arch}`);
    } else {
        console.log("Building universal APK (all ABIs)");
    }

    console.log(
        "Ensuring APP_ENV=production and EXPO_PUBLIC_USE_RN_FETCH=1...",
    );
    ensureEnv("production");

    console.log("Running expo prebuild...");
    execSync("EAS_BUILD_PROFILE=production npx expo prebuild", {
        stdio: "inherit",
    });

    console.log("Incrementing Android versionCode...");
    const counterPath = "scripts/build-counter.json";
    let currentCode = 1;
    try {
        currentCode =
            JSON.parse(readFileSync(counterPath, "utf-8")).versionCode + 1;
    } catch {
        currentCode = 1;
    }
    writeFileSync(
        counterPath,
        JSON.stringify({ versionCode: currentCode }) + "\n",
    );
    const gradlePath = "android/app/build.gradle";
    let gradle = readFileSync(gradlePath, "utf-8");
    gradle = gradle.replace(/versionCode \d+/, `versionCode ${currentCode}`);
    writeFileSync(gradlePath, gradle);

    console.log("Configuring gradle.properties...");
    const propsPath = "android/gradle.properties";
    let props = readFileSync(propsPath, "utf-8");
    props = props.replace(
        /^org\.gradle\.jvmargs=.*$/m,
        "org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m",
    );
    if (props.length > 0 && !props.endsWith("\n")) props += "\n";
    if (!props.includes("org.gradle.caching=")) {
        props += "org.gradle.caching=true\n";
    }
    if (!props.includes("org.gradle.daemon=")) {
        props += "org.gradle.daemon=true\n";
    }
    if (!props.includes("org.gradle.configuration-cache=")) {
        props += "org.gradle.configuration-cache=false\n";
    }
    if (!props.includes("org.gradle.configureondemand=")) {
        props += "org.gradle.configureondemand=true\n";
    }
    if (!props.includes("android.enableR8.fullMode=")) {
        props += "android.enableR8.fullMode=true\n";
    }
    if (!props.includes("android.enableBundleCompression=")) {
        props += "android.enableBundleCompression=true\n";
    }
    if (!props.includes("expo.devmenu.configureInRelease=")) {
        props += "expo.devmenu.configureInRelease=false\n";
    }
    props = props.replace(
        /^EX_DEV_CLIENT_NETWORK_INSPECTOR=.*$/m,
        "EX_DEV_CLIENT_NETWORK_INSPECTOR=false",
    );
    writeFileSync(propsPath, props);

    console.log("Patching settings.gradle to exclude dev modules...");
    const settingsGradlePath = "android/settings.gradle";
    let settingsGradle = readFileSync(settingsGradlePath, "utf-8");
    const expoDevBlock = `expoAutolinking {
    projectRoot = new File(rootDir, "..")
    exclude = ["expo-dev-client", "expo-dev-launcher", "expo-dev-menu", "expo-dev-menu-interface", "expo-updates-interface"]
}
`;
    if (!settingsGradle.includes('exclude = ["expo-dev-client"')) {
        settingsGradle = settingsGradle.replace(
            /expoAutolinking\.useExpoModules\(\)/,
            `${expoDevBlock}expoAutolinking.useExpoModules()`,
        );
        writeFileSync(settingsGradlePath, settingsGradle);
    }

    console.log("Setting reactNativeArchitectures based on arch flag...");
    props = readFileSync(propsPath, "utf-8");
    if (arch) {
        props = props.replace(
            /^reactNativeArchitectures=.*$/m,
            `reactNativeArchitectures=${arch}`,
        );
    } else {
        props = props.replace(
            /^reactNativeArchitectures=.*$/m,
            "reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64",
        );
    }
    writeFileSync(propsPath, props);

    console.log("Adding ABI splits to build.gradle...");
    addAbiSplits(gradlePath, arch);

    console.log("Configuring keystore...");
    const keyAlias = process.env.MYAPP_UPLOAD_KEY_ALIAS;
    const storePassword = process.env.MYAPP_UPLOAD_STORE_PASSWORD;
    const keyPassword = process.env.MYAPP_UPLOAD_KEY_PASSWORD;

    if (!keyAlias || !storePassword || !keyPassword) {
        console.error(
            "Missing required env vars: MYAPP_UPLOAD_KEY_ALIAS, MYAPP_UPLOAD_STORE_PASSWORD, MYAPP_UPLOAD_KEY_PASSWORD",
        );
        process.exit(1);
    }

    appendFileSync(
        "android/gradle.properties",
        [
            "MYAPP_UPLOAD_STORE_FILE=firepit-upload.keystore",
            `MYAPP_UPLOAD_KEY_ALIAS=${keyAlias}`,
            "",
        ].join("\n"),
    );

    console.log("Copying keystore...");
    copyFileSync(
        "credentials/android/firepit-upload.keystore",
        "android/app/firepit-upload.keystore",
    );

    console.log("Adding release signing config and switching to it...");
    gradle = readFileSync(gradlePath, "utf-8");

    const releaseSigningConfig = `        release {
            if (project.hasProperty("MYAPP_UPLOAD_STORE_FILE")) {
                storeFile file(MYAPP_UPLOAD_STORE_FILE)
                storePassword MYAPP_UPLOAD_STORE_PASSWORD
                keyAlias MYAPP_UPLOAD_KEY_ALIAS
                keyPassword MYAPP_UPLOAD_KEY_PASSWORD
            }
        }
`;

    const withReleaseConfig = gradle.replace(
        /(signingConfigs\s*\{[\s\S]*?debug\s*\{[\s\S]*?\}\n)([ \t]*\})/,
        (_, beforeLastBrace, lastBrace) =>
            beforeLastBrace + releaseSigningConfig + lastBrace,
    );

    const withReleaseRef = withReleaseConfig.replace(
        /signingConfig signingConfigs\.debug/g,
        "signingConfig signingConfigs.release",
    );

    const withOptimizedProguard = withReleaseRef.replace(
        /proguard-android\.txt/g,
        "proguard-android-optimize.txt",
    );

    writeFileSync(gradlePath, withOptimizedProguard);

    console.log("Building Android APK...");
    execSync("cd android && ./gradlew assembleRelease", {
        stdio: "inherit",
        env: {
            ...process.env,
            SENTRY_DISABLE_AUTO_UPLOAD: "true",
            ORG_GRADLE_PROJECT_MYAPP_UPLOAD_STORE_PASSWORD: storePassword,
            ORG_GRADLE_PROJECT_MYAPP_UPLOAD_KEY_PASSWORD: keyPassword,
        },
    });

    console.log("Copying APK to project root...");
    const apkSuffix = arch ? `-${arch}-release.apk` : "-universal-release.apk";
    const apkName = arch ? `firepit-${arch}.apk` : "firepit-universal.apk";
    const apkSource = join(
        "android",
        "app",
        "build",
        "outputs",
        "apk",
        "release",
        `app${apkSuffix}`,
    );
    const apkDest = join("..", "..", apkName);
    if (existsSync(apkSource)) {
        copyFileSync(apkSource, apkDest);
        console.log(`APK saved to ${apkDest}`);
    } else {
        console.error(`APK not found at ${apkSource}. Built artifacts:`);
        // Fallback: list what was built
        execSync("ls -la android/app/build/outputs/apk/release/", {
            stdio: "inherit",
        });
        process.exit(1);
    }

    console.log("Returning to project root...");
    execSync("cd ..", { stdio: "inherit" });
}

try {
    if (isMac) {
        console.log("Building for iOS and Android on macOS...");
        execSync(
            "bunx eas-cli build --platform ios --local --profile production",
            {
                stdio: "inherit",
            },
        );
        androidBuild();
    } else {
        console.log("Building for Android...");
        androidBuild();
    }
    console.log("Build completed successfully.");
} catch (error) {
    console.error("Build failed:", error);
    process.exit(1);
}
