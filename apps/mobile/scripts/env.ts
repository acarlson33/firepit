import { existsSync, readFileSync, writeFileSync } from "node:fs";

/**
 * Ensure .env.local pins APP_ENV to `target` and sets
 * EXPO_PUBLIC_USE_RN_FETCH=1. Missing .env.local is treated as empty.
 * Only writes (and logs) when the file actually changes.
 */
export function ensureEnv(target: "production" | "development"): void {
  process.env.APP_ENV = target;
  const envPath = ".env.local";
  const envContent = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  let updated = envContent;
  let changed = false;

  if (!updated.includes(`APP_ENV=${target}`)) {
    updated = /^APP_ENV=.*$/m.test(updated)
      ? updated.replace(/^APP_ENV=.*$/m, `APP_ENV=${target}`)
      : `${updated}\nAPP_ENV=${target}`;
    changed = true;
  }
  if (!updated.includes("EXPO_PUBLIC_USE_RN_FETCH=1")) {
    updated += `${updated.endsWith("\n") || updated === "" ? "" : "\n"}EXPO_PUBLIC_USE_RN_FETCH=1`;
    changed = true;
  }

  if (changed) {
    console.log(
      `Ensuring APP_ENV=${target} and EXPO_PUBLIC_USE_RN_FETCH=1...`,
    );
    writeFileSync(envPath, updated);
  }
}
