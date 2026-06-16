/**
 * GitHub Copilot provider. (FR-005)
 *
 * Copilot's chat API is OpenAI-compatible, so this provider configures the shared
 * OpenAI-compatible transport with Copilot's endpoint and the caller-supplied
 * credential (a Copilot/GitHub token). The token is obtained via callback and is
 * never bundled, persisted, or logged. (FR-005a)
 *
 * In a frontend-only deployment the end user supplies their own token (it stays
 * client-side); in a backend deployment the developer may supply it, or the user
 * sends it per request over SSL/TLS and the backend must not log or persist it.
 *
 * @packageDocumentation
 */

import type { Provider, CredentialSource, ModelSelectionOptions } from "./provider.js";
import type { RetryOptions } from "./retry.js";
import { createOpenAICompatibleProvider } from "./openai-compatible.js";

/** Default Copilot-compatible chat completions base URL. */
const DEFAULT_COPILOT_BASE_URL = "https://api.githubcopilot.com";

/**
 * Options for {@link createCopilotProvider}.
 *
 * GitHub Copilot exposes several models, so configure them via `models` (with an
 * optional `defaultModel`). A single `capabilities` object is also accepted.
 */
export interface CopilotProviderOptions extends CredentialSource, ModelSelectionOptions {
	/** Override the Copilot base URL if needed. */
	baseUrl?: string;
	/** Retry tuning for transient failures. */
	retry?: RetryOptions;
	/** Optional custom fetch (for testing or non-standard runtimes). */
	fetchImpl?: typeof fetch;
}

/**
 * Create a GitHub Copilot provider.
 *
 * @example Single model
 * ```ts
 * const provider = createCopilotProvider({
 *   getCredential: () => myCopilotToken, // never logged or persisted
 *   capabilities: { model: "gpt-4o", maxInputTokens: 128000, maxOutputTokens: 16000 },
 * });
 * ```
 *
 * @example Multiple models
 * ```ts
 * const provider = createCopilotProvider({
 *   getCredential: () => myCopilotToken,
 *   models: [
 *     { model: "gpt-4o", maxInputTokens: 128000, maxOutputTokens: 16000, supportsVision: true },
 *     { model: "o3-mini", maxInputTokens: 200000, maxOutputTokens: 100000, supportsReasoning: true },
 *   ],
 *   defaultModel: "gpt-4o",
 * });
 * // Pick a model per request: provider.generate({ messages, model: "o3-mini" })
 * ```
 */
export function createCopilotProvider(options: CopilotProviderOptions): Provider {
	const inner = createOpenAICompatibleProvider({
		baseUrl: options.baseUrl ?? DEFAULT_COPILOT_BASE_URL,
		getCredential: options.getCredential,
		capabilities: options.capabilities,
		models: options.models,
		defaultModel: options.defaultModel,
		retry: options.retry,
		fetchImpl: options.fetchImpl,
	});
	// Preserve the provider contract but report the Copilot name.
	return {
		name: "copilot",
		capabilities: inner.capabilities,
		models: inner.models,
		model: inner.model.bind(inner),
		generate: inner.generate.bind(inner),
		generateStream: inner.generateStream.bind(inner),
	};
}
