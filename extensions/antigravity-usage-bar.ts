/**
 * Antigravity Usage Bottom Bar
 *
 * Shows a persistent bottom bar (below the editor) with Antigravity / Cloud Code Assist
 * quota usage: one compact progress bar per quota pool (e.g. 5h + weekly windows),
 * with the remaining percentage and time until reset.
 *
 * Reuses pi-antigravity's quota fetcher (already installed as a package) so OAuth
 * token refresh / account switching keeps working unchanged.
 *
 * Commands:
 *   /agbar         toggle the bottom bar
 *   /agbar refresh force-refresh quota data
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

// ---------------------------------------------------------------------------
// Minimal structural types for pi-antigravity's AccountUsage
// ---------------------------------------------------------------------------

type QuotaBucketLike = {
	bucketId?: string;
	displayName: string;
	window?: string;
	resetTime?: string;
	remainingFraction: number;
};

type QuotaGroupLike = {
	displayName: string;
	buckets: QuotaBucketLike[];
};

type ModelQuotaRowLike = {
	modelId: string;
	displayName?: string;
	remainingFraction?: number;
	resetTime?: string;
};

type AccountUsageLike = {
	email?: string;
	planLabel?: string;
	groups: QuotaGroupLike[];
	quotaSummaryError?: string;
	models: ModelQuotaRowLike[];
	fetchedAt: number;
};

type AgUsageModule = {
	fetchAccountUsage: (apiKeyRaw?: string) => Promise<AccountUsageLike>;
};

// ---------------------------------------------------------------------------
// Locate pi-antigravity's usage module inside the Pi package store
// ---------------------------------------------------------------------------

let modulePromise: Promise<AgUsageModule> | undefined;

function agentDir(): string {
	return process.env.PI_AGENT_DIR || path.join(os.homedir(), ".pi", "agent");
}

function usageModuleCandidates(): string[] {
	const npmRoot = path.join(agentDir(), "npm", "node_modules");
	const candidates: string[] = [];
	// Exact install dir first, then scan package.json names (handles scoped/renamed dirs).
	for (const dir of ["pi-antigravity"]) {
		candidates.push(
			path.join(npmRoot, dir, "src", "usage", "index.ts"),
			path.join(npmRoot, dir, "src", "usage", "index.js"),
		);
	}
	try {
		for (const entry of fs.readdirSync(npmRoot)) {
			const pkgJson = path.join(npmRoot, entry, "package.json");
			try {
				const pkg = JSON.parse(fs.readFileSync(pkgJson, "utf8"));
				if (pkg?.name === "pi-antigravity") {
					candidates.unshift(
						path.join(npmRoot, entry, "src", "usage", "index.ts"),
						path.join(npmRoot, entry, "src", "usage", "index.js"),
					);
				}
			} catch {
				// not a package dir, ignore
			}
		}
	} catch {
		// npm root missing, ignore
	}
	return candidates;
}

function loadAgUsageModule(): Promise<AgUsageModule> {
	if (modulePromise) return modulePromise;
	modulePromise = (async () => {
		let lastError: unknown;
		for (const file of usageModuleCandidates()) {
			if (!fs.existsSync(file)) continue;
			try {
				const mod = (await import(pathToFileURL(file).href)) as Partial<AgUsageModule>;
				if (typeof mod.fetchAccountUsage === "function") return mod as AgUsageModule;
			} catch (error) {
				lastError = error;
			}
		}
		throw new Error(
			`pi-antigravity usage module not found (run: pi install npm:pi-antigravity)` +
				(lastError ? ` — ${String(lastError)}` : ""),
		);
	})();
	return modulePromise;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function bar(remaining: number | undefined, width = 8): string {
	if (remaining === undefined) return `[${"?".repeat(width)}]`;
	const filled = Math.max(0, Math.min(width, Math.round(remaining * width)));
	return `[${"#".repeat(filled)}${"-".repeat(width - filled)}]`;
}

function pct(remaining: number | undefined): string {
	return remaining === undefined ? "?%" : `${Math.round(remaining * 100)}%`;
}

function resetIn(resetTime?: string): string {
	if (!resetTime) return "";
	const ts = Date.parse(resetTime);
	if (!Number.isFinite(ts)) return "";
	const delta = ts - Date.now();
	if (delta <= 0) return "reset now";
	const totalMin = Math.round(delta / 60000);
	const days = Math.floor(totalMin / (60 * 24));
	const hours = Math.floor((totalMin % (60 * 24)) / 60);
	const mins = totalMin % 60;
	if (days > 0) return `${days}d${hours}h`;
	if (hours > 0) return `${hours}h${mins}m`;
	return `${mins}m`;
}

function fmtTokens(n: number): string {
	if (n < 1000) return `${n}`;
	if (n < 1000000) return `${(n / 1000).toFixed(1)}k`;
	return `${(n / 1000000).toFixed(1)}M`;
}

/** Short window label from a bucket ("Five Hour Limit Remaining" -> 5h, etc.) */
function winLabel(bucket: QuotaBucketLike): string {
	const s = `${bucket.window || ""} ${bucket.displayName || ""}`.toLowerCase();
	if (/five.?hour|5.?h/.test(s)) return "5h";
	if (/week/.test(s)) return "wk";
	if (/daily|day/.test(s)) return "day";
	if (/month/.test(s)) return "mo";
	return (bucket.displayName || "pool").slice(0, 3).toLowerCase();
}

