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
import { ValidationError } from "../core/errors.js";

/** A caller-supplied source of credentials. The framework never stores the value. */
export interface CredentialSource {
	/** Return the current credential (token/api key). May be async. */
	getCredential(): string | Promise<string>;
}

/**
 * Model configuration for a provider. A provider may expose **one or more** models
 * (e.g. GitHub Copilot offers several; an OpenAI-compatible endpoint is usually one).
 * Supply either a single `capabilities` object or an array via `models`.
 */
export interface ModelSelectionOptions {
	/** Single-model shorthand. */
	capabilities?: ModelCapabilities;
	/** One or more models this provider can use. */
	models?: ModelCapabilities[];
	/** Name of the default model (defaults to the first entry). */
	defaultModel?: string;
}

/** Resolved model set with a default and a lookup helper. */
export interface ResolvedModels {
	/** All configured models (at least one). */
	models: ModelCapabilities[];
	/** The default model used when a request does not specify one. */
	defaultModel: ModelCapabilities;
	/** Look up a model by name, or return the default when omitted. */
	modelOf(name?: string): ModelCapabilities;
}

/**
 * Normalize {@link ModelSelectionOptions} into a model list, a default, and a
 * lookup helper. Throws {@link ValidationError} if no model is configured or a
 * named model is missing.
 *
 * @example
 * ```ts
 * const { defaultModel, modelOf } = resolveModels({
 *   models: [
 *     { model: "gpt-4o", maxInputTokens: 128000, maxOutputTokens: 16000 },
 *     { model: "o3-mini", maxInputTokens: 200000, maxOutputTokens: 100000, supportsReasoning: true },
 *   ],
 *   defaultModel: "gpt-4o",
 * });
 * ```
 */
export function resolveModels(options: ModelSelectionOptions): ResolvedModels {
	const models = options.models ?? (options.capabilities ? [options.capabilities] : []);
	if (models.length === 0) {
		throw new ValidationError("Provider requires at least one model (set `capabilities` or `models`)");
	}
	const defaultModel = options.defaultModel
		? models.find((m) => m.model === options.defaultModel)
		: models[0];
	if (!defaultModel) {
		throw new ValidationError(`defaultModel "${options.defaultModel}" is not present in models`);
	}
	const modelOf = (name?: string): ModelCapabilities => {
		if (!name) return defaultModel;
		const found = models.find((m) => m.model === name);
		if (!found) {
			throw new ValidationError(`Model "${name}" is not configured for this provider`);
		}
		return found;
	};
	return { models, defaultModel, modelOf };
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
	/** Which configured model to use; defaults to the provider's default model. */
	model?: string;
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
	/** The default model's capability configuration. (FR-007a) */
	readonly capabilities: ModelCapabilities;
	/** All models this provider is configured with (one or more). */
	readonly models: ModelCapabilities[];
	/** Look up a configured model by name, or the default when omitted. */
	model(name?: string): ModelCapabilities;
	/** Generate a complete response. */
	generate(req: GenerateRequest): Promise<GenerateResponse>;
	/** Generate a streamed response. */
	generateStream(req: GenerateRequest): AsyncIterable<GenerateChunk>;
}
