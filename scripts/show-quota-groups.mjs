#!/usr/bin/env node
/**
 * show-quota-groups.mjs — print the Antigravity / Cloud Code quota summary the way
 * Google returns it, one line per quota pool and one line per bucket.
 *
 * Answers the question "what does each bar in the bottom bar actually mean".
 * `extensions/antigravity-usage-bar.ts` draws ONE bar per bucket, so the pools and
 * buckets printed here are exactly the bars shown below the editor.
 *
 * Usage:  node scripts/show-quota-groups.mjs          # readable table
 *         node scripts/show-quota-groups.mjs --json   # raw JSON (all fields)
 *
 * Needs:  ~/.pi/agent/auth.json with an `antigravity` OAuth credential
 *         (created by /login antigravity or pi-antigravity's login flow).
 *
 * NOTE: the credential must be passed to fetchAccountUsage as a JSON STRING with
 * both `token` and `projectId`, because pi-antigravity's parseApiKey JSON.parses it.
 * A bare access token fails with "Invalid Antigravity credentials".
 */

import { createJiti } from "file:///opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/jiti/lib/jiti.mjs";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const agentDir = process.env.PI_AGENT_DIR || path.join(os.homedir(), ".pi", "agent");
const AG = path.join(agentDir, "npm", "node_modules", "pi-antigravity", "src");

// Locate the pi-coding-agent install (varies by OS / install method).
function findPiRoot() {
  const hasIndex = (dir) => !!dir && fs.existsSync(path.join(dir, "dist", "index.js"));
  const candidates = [
    process.env.PI_HOME && path.join(process.env.PI_HOME, "lib", "node_modules", "@earendil-works", "pi-coding-agent"),
    "/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent",
    "/usr/local/lib/node_modules/@earendil-works/pi-coding-agent",
    process.env.APPDATA && path.join(process.env.APPDATA, "npm", "node_modules", "@earendil-works", "pi-coding-agent"),
  ];
  for (const dir of candidates) if (hasIndex(dir)) return dir;
  try {
    const { execSync } = createRequire(import.meta.url)("node:child_process");
    const real = fs.realpathSync(execSync("command -v pi", { encoding: "utf8" }).trim());
    let dir = path.dirname(real);
    while (dir !== path.dirname(dir) && !fs.existsSync(path.join(dir, "package.json"))) dir = path.dirname(dir);
    if (hasIndex(dir)) return dir;
    for (const root of [`${path.dirname(dir)}`, execSync("npm root -g", { encoding: "utf8" }).trim()]) {
      const d = path.join(root, "@earendil-works", "pi-coding-agent");
      if (hasIndex(d)) return d;
    }
  } catch {}
  throw new Error("Could not locate @earendil-works/pi-coding-agent — set PI_HOME or install pi globally.");
}
const PI = findPiRoot();
const PI_NM = path.join(PI, "node_modules");
const req = createRequire(path.join(PI, "dist", "index.js"));
const jiti = createJiti(import.meta.url, {
  alias: {
    "@earendil-works/pi-coding-agent": path.join(PI, "dist", "index.js"),
    "@earendil-works/pi-tui": path.join(PI_NM, "@earendil-works/pi-tui", "dist", "index.js"),
    "@earendil-works/pi-ai": path.join(PI_NM, "@earendil-works/pi-ai", "dist", "compat.js"),
    "@earendil-works/pi-agent-core": path.join(PI_NM, "@earendil-works/pi-agent-core", "dist", "index.js"),
    typebox: req.resolve("typebox"),
    "@sinclair/typebox": req.resolve("typebox"),
  },
});

const authFile = path.join(agentDir, "auth.json");
if (!fs.existsSync(authFile)) {
  console.error("No auth.json — run /login antigravity in pi first.");
  process.exit(1);
}
const cred = JSON.parse(fs.readFileSync(authFile, "utf8")).antigravity;
if (!cred?.access) {
  console.error("No antigravity credential in auth.json — run /login antigravity first.");
  process.exit(1);
}

const { fetchAccountUsage } = await jiti.import(path.join(AG, "usage", "index.ts"));
const usage = await fetchAccountUsage(JSON.stringify({ token: cred.access, projectId: cred.projectId }));

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(usage, null, 2));
  process.exit(0);
}

// ── helpers ──────────────────────────────────────────────────────────────────
const bar = (f, w = 10) => {
  if (f === undefined) return "[".padEnd(w + 1, "?") + "]";
  const filled = Math.max(0, Math.min(w, Math.round(f * w)));
  return `[${"#".repeat(filled)}${"-".repeat(w - filled)}]`;
};
const pct = (f) => (f === undefined ? "  ?" : String(Math.round(f * 100)).padStart(3));
function inText(resetTime) {
  if (!resetTime) return "-";
  const delta = Date.parse(resetTime) - Date.now();
  if (!Number.isFinite(delta)) return "-";
  if (delta <= 0) return "reset now";
  const m = Math.round(delta / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return d > 0 ? `${d}d${h}h` : h > 0 ? `${h}h${m % 60}m` : `${m}m`;
}
const winLabel = (b) => {
  const s = `${b.window || ""} ${b.displayName || ""}`.toLowerCase();
  if (/five.?hour|5.?h/.test(s)) return "5h";
  if (/week/.test(s)) return "wk";
  if (/daily|day/.test(s)) return "day";
  if (/month/.test(s)) return "mo";
  return (b.window || "?").slice(0, 6);
};

// ── report ───────────────────────────────────────────────────────────────────
console.log(`plan:  ${usage.planLabel || "?"}`);
console.log(`email: ${usage.email || cred.email || "?"}`);
console.log(`at:    ${new Date(usage.fetchedAt || Date.now()).toISOString()}`);
if (usage.quotaSummaryError) console.log(`summary error: ${usage.quotaSummaryError}`);
if (usage.groupDescription) console.log(`\n${usage.groupDescription.replace(/(.{100}\S*)\s/g, "$1\n")}`);

if (!usage.groups?.length) {
  console.log("\nNo quota groups returned. The quota-summary RPC may be unavailable.");
  const rows = (usage.models || []).filter((m) => m.remainingFraction !== undefined);
  console.log(`Falling back to ${rows.length} per-model rows (the bottom bar shows only the depleted ones).`);
  process.exit(0);
}

// Same ordering as the bottom bar: 5h, then day, then weekly.
const rank = (b) => {
  const w = winLabel(b);
  return w === "5h" ? 0 : w === "day" ? 1 : w === "wk" ? 2 : 3;
};

for (const g of usage.groups) {
  console.log(`\n${g.displayName}`);
  if (g.description) console.log(`  ${g.description}`);
  for (const b of [...(g.buckets || [])].sort((a, b) => rank(a) - rank(b))) {
    const f = b.remainingFraction;
    const note = f === 0 ? "  << depleted" : "";
    console.log(
      `  ${winLabel(b).padEnd(5)} ${bar(f)} ${pct(f)}%  resets ${b.resetTime || "-"} (in ${inText(b.resetTime)})` +
        `  [${b.bucketId}]${note}`,
    );
    if (b.description) console.log(`        ${b.description}`);
  }
}
console.log("\nOne bar in the bottom bar per bucket above, 5h before weekly.");
