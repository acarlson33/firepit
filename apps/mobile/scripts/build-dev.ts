import { execSync } from "child_process";
import { appendFileSync, readFileSync, writeFileSync } from "fs";
import { platform } from "os";

const os = platform();
const isMac = os === "darwin";

function androidBuild() {
    console.log("Ensuring APP_ENV=development and EXPO_PUBLIC_USE_RN_FETCH=1...");
    process.env.APP_ENV = "development";
    const envPath = ".env.local";
    const envContent = readFileSync(envPath, "utf-8");
    let updated = envContent;
    if (!updated.includes("APP_ENV=development")) {
        console.log("Updating .env.local to APP_ENV=development...");
        updated = updated.replace(/^APP_ENV=.*$/m, "APP_ENV=development");
    }
    if (!updated.includes("EXPO_PUBLIC_USE_RN_FETCH=1")) {
        console.log("Adding EXPO_PUBLIC_USE_RN_FETCH=1...");
        updated += "\nEXPO_PUBLIC_USE_RN_FETCH=1";
    }
    if (updated !== envContent) writeFileSync(envPath, updated);

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

    appendFileSync(
        "android/gradle.properties",
        [
            "",
            "MYAPP_UPLOAD_STORE_FILE=firepit-upload.keystore",
            `MYAPP_UPLOAD_KEY_ALIAS=${keyAlias}`,
            `MYAPP_UPLOAD_STORE_PASSWORD=${storePassword}`,
            `MYAPP_UPLOAD_KEY_PASSWORD=${keyPassword}`,
        ].join("\n"),
    );

    console.log("Copying keystore...");
    execSync("cp credentials/android/firepit-upload.keystore android/app/", {
        stdio: "inherit",
    });

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
    execSync("cd android && ./gradlew assembleDebug", { stdio: "inherit" });

    console.log("Returning to project root...");
    execSync("cd ..", { stdio: "inherit" });
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
