#!/usr/bin/env node

/**
 * Stress test script for Firepit DMs.
 *
 * Usage:
 *   node scripts/stress-test.js stress-test --instance <url> --email <e> [options]
 *   node scripts/stress-test.js delete --instance <url> --email <e> [options]
 *
 * Options:
 *   --instance <url>    Instance base URL (required)
 *   --email <email>     Login email (required)
 *   --msgs <n>          Number of messages to send (default: 100)
 *   --data <path>       Path to JSON data file (default: ./stress-test-data.json)
 *   --help              Show this help
 *
 * The password is read from the FIREPIT_PASSWORD environment variable, or
 * prompted on stdin if it is not set. Never pass it on the command line.
 */

const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const MESSAGE_BODIES = [
  "Test",
  "test",
  "this is a test",
  "this is not a test",
  "You've been lied too this is a test",
  "hello world",
  "checking connectivity",
  "ping",
  "DM stress test payload",
  "firepit load test",
];

const MIN_DELAY_MS = 1000;
const MAX_ADDITIONAL_MS = 500; // random 0-500ms added to MIN_DELAY_MS
const BATCH_INTERVAL_EVERY = 7; // every Nth message uses the longer delay
const BATCH_DELAY_MS = 2000;
const DELETE_CONCURRENCY = 5;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[randomInt(0, arr.length - 1)];
}

function elapsed(start) {
  return ((Date.now() - start) / 1000).toFixed(1);
}

const FETCH_TIMEOUT_MS = 15000;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
async function login(instanceUrl, email, password) {
  const res = await fetchWithTimeout(`${instanceUrl.replace(/\/+$/, "")}/api/auth/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Login failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  if (!data.session) throw new Error("Login succeeded but no session token returned");
  return { token: data.session, userId: data.userId };
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------
async function fetchDmConversations(instanceUrl, token) {
  const url = `${instanceUrl.replace(/\/+$/, "")}/api/direct-messages?type=conversations`;
  const res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Failed to fetch DMs (${res.status})`);
  const data = await res.json();
  return (data.conversations ?? []).filter((c) => c.$id);
}

