/**
 * OpenAI-compatible provider. Targets any endpoint speaking the OpenAI
 * `/chat/completions` API, including local servers such as LM Studio via a custom
 * `baseUrl`, and GitHub Copilot (see {@link createCopilotProvider}). (FR-006)
 *
 * Provider compatibility notes (handled here so callers don't have to):
 * - Tool names are sanitized to `^[a-zA-Z0-9_-]+$` on the wire (OpenAI/Copilot
 *   reject dotted names like `webiq.browse`) and translated back to the registry
 *   key when the model calls them.
 * - Assistant turns that requested tools emit `tool_calls` with `content: null`
 *   so strict providers (e.g. Anthropic) can pair each tool result with its call.
 * - Streaming responses accumulate `delta.tool_calls[]` keyed by `index`
 *   (fragments may start at a non-zero index when reasoning occupies 0/1).
 * - Some reasoning models report `finish_reason: "tool_calls"` from the
 *   non-streaming endpoint without a `tool_calls` array; `generate` transparently
 *   re-requests in streaming mode and assembles them, failing loud (typed
 *   {@link ProviderError}) rather than silently stopping if none materialize.
 *
 * @packageDocumentation
 */

import type { Message, ContentPart, MessageToolCall } from "../core/types.js";
import { ProviderError } from "../core/errors.js";
import type {
	Provider,
	CredentialSource,
	GenerateRequest,
	GenerateResponse,
	GenerateChunk,
	ToolCall,
	ToolSpec,
} from "./provider.js";
import { resolveModels, type ModelSelectionOptions } from "./provider.js";
import { withRetry, providerErrorFromStatus, type RetryOptions } from "./retry.js";

/**
 * Options for {@link createOpenAICompatibleProvider}.
 *
 * Supply a single model via `capabilities`, or multiple via `models` (most
 * OpenAI-compatible endpoints expose one model, but multiple are supported).
 */
export interface OpenAICompatibleProviderOptions extends CredentialSource, ModelSelectionOptions {
	/** Base URL of the OpenAI-compatible API, e.g. `http://localhost:1234/v1`. */
	baseUrl: string;
	/**
	 * Extra request headers merged into every call (e.g. provider-required
	 * identification headers). The `authorization` header is always set from
	 * `getCredential()` and cannot be overridden here.
	 */
	headers?: Record<string, string>;
	/** Retry tuning for transient failures. */
	retry?: RetryOptions;
	/** Optional custom fetch (for testing or non-standard runtimes). */
	fetchImpl?: typeof fetch;
}

interface OpenAIMessage {
	role: string;
	content: unknown;
	tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
	tool_call_id?: string;
	name?: string;
	reasoning_opaque?: string;
}

/** OpenAI/Copilot require tool names to match `^[a-zA-Z0-9_-]{1,128}$`. */
const UNSAFE_TOOL_NAME_CHARS = /[^a-zA-Z0-9_-]/g;

/**
 * Sanitize a (possibly namespaced) tool name for the wire. Dotted MCP names like
 * `webiq.browse` become `webiq_browse`; the original is recovered via the
 * per-request name map when the model calls the tool.
 */
function sanitizeToolName(name: string): string {
	return name.replace(UNSAFE_TOOL_NAME_CHARS, "_");
}

function toOpenAIContent(parts: ContentPart[]): unknown {
	if (parts.every((p) => p.type === "text")) {
		return parts.map((p) => (p as { text: string }).text).join("");
	}
	return parts.map((p) =>
		p.type === "text"
			? { type: "text", text: p.text }
			: { type: "image_url", image_url: { url: p.data } },
	);
}

function toWireToolCalls(
	toolCalls: MessageToolCall[],
): Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> {
	return toolCalls.map((tc) => ({
		id: tc.id,
		type: "function",
		function: {
			name: sanitizeToolName(tc.name),
			arguments:
				typeof tc.arguments === "string" ? tc.arguments : JSON.stringify(tc.arguments ?? {}),
		},
	}));
}

function toOpenAIMessages(messages: Message[]): OpenAIMessage[] {
	return messages.map((m) => {
		const msg: OpenAIMessage = { role: m.role, content: toOpenAIContent(m.parts) };
		if (m.toolCalls && m.toolCalls.length > 0) {
			msg.tool_calls = toWireToolCalls(m.toolCalls);
			// Strict providers require `content: null` (not "") on an assistant turn
			// that only carries tool calls.
			const hasText = m.parts.some((p) => p.type === "text" && p.text.length > 0);
			if (!hasText) msg.content = null;
		}
		if (m.toolCallId) msg.tool_call_id = m.toolCallId;
		if (m.name) msg.name = sanitizeToolName(m.name);
		if (m.reasoningOpaque) msg.reasoning_opaque = m.reasoningOpaque;
		return msg;
	});
}

/** Wire tool specs plus a map from sanitized name back to the registry key. */
interface WireTools {
	tools?: Array<{ type: "function"; function: { name: string; description: string; parameters: unknown } }>;
	nameMap: Map<string, string>;
}

