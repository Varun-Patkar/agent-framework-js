/**
 * LLM provider abstraction. Agents and workflows depend only on this interface,
 * never on a concrete provider, so new providers can be added without changing
 * agent/workflow code. (FR-007)
 *
 * Credentials are always obtained via a caller-supplied callback and are never
 * bundled, persisted, or logged by the framework. (FR-005a, FR-008)
 *
 * @packageDocumentation
 */

import type { Message, ModelCapabilities } from "../core/types.js";

/** A caller-supplied source of credentials. The framework never stores the value. */
export interface CredentialSource {
	/** Return the current credential (token/api key). May be async. */
	getCredential(): string | Promise<string>;
}

/** A tool description passed to the provider so the model can decide to call it. */
export interface ToolSpec {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
}

/** A request to generate a model response. */
export interface GenerateRequest {
	messages: Message[];
	tools?: ToolSpec[];
	/** Abort signal to cancel an in-flight request. */
	signal?: AbortSignal;
}

/** A tool call requested by the model. */
export interface ToolCall {
	id: string;
	name: string;
	/** Raw JSON arguments (validated by the tools module before invocation). */
	arguments: unknown;
}

/** A complete (non-streaming) model response. */
export interface GenerateResponse {
	/** Final answer text. */
	text: string;
	/** Reasoning/thinking content — only present for reasoning-capable models. (FR-003a) */
	reasoning?: string;
	/** Tool calls the model wants to make, if any. */
	toolCalls?: ToolCall[];
	/** Approximate token usage if reported by the provider. */
	usage?: { inputTokens?: number; outputTokens?: number };
}

/** An incremental streaming chunk. */
export type GenerateChunk =
	| { type: "text"; text: string }
	| { type: "reasoning"; text: string }
	| { type: "tool-call"; toolCall: ToolCall }
	| { type: "done"; response: GenerateResponse };

/**
 * An LLM backend. Implementations adapt a concrete API (Copilot, OpenAI-compatible)
 * onto this uniform surface.
 */
export interface Provider {
	/** Stable provider identifier, e.g. `"openai-compatible"`. */
	readonly name: string;
	/** Per-model capability configuration supplied by the caller. (FR-007a) */
	readonly capabilities: ModelCapabilities;
	/** Generate a complete response. */
	generate(req: GenerateRequest): Promise<GenerateResponse>;
	/** Generate a streamed response. */
	generateStream(req: GenerateRequest): AsyncIterable<GenerateChunk>;
}
