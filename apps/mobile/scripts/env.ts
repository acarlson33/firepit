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

  const ensureLine = (line: string): boolean => {
    const key = line.slice(0, line.indexOf("="));
    const regex = new RegExp(`^${escapeRegex(key)}=.*$`, "gm");
    if (regex.test(updated)) {
      const replaced = updated.replace(regex, line);
      if (replaced === updated) return false;
      updated = replaced;
      return true;
    }
    updated += `${updated.endsWith("\n") || updated === "" ? "" : "\n"}${line}`;
    return true;
  };

  if (ensureLine(`APP_ENV=${target}`)) changed = true;
  if (ensureLine("EXPO_PUBLIC_USE_RN_FETCH=1")) changed = true;

  if (changed) {
    console.log(
      `Ensuring APP_ENV=${target} and EXPO_PUBLIC_USE_RN_FETCH=1...`,
    );
    writeFileSync(envPath, updated);
  }
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
