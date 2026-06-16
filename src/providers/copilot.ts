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

import type { ModelCapabilities } from "../core/types.js";
import type { Provider, CredentialSource } from "./provider.js";
import type { RetryOptions } from "./retry.js";
import { createOpenAICompatibleProvider } from "./openai-compatible.js";

/** Default Copilot-compatible chat completions base URL. */
const DEFAULT_COPILOT_BASE_URL = "https://api.githubcopilot.com";

/** Options for {@link createCopilotProvider}. */
export interface CopilotProviderOptions extends CredentialSource {
	/** Per-model capability configuration. */
	capabilities: ModelCapabilities;
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
 * @example
 * ```ts
 * const provider = createCopilotProvider({
 *   getCredential: () => myCopilotToken, // never logged or persisted
 *   capabilities: { model: "gpt-4o", maxInputTokens: 128000, maxOutputTokens: 16000 },
 * });
 * ```
 */
export function createCopilotProvider(options: CopilotProviderOptions): Provider {
	const inner = createOpenAICompatibleProvider({
		baseUrl: options.baseUrl ?? DEFAULT_COPILOT_BASE_URL,
		getCredential: options.getCredential,
		capabilities: options.capabilities,
		retry: options.retry,
		fetchImpl: options.fetchImpl,
	});
	// Preserve the provider contract but report the Copilot name.
	return {
		name: "copilot",
		capabilities: inner.capabilities,
		generate: inner.generate.bind(inner),
		generateStream: inner.generateStream.bind(inner),
	};
}
