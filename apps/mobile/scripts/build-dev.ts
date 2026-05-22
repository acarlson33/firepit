import { execSync } from "child_process";
import { platform } from "os";

const os = platform();
const isMac = os === "darwin";

try {
    if (isMac) {
        console.log("Building for iOS and Android on macOS...");
        execSync(
            "bunx eas-cli build --platform ios --local --profile development",
            {
                stdio: "inherit",
            },
        );
        execSync(
            "bunx eas-cli build --platform android --local --profile development",
            {
                stdio: "inherit",
            },
        );
    } else {
        console.log("Building for Android...");
        execSync(
            "bunx eas-cli build --platform android --local --profile development",
            {
                stdio: "inherit",
            },
        );
    }
    console.log("Build completed successfully.");
} catch (error) {
    console.error("Build failed:", error);
    process.exit(1);
}