async function sendDmMessage(instanceUrl, token, userId, conversationId, text) {
  const res = await fetchWithTimeout(`${instanceUrl.replace(/\/+$/, "")}/api/direct-messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ conversationId, senderId: userId, text }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Send failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.message ?? null;
}

async function deleteDmMessage(instanceUrl, token, messageId) {
  const url = `${instanceUrl.replace(/\/+$/, "")}/api/direct-messages?id=${encodeURIComponent(messageId)}`;
  const res = await fetchWithTimeout(url, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Delete failed for ${messageId} (${res.status}): ${text}`);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Data file helpers
// ---------------------------------------------------------------------------
function loadData(dataPath) {
  if (!fs.existsSync(dataPath)) {
    return { runs: [], loadFailed: false };
  }
  try {
    return { runs: JSON.parse(fs.readFileSync(dataPath, "utf-8")), loadFailed: false };
  } catch (err) {
    console.error(
      `Warning: could not read tracking file ${dataPath}: ${err.message}`,
    );
    console.error("Leaving it untouched; prior run history was not loaded.");
    return { runs: [], loadFailed: true };
  }
}

function saveData(dataPath, data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Stress test command
// ---------------------------------------------------------------------------
async function cmdStressTest(instanceUrl, token, userId, msgCount, dataPath) {
  // 1. Fetch conversations and pick targets
  console.log("Fetching DM conversations...");
  const conversations = await fetchDmConversations(instanceUrl, token);
  if (conversations.length === 0) {
    console.error("No DM conversations found. Create at least one DM first.");
    process.exit(1);
  }
  console.log(`  Found ${conversations.length} conversation(s).`);

  // 2. Pre-compute everything before any requests
  const plan = [];
  for (let i = 0; i < msgCount; i++) {
    const conversation = conversations[i % conversations.length];
    const body = pick(MESSAGE_BODIES);
    const delay = (i + 1) % BATCH_INTERVAL_EVERY === 0
      ? BATCH_DELAY_MS
      : MIN_DELAY_MS + randomInt(0, MAX_ADDITIONAL_MS);
    plan.push({ conversationId: conversation.$id, body, delay });
  }

  console.log(`  Pre-computed ${plan.length} messages. Starting send...\n`);

  // 3. Send messages
  const runRecord = {
    timestamp: new Date().toISOString(),
    userId,
    instanceUrl,
    msgCount,
    conversationIds: [...new Set(plan.map((p) => p.conversationId))],
    messageIds: [],
    bodies: [],
    startTime: null,
    endTime: null,
  };

  const start = Date.now();
  runRecord.startTime = start;

  let ok = 0;
  let fail = 0;

  for (let i = 0; i < plan.length; i++) {
    const { conversationId, body, delay } = plan[i];
    const label = `[${i + 1}/${plan.length}]`;

    try {
      const msg = await sendDmMessage(instanceUrl, token, userId, conversationId, body);
      if (msg && msg.$id) {
        runRecord.messageIds.push(msg.$id);
        runRecord.bodies.push(body);
        ok++;
        console.log(`  ${label} Sent "${body}" → ${msg.$id}  (next delay: ${(delay / 1000).toFixed(1)}s, elapsed: ${elapsed(start)}s)`);
      } else {
        fail++;
        console.log(`  ${label} Sent but no $id in response (elapsed: ${elapsed(start)}s)`);
      }
    } catch (err) {
      fail++;
      console.error(`  ${label} FAILED: ${err.message}`);
    }

    if (i < plan.length - 1) {
      await sleep(delay);
    }
  }

  runRecord.endTime = Date.now();
  const totalSec = ((runRecord.endTime - start) / 1000).toFixed(1);
  console.log(`\nDone. ${ok} sent, ${fail} failed in ${totalSec}s`);

  // 4. Save tracking data
  const data = loadData(dataPath);
  if (data.loadFailed) {
    console.error("Skipping tracking save to avoid overwriting the unreadable data file.");
  } else {
    data.runs.push(runRecord);
    saveData(dataPath, data);
    console.log(`Tracking data saved to ${dataPath}`);
  }
}

// ---------------------------------------------------------------------------
// Delete command
// ---------------------------------------------------------------------------
async function cmdDelete(instanceUrl, token, dataPath) {
  const data = loadData(dataPath);
  const allRuns = data.runs ?? [];

  if (allRuns.length === 0) {
    console.log("No previous stress test runs found in data file.");
    return;
  }

  // Collect all message IDs from all runs
  const allIds = allRuns.flatMap((r) => r.messageIds ?? []);
  if (allIds.length === 0) {
    console.log("No message IDs found in tracking data.");
    return;
  }

  console.log(`Found ${allIds.length} messages across ${allRuns.length} run(s). Deleting...`);

  let ok = 0;
  let fail = 0;
  const failedIds = [];
  const start = Date.now();

  let cursor = 0;
  const worker = async () => {
    while (cursor < allIds.length) {
      const id = allIds[cursor++];
      try {
        await deleteDmMessage(instanceUrl, token, id);
        ok++;
        process.stdout.write(`  [${cursor}/${allIds.length}] Deleted ${id}  (elapsed: ${elapsed(start)}s)\n`);
      } catch (err) {
        fail++;
        failedIds.push(id);
        process.stdout.write(`  [${cursor}/${allIds.length}] FAILED ${id}: ${err.message}\n`);
      }
    }
  };
  await Promise.all(Array.from({ length: DELETE_CONCURRENCY }, worker));

  const totalSec = elapsed(start);
  console.log(`\nDone. ${ok} deleted, ${fail} failed in ${totalSec}s`);

  if (failedIds.length > 0) {
    saveData(dataPath, { runs: [{ timestamp: new Date().toISOString(), messageIds: failedIds }] });
    console.log(`Kept ${failedIds.length} failed ID(s) for a retry.`);
  } else {
    saveData(dataPath, { runs: [] });
    console.log("Tracking data cleared.");
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function printHelp() {
  console.log(`
Usage:
  node scripts/stress-test.js <command> [options]

Commands:
  stress-test    Run the DM stress test
  delete         Delete messages from previous stress test runs

Options:
  --instance <url>    Instance base URL (required)
  --email <email>     Login email (required)
  --msgs <n>          Number of messages to send (default: 100)
  --data <path>       Path to JSON data file (default: ./stress-test-data.json)
  --help              Show this help

Password:
  Read from the FIREPIT_PASSWORD environment variable, or prompted on stdin.
`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const command = args[0];
  if (command !== "stress-test" && command !== "delete") {
    console.error(`Unknown command: ${command}\n`);
    printHelp();
    process.exit(1);
  }

  const opts = { command, msgCount: 100, dataPath: path.resolve("stress-test-data.json") };

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case "--instance":
        opts.instanceUrl = args[++i];
        break;
      case "--email":
        opts.email = args[++i];
        break;
      case "--msgs":
        opts.msgCount = Number.parseInt(args[++i], 10);
        if (!Number.isInteger(opts.msgCount) || opts.msgCount < 1) {
          console.error("Error: --msgs must be a positive integer.");
          process.exit(1);
        }
        break;
      case "--data":
        opts.dataPath = path.resolve(args[++i]);
        break;
      default:
        console.error(`Unknown option: ${args[i]}\n`);
        printHelp();
        process.exit(1);
    }
  }

  if (!opts.instanceUrl || !opts.email) {
    console.error("Error: --instance and --email are required.\n");
    printHelp();
    process.exit(1);
  }

  return opts;
}

function promptForPassword() {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const originalWrite = rl._writeToOutput.bind(rl);
    rl._writeToOutput = (string) => {
      if (string.includes("Password:")) {
        originalWrite(string);
      } else {
        originalWrite("\x1B[2K\x1B[0G" + "*".repeat(string.length));
      }
    };
    rl.question("Password: ", (answer) => {
      rl._writeToOutput = originalWrite;
      rl.close();
      resolve(answer.trim());
    });
    rl.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const opts = parseArgs();
  console.log(`Connecting to ${opts.instanceUrl}...\n`);

  const password =
    process.env.FIREPIT_PASSWORD || (await promptForPassword());
  if (!password) {
    console.error("Error: no password provided. Set FIREPIT_PASSWORD or enter it when prompted.");
    process.exit(1);
  }

  const { token, userId } = await login(opts.instanceUrl, opts.email, password);
  console.log(`Authenticated as user ${userId}\n`);

  if (opts.command === "stress-test") {
    await cmdStressTest(opts.instanceUrl, token, userId, opts.msgCount, opts.dataPath);
  } else if (opts.command === "delete") {
    await cmdDelete(opts.instanceUrl, token, opts.dataPath);
  }
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