/** Short, stable pool label ("Claude and GPT models" -> Claude+GPT, etc.) */
function poolLabel(group: QuotaGroupLike): string {
	const name = (group.displayName || "").replace(/\s+/g, " ").trim();
	const lower = name.toLowerCase();
	if (lower.includes("gemini")) return "Gemini";
	if (lower.includes("claude") && lower.includes("gpt")) return "Claude+GPT";
	if (lower.includes("claude")) return "Claude";
	if (lower.includes("gpt")) return "GPT";
	return name.length > 16 ? `${name.slice(0, 15)}…` : name || "pool";
}

/** Show 5h before weekly before anything else. */
function sortBuckets(buckets: QuotaBucketLike[]): QuotaBucketLike[] {
	const rank = (b: QuotaBucketLike) => {
		const w = winLabel(b);
		return w === "5h" ? 0 : w === "day" ? 1 : w === "wk" ? 2 : 3;
	};
	return [...buckets].sort((a, b) => rank(a) - rank(b));
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
	let enabled = true;
	let usage: AccountUsageLike | undefined;
	let errorMessage: string | undefined;
	let fetchedAt = 0;
	let inFlight = false;
	let timer: ReturnType<typeof setInterval> | undefined;
	let ctxRef: ExtensionContext | undefined;
	let requestRender: (() => void) | undefined;

	async function refresh(ctx: ExtensionContext, force = false): Promise<void> {
		if (inFlight) return;
		if (!force && Date.now() - fetchedAt < 60_000) return;
		inFlight = true;
		try {
			const apiKey = await ctx.modelRegistry.getApiKeyForProvider("antigravity");
			if (!apiKey) {
				errorMessage = "not signed in — run /login antigravity";
				usage = undefined;
				return;
			}
			const ag = await loadAgUsageModule();
			usage = await ag.fetchAccountUsage(apiKey);
			errorMessage = undefined;
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : String(error);
		} finally {
			fetchedAt = Date.now();
			inFlight = false;
			requestRender?.();
		}
	}

	function renderLine(
		width: number,
		theme: { fg: (color: string, text: string) => string },
	): string[] {
		if (!enabled) return [];
		const dim = (t: string) => theme.fg("dim", t);
		const colorFor = (r: number | undefined) =>
			r === undefined ? "dim" : r < 0.2 ? "error" : r < 0.5 ? "warning" : "success";
		const w = Math.max(8, width);
		const label = ((usage ? usage.planLabel || usage.email || "" : "").replace(/\s*\([^)]*\)\s*$/, "").trim() || "Google AI Pro");
		const header = dim(label);

		if (errorMessage) {
			return [truncateToWidth(`${header} ${theme.fg("warning", errorMessage)}`, w, dim("…"))];
		}
		if (!usage) {
			return [truncateToWidth(`${header} ${dim("loading quota…")}`, w, dim("…"))];
		}

		const pools: string[] = [];
			for (const group of usage.groups || []) {
				const buckets = sortBuckets(group.buckets || []);
				if (buckets.length === 0) continue;
				const parts: string[] = [];
				for (const bucket of buckets) {
					const r = bucket.remainingFraction;
					const shownPct = Math.round((r ?? 0) * 100);
					const when = shownPct < 100 ? resetIn(bucket.resetTime) : "";
					parts.push(
						`${dim(winLabel(bucket))}${theme.fg(colorFor(r), bar(r, 6))} ${theme.fg(colorFor(r), pct(r))}` +
							(when ? ` ${dim(when)}` : ""),
					);
				}
				pools.push(`${poolLabel(group)} ${parts.join(" ")}`);
			}
			if (pools.length === 0) {
				// The quota-summary RPC can be unavailable (e.g. "Verify your account").
				// Fall back to the per-model rows: surface only what is actually depleted.
				const rows = (usage.models || []).filter((m) => m.remainingFraction !== undefined);
				const depleted = rows
					.filter((m) => (m.remainingFraction ?? 1) < 1)
					.sort((a, b) => (a.remainingFraction ?? 1) - (b.remainingFraction ?? 1))
					.slice(0, 3);
				for (const row of depleted) {
					const r = row.remainingFraction;
					const label = (row.displayName || row.modelId)
						.replace(/\s+/g, " ")
						.replace(/\s*\([^)]*\)\s*$/, "");
					const when = resetIn(row.resetTime);
					pools.push(
						`${label} ${theme.fg(colorFor(r), bar(r, 6))} ${theme.fg(colorFor(r), pct(r))}` +
							(when ? ` ${dim(when)}` : ""),
					);
				}
				if (rows.length > 0 && depleted.length === 0) {
					// Everything is still full: one compact summary instead of 30+ rows.
					const nextReset = rows
						.map((m) => m.resetTime)
						.filter((t): t is string => typeof t === "string")
						.sort()[0];
					const when = resetIn(nextReset);
					pools.push(
						`${rows.length} models ${theme.fg("success", bar(1, 6))} ${theme.fg("success", "100%")}` +
							(when ? ` ${dim(when)}` : ""),
					);
				}
				if (rows.length === 0) {
					pools.push(dim(usage.quotaSummaryError ? "quota: n/a (summary unavailable)" : "quota: n/a"));
				}
			}

			const oneLine = `${header} ${pools.join(dim(" · "))}`;
			if (visibleWidth(oneLine) <= w) return [oneLine];
			// Narrow terminal: give every pool its own line so nothing gets cut.
			const lines = [truncateToWidth(header, w, dim("…"))];
			for (const pool of pools) lines.push(truncateToWidth(` ${pool}`, w, dim("…")));
			return lines;
	}

	function installWidget(ctx: ExtensionContext): void {
		ctx.ui.setWidget(
			"antigravity-usage",
			(tui, theme) => {
				requestRender = () => tui.requestRender();
				return {
					invalidate() {},
					dispose() {
						requestRender = undefined;
					},
					render(width: number): string[] {
						return renderLine(width, theme);
					},
				};
			},
			{ placement: "belowEditor" },
		);
	}

	pi.on("session_start", (_event, ctx) => {
		ctxRef = ctx;
		if (ctx.hasUI) installWidget(ctx);
		void refresh(ctx, true);
		if (timer) clearInterval(timer);
		timer = setInterval(() => {
			if (ctxRef) void refresh(ctxRef);
		}, 120_000);
	});

	// Keep quota fresh as work progresses.
	pi.on("turn_end", (_event, ctx) => {
		void refresh(ctx);
	});

	pi.on("session_shutdown", () => {
		if (timer) {
			clearInterval(timer);
			timer = undefined;
		}
		ctxRef = undefined;
		requestRender = undefined;
	});

	pi.registerCommand("agbar", {
		description: "Toggle/refresh the Antigravity usage bottom bar (/agbar refresh)",
		handler: async (args, ctx) => {
			if (/refresh/i.test(args || "")) {
				await refresh(ctx, true);
				ctx.ui.notify("Antigravity quota refreshed", "info");
				return;
			}
			enabled = !enabled;
			if (ctx.hasUI) {
				if (enabled) installWidget(ctx);
				else ctx.ui.setWidget("antigravity-usage", undefined);
			}
			ctx.ui.notify(`Antigravity usage bar ${enabled ? "enabled" : "disabled"}`, "info");
			requestRender?.();
		},
	});
}
