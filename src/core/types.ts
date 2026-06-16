/**
 * Shared content, message, and model-capability types used across the framework.
 *
 * These are the lowest-level building blocks: every higher-level module (agents,
 * providers, tools, workflows) speaks in terms of {@link Message} and
 * {@link ContentPart}. Keeping them dependency-free keeps the core tree-shakeable.
 *
 * @packageDocumentation
 */

/** A JSON Schema object (draft 2020-12 compatible), as popularized by MCP. */
export type JSONSchema = Record<string, unknown>;

/** Role of a message in a conversation. */
export type Role = "system" | "user" | "assistant" | "tool";

/** A single piece of message content. Images are only valid for vision-capable models. */
export type ContentPart =
	| { type: "text"; text: string }
	| { type: "image"; data: string; mimeType: string };

/**
 * A tool call recorded on an assistant message. Round-tripped to providers that
 * require the assistant turn to declare its `tool_calls` (e.g. Anthropic via
 * Copilot) so the following `tool` results have a matching `tool_use`. (FR-012)
 */
export interface MessageToolCall {
	/** Provider-assigned call id, linking the assistant call to its tool result. */
	id: string;
	/** Namespaced tool name (registry key). */
	name: string;
	/** Raw JSON arguments the model supplied. */
	arguments: unknown;
}

/**
 * A conversation message.
 *
 * @example
 * ```ts
 * const msg: Message = { role: "user", parts: [{ type: "text", text: "Hi" }] };
 * ```
 */
export interface Message {
	role: Role;
	parts: ContentPart[];
	/** Optional tool-call linkage for assistant/tool messages. */
	toolCallId?: string;
	/** Optional display name (e.g., the tool name for a tool message). */
	name?: string;
	/**
	 * Tool calls requested by an assistant turn. Persisted so providers that
	 * require it (e.g. Anthropic) receive `tool_calls` paired with the tool results.
	 */
	toolCalls?: MessageToolCall[];
	/**
	 * Opaque reasoning blob carried across turns for thinking-capable models, so
	 * reasoning continuity is preserved without exposing the contents. (FR-003a)
	 */
	reasoningOpaque?: string;
}

/**
 * Per-model capabilities supplied by the caller. The framework cannot reliably
 * discover these for arbitrary OpenAI-compatible/LM Studio models, so they are
 * provided explicitly. (FR-007a)
 */
export interface ModelCapabilities {
	/** Model id/name. */
	model: string;
	/** Maximum input/context tokens; drives compaction threshold. */
	maxInputTokens: number;
	/** Maximum output tokens. */
	maxOutputTokens: number;
	/** Whether the model accepts image input. Defaults to false. */
	supportsVision?: boolean;
	/** Whether the model emits separate reasoning/thinking content. Defaults to false. */
	supportsReasoning?: boolean;
}

/** Convenience: build a user message from a plain string. */
export function textMessage(role: Role, text: string): Message {
	return { role, parts: [{ type: "text", text }] };
}

/** Returns true if a message contains any image content part. */
export function hasImage(message: Message): boolean {
	return message.parts.some((p) => p.type === "image");
}

/** Extract the concatenated text from a message. */
export function messageText(message: Message): string {
	return message.parts
		.filter((p): p is { type: "text"; text: string } => p.type === "text")
		.map((p) => p.text)
		.join("");
}
