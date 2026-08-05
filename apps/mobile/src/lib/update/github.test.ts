import { extractChangelog } from "./github";

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(msg);
};

if (import.meta.main) {
  const short = extractChangelog("# v2.0.0\n\nSmall fix.", 500);
  assert(short.truncated === false && short.text.includes("Small fix."), "short body not truncated");

  const long = extractChangelog("# v2.0.0\n\n" + "x".repeat(1000), 500);
  assert(long.truncated === true, "long body flagged truncated");
  assert(long.text.endsWith("…"), "long body ends with ellipsis");

  const empty = extractChangelog("", 500);
  assert(empty.truncated === false && empty.text === "No changelog available.", "empty body returns placeholder");

  console.log("github.test.ts: all assertions passed");
}
