#!/usr/bin/env node
/**
 * patch-gemini-4-argon.mjs
 *
 * Automatically patches pi-antigravity to enable Gemini 4 Argon:
 * 1. Updates DEFAULT_USER_AGENT in client.ts to 1.3.6 (cl 999748552) to bypass Google's version gate
 * 2. Adds gemini-4-argon routing, model definition, and placeholder enums to models.ts
 * 3. Resets checkedAt in models-store.json so Pi immediately discovers the model
 *
 * Usage: node scripts/patch-gemini-4-argon.mjs
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const agentDir = process.env.PI_AGENT_DIR || path.join(os.homedir(), ".pi", "agent");
const pkgDir = path.join(agentDir, "npm", "node_modules", "pi-antigravity");
const clientPath = path.join(pkgDir, "src", "client", "client.ts");
const modelsPath = path.join(pkgDir, "src", "models", "models.ts");
const storePath = path.join(agentDir, "models-store.json");

if (!fs.existsSync(pkgDir)) {
  console.error(`[error] pi-antigravity not found at ${pkgDir}`);
  process.exit(1);
}

function backupFile(filePath) {
  const backup = `${filePath}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  fs.copyFileSync(filePath, backup);
  console.log(`[backup] Created ${path.basename(backup)}`);
}

// 1. Patch client.ts
console.log("[1/3] Checking client.ts User-Agent...");
let clientCode = fs.readFileSync(clientPath, "utf-8");
const oldUA = 'const DEFAULT_USER_AGENT =\n  "antigravity/cli/1.2.4 (aidev_client; os_type=linux; arch=amd64; cl=982146307; auth_method=consumer)";';
const newUA = 'const DEFAULT_USER_AGENT =\n  "antigravity/cli/1.3.6 (aidev_client; os_type=darwin; arch=arm64; cl=999748552; auth_method=consumer)";';

if (clientCode.includes("cl=999748552")) {
  console.log("  client.ts already has 1.3.6 User-Agent, skipping.");
} else if (clientCode.includes(oldUA)) {
  backupFile(clientPath);
  clientCode = clientCode.replace(oldUA, newUA);
  fs.writeFileSync(clientPath, clientCode, "utf-8");
  console.log("  Successfully patched client.ts with 1.3.6 User-Agent.");
} else {
  console.warn("  [warn] Could not find exact old User-Agent pattern in client.ts. Manual check recommended.");
}

// 2. Patch models.ts
console.log("[2/3] Checking models.ts definitions...");
let modelsCode = fs.readFileSync(modelsPath, "utf-8");

if (modelsCode.includes('"gemini-4-argon"')) {
  console.log("  models.ts already contains gemini-4-argon definitions, skipping.");
} else {
  backupFile(modelsPath);

  // A. Add routing
  const routingTarget = 'export const ANTIGRAVITY_ROUTING: Record<string, AntigravityRouting> = {\n';
  const routingSnippet = `export const ANTIGRAVITY_ROUTING: Record<string, AntigravityRouting> = {
  "gemini-4-argon": {
    off: "gemini-4-argon-low",
    routing: {
      minimal: "gemini-4-argon-low",
      low: "gemini-4-argon-low",
      medium: "gemini-4-argon-medium",
      high: "gemini-4-argon-high",
      xhigh: "gemini-4-argon-high",
    },
    defaultRequestId: "gemini-4-argon-low",
  },\n`;
  modelsCode = modelsCode.replace(routingTarget, routingSnippet);

  // B. Add model
  const modelTarget = 'export const ANTIGRAVITY_MODELS: ProviderModelConfig[] = [\n';
  const modelSnippet = `export const ANTIGRAVITY_MODELS: ProviderModelConfig[] = [
  {
    id: "gemini-4-argon",
    name: "Gemini 4 Argon (Antigravity)",
    reasoning: true,
    thinkingLevelMap: thinkingLevelMaps.lowMediumHigh,
    input: ["text", "image"],
    cost: geminiProCost,
    contextWindow: 1048576,
    maxTokens: 65536,
  },\n`;
  modelsCode = modelsCode.replace(modelTarget, modelSnippet);

  // C. Add enum
  const enumTarget = 'export const ANTIGRAVITY_MODEL_ENUM: Record<string, string> = {\n';
  const enumSnippet = `export const ANTIGRAVITY_MODEL_ENUM: Record<string, string> = {
  // Gemini 4 Argon
  "gemini-4-argon": "MODEL_PLACEHOLDER_M418",
  "gemini-4-argon-high": "MODEL_PLACEHOLDER_M417",
  "gemini-4-argon-medium": "MODEL_PLACEHOLDER_M418",
  "gemini-4-argon-low": "MODEL_PLACEHOLDER_M419",\n`;
  modelsCode = modelsCode.replace(enumTarget, enumSnippet);

  fs.writeFileSync(modelsPath, modelsCode, "utf-8");
  console.log("  Successfully added gemini-4-argon definitions to models.ts.");
}

// 3. Reset models-store.json cache
console.log("[3/3] Checking models-store.json cache...");
if (fs.existsSync(storePath)) {
  try {
    const store = JSON.parse(fs.readFileSync(storePath, "utf-8"));
    if (store?.antigravity?.["pi-antigravity"]) {
      store.antigravity["pi-antigravity"].checkedAt = 0;
      fs.writeFileSync(storePath, JSON.stringify(store, null, 2), "utf-8");
      console.log("  Reset checkedAt in models-store.json.");
    }
  } catch (err) {
    console.warn("  [warn] Could not parse models-store.json:", err.message);
  }
}

console.log("\n[done] Patch completed. Run `pi --list-models antigravity` to verify.");
