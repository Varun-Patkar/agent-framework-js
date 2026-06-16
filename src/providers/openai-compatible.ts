/**
 * OpenAI-compatible provider. Targets any endpoint speaking the OpenAI
 * `/chat/completions` API, including local servers such as LM Studio via a custom
 * `baseUrl`. (FR-006)
 *
 * @packageDocumentation
 */

import type { Message, ContentPart } from "../core/types.js";
import { ProviderError } from "../core/errors.js";
import type {
	Provider,
	CredentialSource,
	GenerateRequest,
	GenerateResponse,
	GenerateChunk,
	ToolCall,
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

function toOpenAIMessages(messages: Message[]): OpenAIMessage[] {
	return messages.map((m) => {
		const msg: OpenAIMessage = { role: m.role, content: toOpenAIContent(m.parts) };
		if (m.toolCallId) msg.tool_call_id = m.toolCallId;
		if (m.name) msg.name = m.name;
		return msg;
	});
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
		const headers: Record<string, string> = { "content-type": "application/json" };
		if (cred) headers["authorization"] = `Bearer ${cred}`;
		return headers;
	}

	function body(req: GenerateRequest, stream: boolean): string {
		return JSON.stringify({
			model: modelOf(req.model).model,
			messages: toOpenAIMessages(req.messages),
			stream,
			...(req.tools && req.tools.length > 0
				? {
					tools: req.tools.map((t) => ({
						type: "function",
						function: { name: t.name, description: t.description, parameters: t.inputSchema },
					})),
				}
				: {}),
		});
	}

	function parseToolCalls(raw: unknown): ToolCall[] | undefined {
		const calls = (raw as { tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> })
			?.tool_calls;
		if (!calls || calls.length === 0) return undefined;
		return calls.map((c) => ({
			id: c.id,
			name: c.function.name,
			arguments: safeJson(c.function.arguments),
		}));
	}

	async function generate(req: GenerateRequest): Promise<GenerateResponse> {
		return withRetry(async () => {
			let res: Response;
			try {
				res = await doFetch(url, {
					method: "POST",
					headers: await authHeaders(),
					body: body(req, false),
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
			const choice = (json["choices"] as Array<{ message: Record<string, unknown> }>)?.[0];
			if (!choice) throw new ProviderError("Provider returned no choices", "malformed");
			const message = choice.message;
			return {
				text: (message["content"] as string) ?? "",
				reasoning: modelOf(req.model).supportsReasoning
					? ((message["reasoning"] as string) ?? undefined)
					: undefined,
				toolCalls: parseToolCalls(message),
			};
		}, options.retry);
	}

	async function* generateStream(req: GenerateRequest): AsyncIterable<GenerateChunk> {
		let res: Response;
		try {
			res = await doFetch(url, {
				method: "POST",
				headers: await authHeaders(),
				body: body(req, true),
				signal: req.signal,
			});
		} catch (e) {
			throw new ProviderError(`Network error: ${(e as Error).message}`, "transient");
		}
		if (!res.ok) throw providerErrorFromStatus(res.status, `Provider returned ${res.status}`);
		if (!res.body) throw new ProviderError("Provider returned no stream body", "malformed");

		const reader = res.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		let text = "";
		let reasoning = "";

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
					| { choices?: Array<{ delta?: { content?: string; reasoning?: string } }> }
					| undefined;
				const delta = parsed?.choices?.[0]?.delta;
				if (delta?.content) {
					text += delta.content;
					yield { type: "text", text: delta.content };
				}
				if (delta?.reasoning && modelOf(req.model).supportsReasoning) {
					reasoning += delta.reasoning;
					yield { type: "reasoning", text: delta.reasoning };
				}
			}
		}
		yield {
			type: "done",
			response: { text, reasoning: reasoning || undefined },
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
