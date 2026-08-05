import { compareVersions, isNewerVersion, parseVersion } from "./version";

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(msg);
};

if (import.meta.main) {
  assert(compareVersions(parseVersion("2.0.0-canary.10"), parseVersion("2.0.0-canary.11")) < 0, "canary.11 newer than canary.10");
  assert(compareVersions(parseVersion("2.0.0-canary.11"), parseVersion("2.0.0-canary.10")) > 0, "reverse compare");
  assert(compareVersions(parseVersion("2.0.0-canary.10"), parseVersion("2.0.0")) < 0, "stable newer than prerelease");
  assert(compareVersions(parseVersion("2.0.0"), parseVersion("2.0.1")) < 0, "patch compare");
  assert(compareVersions(parseVersion("2.0.0"), parseVersion("2.0.0s")) < 0, "security higher than patch");
  assert(compareVersions(parseVersion("2.0.0-alpha.10"), parseVersion("2.0.0-beta.1")) < 0, "alpha.10 < beta.1 per SemVer");
  assert(compareVersions(parseVersion("2.0.0+build.1"), parseVersion("2.0.0+build.2")) === 0, "build metadata ignored");
  assert(compareVersions(parseVersion("2.0.0-canary.10"), parseVersion("2.0.0-canary.2")) > 0, "numeric prerelease id ordered numerically");
  assert(isNewerVersion("2.0.0-canary.10", "2.0.0-canary.11"), "isNewerVersion");
  assert(!isNewerVersion("2.0.0-canary.11", "2.0.0-canary.10"), "not newer when equal or lower");
  assert(parseVersion("2.1.1s+build").isSecurity, "security suffix detected after build metadata");
  assert(parseVersion("2.1.1s+build.3").isSecurity, "security suffix detected with build metadata");
  assert(parseVersion("2.1.1").isSecurity === false, "no security flag on plain version");
  assert(parseVersion("2.1.1s").major === 2 && parseVersion("2.1.1s").patch === 1, "suffix stripped from numeric part");
  console.log("version.test.ts: all assertions passed");
}
