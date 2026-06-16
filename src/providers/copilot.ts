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
 * Note: the Copilot API (`api.githubcopilot.com`) sends no CORS headers, so it
 * cannot be called directly from a browser. A browser deployment must route through
 * a backend/proxy (set `baseUrl` to it); constructing this provider in a browser
 * against the default host throws {@link RuntimeUnsupportedError}.
 *
 * @packageDocumentation
 */

import type { Provider, CredentialSource, ModelSelectionOptions } from "./provider.js";
import type { RetryOptions } from "./retry.js";
import { createOpenAICompatibleProvider } from "./openai-compatible.js";
import { detectRuntime } from "../core/runtime.js";
import { RuntimeUnsupportedError } from "../core/errors.js";

/** Default Copilot-compatible chat completions base URL. */
const DEFAULT_COPILOT_BASE_URL = "https://api.githubcopilot.com";

/**
 * Headers `api.githubcopilot.com` requires on every request. Omitting any of
 * these causes the API to reject the call with HTTP 400. They are sent by default
 * and can be overridden per option via `headers`.
 */
const COPILOT_DEFAULT_HEADERS: Record<string, string> = {
	"Editor-Version": "vscode/1.95.0",
	"Editor-Plugin-Version": "copilot-chat/0.20.0",
	"Copilot-Integration-Id": "vscode-chat",
	"Openai-Intent": "conversation-panel",
};

/**
 * Options for {@link createCopilotProvider}.
 *
 * GitHub Copilot exposes several models, so configure them via `models` (with an
 * optional `defaultModel`). A single `capabilities` object is also accepted.
 */
export interface CopilotProviderOptions extends CredentialSource, ModelSelectionOptions {
	/** Override the Copilot base URL if needed. */
	baseUrl?: string;
	/**
	 * Extra/override request headers. Merged over the required Copilot defaults
	 * (`Editor-Version`, `Editor-Plugin-Version`, `Copilot-Integration-Id`,
	 * `Openai-Intent`), so you can adjust them without losing the others.
	 */
	headers?: Record<string, string>;
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
 *
 * @throws {RuntimeUnsupportedError} when constructed in a browser against the
 * default Copilot host. `api.githubcopilot.com` does not send CORS headers, so a
 * browser cannot call it directly — host a small backend/proxy and point `baseUrl`
 * at it (which lifts this guard), or run the provider server-side (Node/edge).
 */
export function createCopilotProvider(options: CopilotProviderOptions): Provider {
	const baseUrl = options.baseUrl ?? DEFAULT_COPILOT_BASE_URL;

	// Frontend-only guard: the Copilot API has no CORS support, so a browser must
	// route through a backend/proxy. Setting a custom `baseUrl` (your proxy) is the
	// supported opt-in and lifts this guard. Edge/Node (server-side) are unaffected.
	const usingDefaultHost = baseUrl === DEFAULT_COPILOT_BASE_URL;
	if (usingDefaultHost && detectRuntime().isBrowser) {
		throw new RuntimeUnsupportedError(
			"GitHub Copilot directly from a browser (the Copilot API sends no CORS headers)",
			{
				reason: "cors",
				remedy:
					"Run a lightweight backend/proxy (e.g. a Vite dev-server proxy or a small server route) " +
					"that forwards to https://api.githubcopilot.com, then set `baseUrl` to your proxy URL. " +
					"Alternatively, run the Copilot provider server-side (Node or an edge function).",
			},
		);
	}

	const inner = createOpenAICompatibleProvider({
		baseUrl,
		getCredential: options.getCredential,
		capabilities: options.capabilities,
		models: options.models,
		defaultModel: options.defaultModel,
		// Copilot rejects calls missing its identification headers; defaults are
		// applied here and remain overridable via `options.headers`.
		headers: { ...COPILOT_DEFAULT_HEADERS, ...(options.headers ?? {}) },
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