function buildWireTools(specs?: ToolSpec[]): WireTools {
	const nameMap = new Map<string, string>();
	if (!specs || specs.length === 0) return { tools: undefined, nameMap };
	const tools = specs.map((t) => {
		const wireName = sanitizeToolName(t.name);
		nameMap.set(wireName, t.name);
		return {
			type: "function" as const,
			function: { name: wireName, description: t.description, parameters: t.inputSchema },
		};
	});
	return { tools, nameMap };
}

/**
 * Create an OpenAI-compatible provider (works with LM Studio, vLLM, etc.).
 *
 * @example
 * ```ts
 * const provider = createOpenAICompatibleProvider({
 *   baseUrl: "http://localhost:1234/v1",
 *   getCredential: () => process.env.LMSTUDIO_KEY ?? "",
 *   capabilities: { model: "local", maxInputTokens: 262144, maxOutputTokens: 32000 },
 * });
 * ```
 */
export function createOpenAICompatibleProvider(
	options: OpenAICompatibleProviderOptions,
): Provider {
	const doFetch = options.fetchImpl ?? globalThis.fetch;
	const url = `${options.baseUrl.replace(/\/$/, "")}/chat/completions`;
	const { models, defaultModel, modelOf } = resolveModels(options);

	async function authHeaders(): Promise<Record<string, string>> {
		const cred = await options.getCredential();
		// content-type first, then caller headers (may override it), then the
		// credential-derived authorization which always wins.
		const headers: Record<string, string> = {
			"content-type": "application/json",
			...(options.headers ?? {}),
		};
		if (cred) headers["authorization"] = `Bearer ${cred}`;
		return headers;
	}

	function body(req: GenerateRequest, stream: boolean, wire: WireTools): string {
		return JSON.stringify({
			model: modelOf(req.model).model,
			messages: toOpenAIMessages(req.messages),
			stream,
			// Ask the API to emit a trailing usage chunk on streamed responses so the
			// final `done` response can surface real token counts (FR usage reporting).
			...(stream ? { stream_options: { include_usage: true } } : {}),
			...(wire.tools ? { tools: wire.tools } : {}),
		});
	}

	function parseToolCalls(raw: unknown, nameMap: Map<string, string>): ToolCall[] | undefined {
		const calls = (raw as {
			tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
		})?.tool_calls;
		if (!calls || calls.length === 0) return undefined;
		return calls.map((c) => ({
			id: c.id,
			name: nameMap.get(c.function.name) ?? c.function.name,
			arguments: safeJson(c.function.arguments),
		}));
	}

	async function generate(req: GenerateRequest): Promise<GenerateResponse> {
		return withRetry(async () => {
			const wire = buildWireTools(req.tools);
			let res: Response;
			try {
				res = await doFetch(url, {
					method: "POST",
					headers: await authHeaders(),
					body: body(req, false, wire),
					signal: req.signal,
				});
			} catch (e) {
				throw new ProviderError(`Network error: ${(e as Error).message}`, "transient");
			}
			if (!res.ok) throw providerErrorFromStatus(res.status, `Provider returned ${res.status}`);

			let json: Record<string, unknown>;
			try {
				json = (await res.json()) as Record<string, unknown>;
			} catch {
				throw new ProviderError("Malformed provider response", "malformed");
			}
			const choice = (
				json["choices"] as Array<{ message: Record<string, unknown>; finish_reason?: string }>
			)?.[0];
			if (!choice) throw new ProviderError("Provider returned no choices", "malformed");
			const message = choice.message;
			const reasoningModel = modelOf(req.model).supportsReasoning;
			const usage = parseUsage(json["usage"]);
			let toolCalls = parseToolCalls(message, wire.nameMap);

			// Bug 4(b): some reasoning models report `finish_reason: "tool_calls"` from
			// the non-streaming endpoint without a `tool_calls` array. Re-request in
			// streaming mode and assemble them so the agent loop can proceed.
			if ((!toolCalls || toolCalls.length === 0) && choice.finish_reason === "tool_calls") {
				const assembled = await assembleViaStream(req);
				toolCalls = assembled.toolCalls;
				if (!toolCalls || toolCalls.length === 0) {
					throw new ProviderError(
						"Provider signaled tool_calls but returned none (even when streamed)",
						"malformed",
					);
				}
				return {
					text: (message["content"] as string) ?? assembled.text ?? "",
					reasoning: reasoningModel
						? ((message["reasoning"] as string) ?? assembled.reasoning ?? undefined)
						: undefined,
					reasoningOpaque: reasoningModel
						? ((message["reasoning_opaque"] as string) ?? assembled.reasoningOpaque ?? undefined)
						: undefined,
					toolCalls,
					usage: usage ?? assembled.usage,
				};
			}

			return {
				text: (message["content"] as string) ?? "",
				reasoning: reasoningModel ? ((message["reasoning"] as string) ?? undefined) : undefined,
				reasoningOpaque: reasoningModel
					? ((message["reasoning_opaque"] as string) ?? undefined)
					: undefined,
				toolCalls,
				usage,
			};
		}, options.retry);
	}

	/** Drive a streaming request to completion and return its assembled final response. */
	async function assembleViaStream(req: GenerateRequest): Promise<GenerateResponse> {
		let final: GenerateResponse = { text: "" };
		for await (const chunk of generateStream(req)) {
			if (chunk.type === "done") final = chunk.response;
		}
		return final;
	}

	async function* generateStream(req: GenerateRequest): AsyncIterable<GenerateChunk> {
		const wire = buildWireTools(req.tools);
		let res: Response;
		try {
			res = await doFetch(url, {
				method: "POST",
				headers: await authHeaders(),
				body: body(req, true, wire),
				signal: req.signal,
			});
		} catch (e) {
			throw new ProviderError(`Network error: ${(e as Error).message}`, "transient");
		}
		if (!res.ok) throw providerErrorFromStatus(res.status, `Provider returned ${res.status}`);
		if (!res.body) throw new ProviderError("Provider returned no stream body", "malformed");

		const reasoningModel = modelOf(req.model).supportsReasoning;
		const reader = res.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		let text = "";
		let reasoning = "";
		let reasoningOpaque = "";
		// Trailing usage chunk (sent once near the end when `include_usage` is set).
		let usage: { inputTokens?: number; outputTokens?: number } | undefined;
		// Accumulate streamed tool-call fragments keyed by their `index` (which may
		// start at a non-zero value when reasoning deltas occupy the first indices).
		const toolAccum = new Map<number, { id?: string; name?: string; args: string }>();

		for (; ;) {
			const { value, done } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";
			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed.startsWith("data:")) continue;
				const data = trimmed.slice(5).trim();
				if (data === "[DONE]") continue;
				const parsed = safeJson(data) as
					| {
						choices?: Array<{
							delta?: {
								content?: string;
								reasoning?: string;
								reasoning_opaque?: string;
								tool_calls?: Array<{
									index?: number;
									id?: string;
									function?: { name?: string; arguments?: string };
								}>;
							};
						}>;
						usage?: unknown;
					}
					| undefined;
				// The usage chunk arrives with an empty `choices` array, so parse it
				// before bailing on a missing delta.
				const chunkUsage = parseUsage(parsed?.usage);
				if (chunkUsage) usage = chunkUsage;
				const delta = parsed?.choices?.[0]?.delta;
				if (!delta) continue;
				if (delta.content) {
					text += delta.content;
					yield { type: "text", text: delta.content };
				}
				if (delta.reasoning && reasoningModel) {
					reasoning += delta.reasoning;
					yield { type: "reasoning", text: delta.reasoning };
				}
				if (delta.reasoning_opaque && reasoningModel) {
					reasoningOpaque += delta.reasoning_opaque;
				}
				if (delta.tool_calls) {
					for (const frag of delta.tool_calls) {
						const idx = frag.index ?? 0;
						const slot = toolAccum.get(idx) ?? { args: "" };
						if (frag.id) slot.id = frag.id;
						if (frag.function?.name) slot.name = frag.function.name;
						if (frag.function?.arguments) slot.args += frag.function.arguments;
						toolAccum.set(idx, slot);
					}
				}
			}
		}

		// Materialize accumulated tool calls (sorted by stream index) and surface
		// them both as chunks and in the final `done` response.
		const toolCalls: ToolCall[] = [...toolAccum.entries()]
			.sort((a, b) => a[0] - b[0])
			.filter(([, s]) => s.name)
			.map(([idx, s]) => ({
				id: s.id ?? `call_${idx}`,
				name: wire.nameMap.get(s.name as string) ?? (s.name as string),
				arguments: safeJson(s.args) ?? {},
			}));
		for (const toolCall of toolCalls) {
			yield { type: "tool-call", toolCall };
		}
		yield {
			type: "done",
			response: {
				text,
				reasoning: reasoning || undefined,
				reasoningOpaque: reasoningOpaque || undefined,
				toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
				usage,
			},
		};
	}

	return {
		name: "openai-compatible",
		capabilities: defaultModel,
		models,
		model: modelOf,
		generate,
		generateStream,
	};
}

function safeJson(s: string): unknown {
	try {
		return JSON.parse(s);
	} catch {
		return undefined;
	}
}

/**
 * Normalize an OpenAI-style `usage` object (`prompt_tokens` / `completion_tokens`)
 * into the framework's `{ inputTokens, outputTokens }` shape. Returns `undefined`
 * when no usable counts are present so callers can fall back to estimation.
 */
function parseUsage(raw: unknown): { inputTokens?: number; outputTokens?: number } | undefined {
	if (!raw || typeof raw !== "object") return undefined;
	const u = raw as { prompt_tokens?: unknown; completion_tokens?: unknown };
	const inputTokens = typeof u.prompt_tokens === "number" ? u.prompt_tokens : undefined;
	const outputTokens = typeof u.completion_tokens === "number" ? u.completion_tokens : undefined;
	if (inputTokens === undefined && outputTokens === undefined) return undefined;
	return { inputTokens, outputTokens };
}
