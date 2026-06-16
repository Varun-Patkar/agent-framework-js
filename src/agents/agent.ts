/**
 * The agent: a configured actor that runs against a provider, optionally using
 * tools and skills, with streaming, reasoning output, multimodal input gating,
 * conversation threads with compaction, and a middleware pipeline.
 *
 * @packageDocumentation
 */

import type { Message, ContentPart } from "../core/types.js";
import { hasImage, textMessage } from "../core/types.js";
import { ProviderError } from "../core/errors.js";
import type { Provider, GenerateResponse, GenerateRequest } from "../providers/provider.js";
import { ToolRegistry } from "../tools/registry.js";
import type { Tool } from "../tools/tool.js";
import type { Skill } from "../skills/skill.js";
import { SkillIndex } from "../skills/index.js";
import type { Middleware, MiddlewareContext } from "../middleware/middleware.js";
import { composeMiddleware } from "../middleware/middleware.js";
import { Thread, type ThreadOptions } from "./thread.js";
import { runLoop, type RunStatus } from "./loop.js";

/** Configuration for {@link createAgent}. */
export interface AgentConfig {
	name: string;
	instructions: string;
	provider: Provider;
	/** Which of the provider's models to use; defaults to the provider's default model. */
	model?: string;
	tools?: Tool[];
	skills?: Skill[];
	/** Max tool-call iterations per run; -1 = unlimited. Default 10. (FR-012b) */
	maxIterations?: number;
	/** Per-tool-call timeout in ms. (FR-012c) */
	toolTimeoutMs?: number;
	/** Compaction threshold as a fraction of maxInputTokens. Default 0.9. (FR-004a) */
	compactionThreshold?: number;
	/** Optional override model for compaction summaries. (FR-004b) */
	compactionModel?: Provider;
	/** Middleware applied around provider calls. (FR-023) */
	middleware?: Middleware[];
}

/** Options for a single run. */
export interface RunOptions {
	/** Continue an existing conversation. (FR-004) */
	thread?: Thread;
	/** Abort signal. */
	signal?: AbortSignal;
}

/** The result of a non-streaming run. */
export interface RunResult {
	output: string;
	/** Reasoning content — only for reasoning-capable models. (FR-003a) */
	reasoning?: string;
	status: RunStatus;
	/** True when the run was interrupted before completing. (FR-003b) */
	partial: boolean;
	error?: ProviderError;
	/** The thread used/updated by this run. */
	thread: Thread;
}

/** Streamed run chunk. */
export type RunChunk =
	| { type: "text"; text: string }
	| { type: "reasoning"; text: string }
	| { type: "done"; result: RunResult };

/** Agent input: plain text or structured (multimodal) messages. (FR-002) */
export type AgentInput = string | Message | Message[];

/** A runnable agent. */
export interface Agent {
	readonly name: string;
	run(input: AgentInput, opts?: RunOptions): Promise<RunResult>;
	runStream(input: AgentInput, opts?: RunOptions): AsyncIterable<RunChunk>;
}

function normalizeInput(input: AgentInput): Message[] {
	if (typeof input === "string") return [textMessage("user", input)];
	return Array.isArray(input) ? input : [input];
}

function promptText(messages: Message[]): string {
	return messages
		.flatMap((m) => m.parts)
		.filter((p): p is { type: "text"; text: string } => p.type === "text")
		.map((p) => p.text)
		.join(" ");
}

/**
 * Create an agent.
 *
 * @example
 * ```ts
 * const agent = createAgent({ name: "Helper", instructions: "Be concise.", provider });
 * const res = await agent.run("Say hello.");
 * console.log(res.status, res.output);
 * ```
 */
