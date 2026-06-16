/**
 * The agent run loop: drives provider calls, executes requested tool calls,
 * feeds typed results (including errors, for self-correction) back to the model,
 * and stops on a final answer, the iteration cap, or an abort. (FR-011a, FR-012b)
 *
 * @packageDocumentation
 */

import type { Message } from "../core/types.js";
import { textMessage } from "../core/types.js";
import type { GenerateRequest, GenerateResponse } from "../providers/provider.js";
import type { ToolRegistry } from "../tools/registry.js";

/** Outcome status of a run. */
export type RunStatus = "completed" | "failed" | "incomplete" | "limit-exceeded";

/** A function that produces a model response (optionally through middleware). */
export type GenerateFn = (req: GenerateRequest) => Promise<GenerateResponse>;

/** Settings controlling the loop. */
export interface LoopOptions {
	/** Maximum iterations; -1 means unlimited. Default 10. (FR-012b) */
	maxIterations?: number;
	/** Per-tool-call timeout in ms. (FR-012c) */
	toolTimeoutMs?: number;
	/** Abort signal. */
	signal?: AbortSignal;
}

/** Result of running the loop. */
export interface LoopResult {
	messages: Message[];
	final: GenerateResponse;
	status: RunStatus;
}

/**
 * Execute the tool-call loop against a generate function and tool registry.
 *
 * @param generate - Produces a model response (typically the middleware pipeline).
 * @param registry - Tools available to the agent (may be empty).
 * @param messages - Initial conversation (system + user, etc.).
 * @param options - Loop tuning.
 */
export async function runLoop(
	generate: GenerateFn,
	registry: ToolRegistry,
	messages: Message[],
	options?: LoopOptions,
): Promise<LoopResult> {
	const maxIterations = options?.maxIterations ?? 10;
	const working = [...messages];
	let iteration = 0;

	for (; ;) {
		if (maxIterations !== -1 && iteration >= maxIterations) {
			return {
				messages: working,
				final: { text: "" },
				status: "limit-exceeded",
			};
		}
		iteration++;

		const specs = registry.specs();
		const response = await generate({
			messages: working,
			tools: specs.length > 0 ? specs : undefined,
			signal: options?.signal,
		});

		if (!response.toolCalls || response.toolCalls.length === 0) {
			return { messages: working, final: response, status: "completed" };
		}

		// Record the assistant's tool-call turn.
		working.push({
			role: "assistant",
			parts: response.text ? [{ type: "text", text: response.text }] : [],
		});

		// Execute each requested tool and feed results (or typed errors) back.
		for (const call of response.toolCalls) {
			const result = await registry.invoke(call.name, call.arguments, options?.toolTimeoutMs);
			const payload = result.error
				? `ERROR (${result.error.reason}): ${result.error.message}`
				: JSON.stringify(result.value ?? null);
			working.push({
				role: "tool",
				name: call.name,
				toolCallId: call.id,
				parts: [{ type: "text", text: payload }],
			});
		}
	}
}

/** Build the initial message list from instructions + input. */
export function buildMessages(instructions: string, input: Message[]): Message[] {
	return [textMessage("system", instructions), ...input];
}
