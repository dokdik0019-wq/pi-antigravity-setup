#!/usr/bin/env node
/**
 * diagnose-antigravity.mjs — Antigravity / Cloud Code account diagnostics (raw)
 *
 * Shows what Google actually says about the signed-in account, WITHOUT the
 * error-message truncation that hides the useful parts:
 *
 *   1. loadCodeAssist      -> currentTier / paidTier / allowedTiers / ineligibleTiers
 *   2. streamGenerateContent probe -> HTTP status + FULL error body
 *      (including google.rpc.Help "validation_url" when Google wants verification)
 *
 * This is the probe that pinpointed the 2026-09-24 VALIDATION_REQUIRED outage:
 * the normal error text ("Verify your account to continue.") dropped the
 * verification URL that Google attaches in the response body.
 *
 * Usage:  node scripts/diagnose-antigravity.mjs
 * Needs:  ~/.pi/agent/auth.json with an `antigravity` OAuth credential
 *         (created by /login antigravity or pi-antigravity's login flow).
 *
 * NOTE: loadCodeAssist answers DIFFERENTLY per User-Agent — always use the
 * package's antigravityHeaders() (a stray UA once returned UNSUPPORTED_CLIENT).
 */

import { createJiti } from "file:///opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/jiti/lib/jiti.mjs";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Resolve pi-antigravity's internals from the Pi package store (same modules pi uses).
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
  // Resolve the real path of the `pi` binary and walk up to its package root.
  try {
    const { execSync } = createRequire(import.meta.url)("node:child_process");
    const real = fs.realpathSync(execSync("command -v pi", { encoding: "utf8" }).trim());
    let dir = path.dirname(real);
    while (dir !== path.dirname(dir) && !fs.existsSync(path.join(dir, "package.json"))) dir = path.dirname(dir);
    if (hasIndex(dir)) return dir;
    // As a final fallback, ask npm where the global package lives.
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
const client = await jiti.import(path.join(AG, "client", "client.ts"));
const stream = await jiti.import(path.join(AG, "stream", "stream.ts"));

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

const endpoint = client.endpointCandidates()[0];
const headers = client.antigravityHeaders(cred.access);
console.log(`endpoint: ${endpoint}`);
console.log(`project:  ${cred.projectId}`);
console.log(`email:    ${cred.email || "?"}`);
console.log(`token:    expires in ${Math.round((cred.expires - Date.now()) / 1000)}s\n`);

// ── 1. loadCodeAssist: tier + eligibility ─────────────────────────────────────
const r1 = await fetch(`${endpoint}/v1internal:loadCodeAssist`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    metadata: { ideType: "ANTIGRAVITY", platform: "PLATFORM_UNSPECIFIED", pluginType: "GEMINI" },
  }),
});
const lca = await r1.json();
console.log(`loadCodeAssist: HTTP ${r1.status}`);
console.log("  currentTier:", JSON.stringify(lca.currentTier && { id: lca.currentTier.id, name: lca.currentTier.name }));
console.log("  paidTier:   ", JSON.stringify(lca.paidTier && { id: lca.paidTier.id, name: lca.paidTier.name }));
console.log("  allowedTiers:", (lca.allowedTiers || []).map((t) => t.id).join(", ") || "-");
for (const t of lca.ineligibleTiers || []) {
  console.log(`  ineligible: ${t.tierId} [${t.reasonCode}] ${t.reasonMessage}`);
}

// ── 2. generate probe: full error body (incl. validation_url) ─────────────────
const model = { id: "gemini-3.8-flash", provider: "antigravity", api: "antigravity" };
const context = { messages: [{ role: "user", content: "say OK", timestamp: Date.now() }] };
const body = JSON.stringify(
  stream.buildRequest(model, context, cred.projectId || "aicode-consumers", {
    apiKey: JSON.stringify({ token: cred.access, projectId: cred.projectId }),
    reasoning: "off",
  }, "gemini-3.8-flash-high"),
);
const r2 = await fetch(`${endpoint}/v1internal:streamGenerateContent?alt=sse`, {
  method: "POST",
  headers,
  body,
});
const text = await r2.text();
console.log(`\ngenerate probe: HTTP ${r2.status}`);
if (r2.ok) {
  console.log("  OK — first bytes:", text.slice(0, 160).replace(/\n/g, " "));
} else {
  console.log("  FULL error body:");
  console.log("  " + text.slice(0, 2000).replace(/\n/g, "\n  "));
  const urls = [...text.matchAll(/https:\/\/accounts\.google\.com[^"\\]+/g)].map((m) => m[0]);
  if (urls.length) {
    console.log("\n  >>> ACTION REQUIRED — open this Google verification URL:");
    console.log("  " + urls[0]);
  }
}
process.exit(r2.ok ? 0 : 1);
