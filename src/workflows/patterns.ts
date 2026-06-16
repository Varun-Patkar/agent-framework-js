/**
 * Orchestration patterns: sequential, concurrent, handoff, and group collaboration.
 * Each pattern advances a {@link WorkflowContext} by one round and reports whether
 * the workflow is complete. (FR-019)
 *
 * @packageDocumentation
 */

import type { Agent } from "../agents/agent.js";
import { runBounded, type FailurePolicy } from "./concurrency.js";

/** Supported orchestration patterns. */
export type WorkflowPattern = "sequential" | "concurrent" | "handoff" | "group";

/** Mutable state threaded through pattern execution. */
export interface WorkflowContext {
	/** Latest combined output. */
	output: string;
	/** Per-agent latest outputs (by agent name). */
	outputs: Record<string, string>;
	/** Current round (0-based). */
	round: number;
	/** Index of the next agent (handoff/sequential). */
	cursor: number;
	/** Names of agents that errored this run (fail-soft). */
	errors: Record<string, string>;
}

/** Hooks customizing pattern behavior. */
export interface PatternHooks {
	/** Returns true when an output signals the workflow is complete. (FR-019a) */
	isComplete?: (output: string, ctx: WorkflowContext) => boolean;
	/** For handoff: choose the next agent name from the latest output (or null to stop). */
	selectNext?: (output: string, ctx: WorkflowContext) => string | null;
	maxConcurrency?: number;
	failurePolicy?: FailurePolicy;
}

/** One step's result. */
export interface StepResult {
	complete: boolean;
}

async function invoke(agent: Agent, input: string, ctx: WorkflowContext): Promise<string> {
	const res = await agent.run(input);
	if (res.error || res.status === "failed") {
		ctx.errors[agent.name] = res.error?.message ?? "failed";
		throw res.error ?? new Error(`Agent ${agent.name} failed`);
	}
	ctx.outputs[agent.name] = res.output;
	return res.output;
}

/** Advance a sequential workflow by one agent. */
export async function stepSequential(
	agents: Agent[],
	ctx: WorkflowContext,
	input: string,
	hooks: PatternHooks,
): Promise<StepResult> {
	const agent = agents[ctx.cursor];
	if (!agent) return { complete: true };
	const feed = ctx.cursor === 0 ? input : ctx.output;
	ctx.output = await invoke(agent, feed, ctx);
	ctx.cursor++;
	const done = ctx.cursor >= agents.length || !!hooks.isComplete?.(ctx.output, ctx);
	return { complete: done };
}

/** Run all agents concurrently on the same input and aggregate outputs. */
export async function stepConcurrent(
	agents: Agent[],
	ctx: WorkflowContext,
	input: string,
	hooks: PatternHooks,
): Promise<StepResult> {
	const results = await runBounded(
		agents.map((a) => () => invoke(a, input, ctx)),
		hooks.maxConcurrency ?? 4,
		hooks.failurePolicy ?? "fail-soft",
	);
	const outputs = results.filter((r) => r.value !== undefined).map((r) => r.value as string);
	ctx.output = outputs.join("\n\n");
	return { complete: true };
}

/** Advance a handoff workflow: the current agent may delegate to another. */
export async function stepHandoff(
	agents: Agent[],
	ctx: WorkflowContext,
	input: string,
	hooks: PatternHooks,
): Promise<StepResult> {
	const agent = agents[ctx.cursor];
	if (!agent) return { complete: true };
	const feed = ctx.round === 0 ? input : ctx.output;
	ctx.output = await invoke(agent, feed, ctx);

	if (hooks.isComplete?.(ctx.output, ctx)) return { complete: true };
	const nextName = hooks.selectNext?.(ctx.output, ctx) ?? null;
	if (!nextName) return { complete: true };
	const idx = agents.findIndex((a) => a.name === nextName);
	if (idx < 0) return { complete: true };
	ctx.cursor = idx;
	return { complete: false };
}

/** Group collaboration: every agent contributes each round until complete. */
export async function stepGroup(
	agents: Agent[],
	ctx: WorkflowContext,
	input: string,
	hooks: PatternHooks,
): Promise<StepResult> {
	let combined = ctx.round === 0 ? input : ctx.output;
	for (const agent of agents) {
		combined = await invoke(agent, combined, ctx);
		if (hooks.isComplete?.(combined, ctx)) {
			ctx.output = combined;
			return { complete: true };
		}
	}
	ctx.output = combined;
	return { complete: false };
}