export function createAgent(config: AgentConfig): Agent {
	const registry = new ToolRegistry(config.tools ?? []);
	const skillIndex = new SkillIndex(config.skills ?? []);
	const middleware = config.middleware ?? [];
	/** Capabilities of the model this agent uses (selected from the provider). */
	const modelCaps = () => config.provider.model(config.model);

	function gateVision(messages: Message[]): void {
		if (!modelCaps().supportsVision && messages.some(hasImage)) {
			throw new ProviderError(
				"Image input was provided but the configured model does not support vision",
				"client",
			);
		}
	}

	async function injectSkills(userMessages: Message[]): Promise<Message[]> {
		if ((config.skills ?? []).length === 0) return userMessages;
		const selected = skillIndex.select(promptText(userMessages));
		if (selected.length === 0) return userMessages;
		const contents = await Promise.all(selected.map((s) => skillIndex.load(s)));
		const skillBlock = textMessage(
			"system",
			`Relevant skill knowledge:\n${contents.join("\n\n")}`,
		);
		return [skillBlock, ...userMessages];
	}

	async function callProvider(req: GenerateRequest): Promise<GenerateResponse> {
		const ctx: MiddlewareContext = {
			agentName: config.name,
			request: { ...req, model: req.model ?? config.model },
		};
		const pipeline = composeMiddleware(middleware, (c) => config.provider.generate(c.request));
		return pipeline(ctx);
	}

	async function prepare(input: AgentInput, opts?: RunOptions): Promise<Thread> {
		const userMessages = normalizeInput(input);
		gateVision(userMessages);
		const thread =
			opts?.thread ??
			new Thread(undefined, [textMessage("system", config.instructions)]);
		const withSkills = await injectSkills(userMessages);
		for (const m of withSkills) thread.add(m);
		await thread.maybeCompact(config.provider, {
			compactionThreshold: config.compactionThreshold,
			compactionModel: config.compactionModel,
			modelCapabilities: modelCaps(),
		} satisfies ThreadOptions);
		return thread;
	}

	async function run(input: AgentInput, opts?: RunOptions): Promise<RunResult> {
		let thread: Thread;
		try {
			thread = await prepare(input, opts);
		} catch (e) {
			if (e instanceof ProviderError) {
				return { output: "", status: "failed", partial: false, error: e, thread: opts?.thread ?? new Thread() };
			}
			throw e;
		}

		try {
			const loop = await runLoop(callProvider, registry, thread.messages, {
				maxIterations: config.maxIterations,
				toolTimeoutMs: config.toolTimeoutMs,
				signal: opts?.signal,
			});
			if (loop.final.text) {
				thread.add({ role: "assistant", parts: [{ type: "text", text: loop.final.text }] });
			}
			return {
				output: loop.final.text,
				reasoning: modelCaps().supportsReasoning ? loop.final.reasoning : undefined,
				status: loop.status,
				partial: loop.status === "incomplete",
				thread,
			};
		} catch (e) {
			if (e instanceof ProviderError) {
				return { output: "", status: "failed", partial: false, error: e, thread };
			}
			throw e;
		}
	}

	async function* runStream(input: AgentInput, opts?: RunOptions): AsyncIterable<RunChunk> {
		// Streaming path: single provider streaming call (tool loops use non-streaming
		// internally). Suitable for the common single-turn streaming case.
		let thread: Thread;
		try {
			thread = await prepare(input, opts);
		} catch (e) {
			if (e instanceof ProviderError) {
				yield { type: "done", result: { output: "", status: "failed", partial: false, error: e, thread: opts?.thread ?? new Thread() } };
				return;
			}
			throw e;
		}

		let text = "";
		let reasoning = "";
		try {
			for await (const chunk of config.provider.generateStream({
				messages: thread.messages,
				tools: registry.specs(),
				model: config.model,
				signal: opts?.signal,
			})) {
				if (chunk.type === "text") {
					text += chunk.text;
					yield { type: "text", text: chunk.text };
				} else if (chunk.type === "reasoning" && modelCaps().supportsReasoning) {
					reasoning += chunk.text;
					yield { type: "reasoning", text: chunk.text };
				} else if (chunk.type === "done") {
					text = chunk.response.text || text;
					reasoning = chunk.response.reasoning || reasoning;
				}
			}
		} catch (e) {
			const error = e instanceof ProviderError ? e : new ProviderError((e as Error).message, "transient");
			yield {
				type: "done",
				result: { output: text, status: "incomplete", partial: true, error, thread },
			};
			return;
		}

		if (text) thread.add({ role: "assistant", parts: [{ type: "text", text }] });
		yield {
			type: "done",
			result: {
				output: text,
				reasoning: modelCaps().supportsReasoning ? reasoning || undefined : undefined,
				status: "completed",
				partial: false,
				thread,
			},
		};
	}

	return { name: config.name, run, runStream };
}

export type { ContentPart };
