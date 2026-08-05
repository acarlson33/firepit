import { execFileSync, execSync } from "node:child_process";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { platform } from "node:os";
import { resolve } from "node:path";

import { ensureEnv } from "./env";

const os = platform();
const isMac = os === "darwin";

function androidBuild() {
    ensureEnv("development");

    console.log("Running expo prebuild...");
    execSync("npx expo prebuild", { stdio: "inherit" });

    console.log("Incrementing Android versionCode...");
    const counterPath = "scripts/build-counter.json";
    let currentCode = 1;
    try {
      currentCode = JSON.parse(readFileSync(counterPath, "utf-8")).versionCode + 1;
    } catch { currentCode = 1; }
    writeFileSync(counterPath, JSON.stringify({ versionCode: currentCode }) + "\n");
    const gradlePath = "android/app/build.gradle";
    let gradle = readFileSync(gradlePath, "utf-8");
    gradle = gradle.replace(/versionCode \d+/, `versionCode ${currentCode}`);
    writeFileSync(gradlePath, gradle);

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

    console.log("Copying keystore...");
    copyFileSync(
        "credentials/android/firepit-upload.keystore",
        "android/app/firepit-upload.keystore",
    );

    console.log("Adding release signing config and switching to it...");
    const buildGradle = readFileSync("android/app/build.gradle", "utf-8");

    const releaseSigningConfig = `        release {
            if (project.hasProperty("MYAPP_UPLOAD_STORE_FILE")) {
                storeFile file(MYAPP_UPLOAD_STORE_FILE)
                storePassword MYAPP_UPLOAD_STORE_PASSWORD
                keyAlias MYAPP_UPLOAD_KEY_ALIAS
                keyPassword MYAPP_UPLOAD_KEY_PASSWORD
            }
        }
`;

    const withReleaseConfig = buildGradle.replace(
        /(signingConfigs\s*\{[\s\S]*?debug\s*\{[\s\S]*?\}\n)([ \t]*\})/,
        (_, beforeLastBrace, lastBrace) =>
            beforeLastBrace + releaseSigningConfig + lastBrace,
    );

    const withReleaseRef = withReleaseConfig.replace(
        /signingConfig signingConfigs\.debug/g,
        "signingConfig signingConfigs.release",
    );

    writeFileSync("android/app/build.gradle", withReleaseRef);

    console.log("Building Android APK...");
    // Passwords go through ORG_GRADLE_PROJECT_ env so they never appear in
    // the process argument list; store file + alias are non-secret -P props.
    execFileSync(
        resolve("android", "gradlew"),
        [
            "assembleDebug",
            "-PMYAPP_UPLOAD_STORE_FILE=firepit-upload.keystore",
            `-PMYAPP_UPLOAD_KEY_ALIAS=${keyAlias}`,
        ],
        {
            cwd: "android",
            stdio: "inherit",
            env: {
                ...process.env,
                ORG_GRADLE_PROJECT_MYAPP_UPLOAD_STORE_PASSWORD: storePassword,
                ORG_GRADLE_PROJECT_MYAPP_UPLOAD_KEY_PASSWORD: keyPassword,
            },
        },
    );
}

try {
    if (isMac) {
        console.log("Building for iOS and Android on macOS...");
        execSync(
            "bunx eas-cli build --platform ios --local --profile development",
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
