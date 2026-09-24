/**
 * Tokens-per-second (tok/s) Extension — working-line edition
 *
 * Shows tok/s on the WORKING row (the spinner line right above the editor),
 * the same line that shows the "working…" message while the agent streams:
 *
 *   live   :  ⚡ ~87 tok/s · ~1.2k tok        (estimated, throttled ~2x/sec)
 *   final  :  ⚡ 87.3 tok/s · ↓1.2k in 13.7s · ttft 0.8s
 *
 * Implementation: `ctx.ui.setWorkingMessage()` writes exactly that row.
 *
 * Measurement:
 *   - live  : streamed chars / 4 as a token estimate (or the provider's partial
 *             usage when it reports output tokens mid-stream)
 *   - final : usage.output / generation time (first delta → message end), with
 *             ttft = request start → first delta
 *
 * Command:
 *   /toks   toggle the display and show session averages
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type UsageLike = { input?: number; output?: number };
type AssistantLike = { role: string; usage?: UsageLike };
type DeltaEventLike = { type?: string; delta?: string; partial?: { usage?: UsageLike } };

export default function (pi: ExtensionAPI) {
	let enabled = true;
	let samples: number[] = [];

	// Per-response streaming state
	let msgStart = 0;
	let firstDelta = 0;
	let estChars = 0;
	let reported = 0;
	let lastPaint = 0;

	const fmt = (n: number) => (n < 1000 ? `${n}` : `${(n / 1000).toFixed(1)}k`);
	const estTokens = () => (reported > 0 ? reported : Math.round(estChars / 4));

	function liveLine(): string {
		const secs = Math.max(0.001, (Date.now() - (firstDelta || msgStart)) / 1000);
		const tps = estTokens() / secs;
		const approx = reported > 0 ? "" : "~";
		return `⚡ ${approx}${tps.toFixed(0)} tok/s · ${approx}${fmt(estTokens())} tok`;
	}

	pi.on("message_start", (event, ctx) => {
		const message = event.message as AssistantLike;
		if (message.role !== "assistant") return;
		msgStart = Date.now();
		firstDelta = 0;
		estChars = 0;
		reported = 0;
		lastPaint = 0;
		if (enabled && ctx.hasUI) ctx.ui.setWorkingMessage("⚡ …");
	});

	pi.on("message_update", (event, ctx) => {
		const message = event.message as AssistantLike;
		if (message.role !== "assistant") return;
		const deltaEvent = event.assistantMessageEvent as DeltaEventLike | undefined;
		if (deltaEvent && typeof deltaEvent.delta === "string") {
			if (!firstDelta) firstDelta = Date.now();
			estChars += deltaEvent.delta.length;
		}
		const partialOut = deltaEvent?.partial?.usage?.output;
		if (typeof partialOut === "number" && partialOut > 0) reported = partialOut;

		// Throttle repaints (message_update fires on every token) and skip the first
		// <0.8s where a tiny elapsed time makes the rate absurdly large.
		const now = Date.now();
		const sinceFirst = now - (firstDelta || msgStart);
		if (enabled && ctx.hasUI && sinceFirst >= 800 && now - lastPaint >= 400) {
			lastPaint = now;
			ctx.ui.setWorkingMessage(liveLine());
		}
	});

	pi.on("message_end", (event, ctx) => {
		const message = event.message as AssistantLike;
		if (message.role !== "assistant") return;
		const end = Date.now();
		const output = message.usage?.output && message.usage.output > 0 ? message.usage.output : estTokens();
		const genSecs = Math.max(0.001, (end - (firstDelta || msgStart || end)) / 1000);
		const reqSecs = Math.max(0.001, (end - (msgStart || end)) / 1000);
		const ttft = msgStart ? Math.max(0, ((firstDelta || msgStart) - msgStart) / 1000) : 0;
		const tps = output / genSecs;
		if (output > 0) {
			samples.push(tps);
			if (samples.length > 50) samples.shift();
		}

		if (!ctx.hasUI) return;
		if (!enabled) {
			ctx.ui.setWorkingMessage(); // restore the default "working…" message
			return;
		}
		const parts = [`⚡ ${tps.toFixed(1)} tok/s`, `↓${fmt(output)} in ${reqSecs.toFixed(1)}s`];
		if (ttft > 0.05) parts.push(`ttft ${ttft.toFixed(1)}s`);
		ctx.ui.setWorkingMessage(parts.join(" · "));
	});

	pi.registerCommand("toks", {
		description: "Toggle the tok/s working-line display (/toks)",
		handler: async (_args, ctx) => {
			enabled = !enabled;
			if (!enabled) {
				ctx.ui.setWorkingMessage(); // restore default working message
				ctx.ui.notify("tok/s display disabled", "info");
				return;
			}
			const avg = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 0;
			const peak = samples.length ? Math.max(...samples) : 0;
			const summary =
				samples.length > 0
					? `tok/s on the working line — ${samples.length} responses, avg ${avg.toFixed(1)}, peak ${peak.toFixed(1)} tok/s`
					: "tok/s display enabled (working line)";
			ctx.ui.notify(summary, "info");
		},
	});
}
