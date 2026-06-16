/**
 * Conversation thread with automatic compaction. When a thread approaches the
 * model's input-token budget it is summarized into a compact form so the
 * conversation can continue. (FR-004, FR-004a, FR-004b)
 *
 * @packageDocumentation
 */

import type { Message, ModelCapabilities } from "../core/types.js";
import { messageText, textMessage } from "../core/types.js";
import type { Provider } from "../providers/provider.js";

/** Options controlling a thread's compaction behavior. */
export interface ThreadOptions {
	/** Fraction of `maxInputTokens` at which compaction triggers. Default 0.9. */
	compactionThreshold?: number;
	/** Provider used to summarize; defaults to the agent's own provider. (FR-004b) */
	compactionModel?: Provider;
	/** Capabilities of the model in use; defaults to the provider's default model. */
	modelCapabilities?: ModelCapabilities;
}

/** Rough token estimate (~4 chars/token) — avoids a tokenizer dependency. */
export function estimateTokens(messages: Message[]): number {
	const chars = messages.reduce((sum, m) => sum + messageText(m).length, 0);
	return Math.ceil(chars / 4);
}

/** A multi-turn conversation that preserves context and compacts when large. */
export class Thread {
	readonly id: string;
	messages: Message[];
	/** Whether the thread has been compacted at least once. */
	compacted = false;

	constructor(id?: string, messages: Message[] = []) {
		this.id = id ?? cryptoRandomId();
		this.messages = messages;
	}

	/** Append a message. */
	add(message: Message): void {
		this.messages.push(message);
	}

	/** Serializable snapshot for persistence. */
	toJSON(): { id: string; messages: Message[]; compacted: boolean } {
		return { id: this.id, messages: this.messages, compacted: this.compacted };
	}

	/** Restore a thread from a snapshot. */
	static fromJSON(data: { id: string; messages: Message[]; compacted?: boolean }): Thread {
		const t = new Thread(data.id, data.messages);
		t.compacted = data.compacted ?? false;
		return t;
	}

	/**
	 * Compact the thread if it exceeds the threshold. System messages and the most
	 * recent turn are preserved; older turns are summarized via the model.
	 *
	 * @returns true if compaction occurred.
	 */
	async maybeCompact(provider: Provider, options?: ThreadOptions): Promise<boolean> {
		const threshold = options?.compactionThreshold ?? 0.9;
		const caps = options?.modelCapabilities ?? provider.capabilities;
		const limit = caps.maxInputTokens * threshold;
		if (estimateTokens(this.messages) < limit) return false;

		const summarizer = options?.compactionModel ?? provider;
		const system = this.messages.filter((m) => m.role === "system");
		const recent = this.messages.slice(-2);
		const toSummarize = this.messages.filter((m) => m.role !== "system").slice(0, -2);
		if (toSummarize.length === 0) return false;

		const summary = await summarizer.generate({
			messages: [
				textMessage(
					"system",
					"Summarize the following conversation compactly, preserving facts, decisions, and open questions.",
				),
				textMessage("user", toSummarize.map((m) => `${m.role}: ${messageText(m)}`).join("\n")),
			],
		});

		this.messages = [
			...system,
			textMessage("system", `Summary of earlier conversation: ${summary.text}`),
			...recent,
		];
		this.compacted = true;
		return true;
	}
}

function cryptoRandomId(): string {
	const c = (globalThis as { crypto?: Crypto }).crypto;
	if (c?.randomUUID) return c.randomUUID();
	return `thread-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}
