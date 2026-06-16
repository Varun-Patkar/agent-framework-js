/**
 * The workflow engine: composes agents under an orchestration pattern with a
 * completion signal and a configurable max-rounds safety cap, bounded concurrency,
 * a failure policy, streaming, human-in-the-loop yield/resume, and checkpointing.
 * (FR-018, FR-019, FR-019a, FR-019b, FR-019c, FR-020, FR-021, FR-021a, FR-021b, FR-022)
 *
 * @packageDocumentation
 */

import type { Agent } from "../agents/agent.js";
import type { FailurePolicy } from "./concurrency.js";
import {
	stepSequential,
	stepConcurrent,
	stepHandoff,
	stepGroup,
	type WorkflowPattern,
	type WorkflowContext,
	type PatternHooks,
} from "./patterns.js";
import { createCheckpoint, restoreCheckpoint, type Checkpoint } from "./checkpoint.js";

/** Lifecycle status of a workflow run, observable by the host. (FR-021b) */
export type WorkflowStatus = "running" | "awaiting-input" | "completed" | "failed";

/** Configuration for {@link createWorkflow}. */
export interface WorkflowConfig {
	pattern: WorkflowPattern;
	agents: Agent[];
	/** Max rounds; -1 = unlimited. Default 16. (FR-019a) */
	maxRounds?: number;
	/** Concurrent failure policy. Default fail-soft. (FR-019b) */
	failurePolicy?: FailurePolicy;
	/** Max parallel agent calls; -1 = unlimited. Default 4. (FR-019c) */
	maxConcurrency?: number;
	/** Completion signal: end the workflow when this returns true. (FR-019a) */
	isComplete?: (output: string, ctx: WorkflowContext) => boolean;
	/** Handoff target selector. */
	selectNext?: (output: string, ctx: WorkflowContext) => string | null;
	/** Human-in-the-loop gate: when it returns a prompt, the workflow yields. (FR-021) */
	humanInputGate?: (ctx: WorkflowContext) => string | null;
}

/** Serializable result/handle of a workflow run. (FR-021a, FR-022) */
export interface WorkflowState {
	status: WorkflowStatus;
	output: string;
	/** Present when status is `awaiting-input`. */
	awaiting?: { prompt: string };
	/** Error message when status is `failed`. */
	error?: string;
	/** Snapshot enabling resume. */
	checkpoint: Checkpoint;
}

/** Streamed workflow event. (FR-020) */
export type WorkflowEvent =
	| { type: "round"; round: number; output: string }
	| { type: "awaiting-input"; prompt: string; state: WorkflowState }
	| { type: "done"; state: WorkflowState };

/** A runnable multi-agent workflow. */
export interface Workflow {
	run(input: string): Promise<WorkflowState>;
	runStream(input: string): AsyncIterable<WorkflowEvent>;
	resume(state: WorkflowState, humanInput?: string): Promise<WorkflowState>;
	status(): WorkflowStatus;
}

function freshContext(input: string): WorkflowContext {
	return { output: input, outputs: {}, round: 0, cursor: 0, errors: {} };
}

function contextFromCheckpoint(cp: Checkpoint): WorkflowContext {
	const s = cp.state as Partial<WorkflowContext>;
	return {
		output: s.output ?? "",
		outputs: s.outputs ?? {},
		round: s.round ?? 0,
		cursor: s.cursor ?? 0,
		errors: s.errors ?? {},
	};
}

/**
 * Create a workflow.
 *
 * @example
 * ```ts
 * const wf = createWorkflow({ pattern: "sequential", agents: [researcher, summarizer] });
 * let state = await wf.run("Summarize the notes.");
 * if (state.status === "awaiting-input") state = await wf.resume(state, "approved");
 * ```
 */
export function createWorkflow(config: WorkflowConfig): Workflow {
	const maxRounds = config.maxRounds ?? 16;
	const id = `wf-${Math.random().toString(36).slice(2)}`;
	let currentStatus: WorkflowStatus = "running";

	const hooks: PatternHooks = {
		isComplete: config.isComplete,
		selectNext: config.selectNext,
		maxConcurrency: config.maxConcurrency,
		failurePolicy: config.failurePolicy,
	};

	async function stepOnce(ctx: WorkflowContext, input: string): Promise<boolean> {
		switch (config.pattern) {
			case "sequential":
				return (await stepSequential(config.agents, ctx, input, hooks)).complete;
			case "concurrent":
				return (await stepConcurrent(config.agents, ctx, input, hooks)).complete;
			case "handoff":
				return (await stepHandoff(config.agents, ctx, input, hooks)).complete;
			case "group":
				return (await stepGroup(config.agents, ctx, input, hooks)).complete;
		}
	}

	function snapshot(ctx: WorkflowContext): Checkpoint {
		return createCheckpoint(id, { ...ctx });
	}

	async function drive(ctx: WorkflowContext, input: string): Promise<WorkflowState> {
		try {
			for (; ;) {
				// Human-in-the-loop: yield a serializable awaiting-input state. (FR-021a)
				const prompt = config.humanInputGate?.(ctx);
				if (prompt) {
					currentStatus = "awaiting-input";
					return { status: currentStatus, output: ctx.output, awaiting: { prompt }, checkpoint: snapshot(ctx) };
				}

				const complete = await stepOnce(ctx, input);
				ctx.round++;

				if (complete) {
					currentStatus = "completed";
					return { status: currentStatus, output: ctx.output, checkpoint: snapshot(ctx) };
				}
				if (maxRounds !== -1 && ctx.round >= maxRounds) {
					currentStatus = "completed";
					return { status: currentStatus, output: ctx.output, checkpoint: snapshot(ctx) };
				}
			}
		} catch (e) {
			currentStatus = "failed";
			return {
				status: currentStatus,
				output: ctx.output,
				error: (e as Error).message,
				checkpoint: snapshot(ctx),
			};
		}
	}

	async function run(input: string): Promise<WorkflowState> {
		currentStatus = "running";
		return drive(freshContext(input), input);
	}

	async function* runStream(input: string): AsyncIterable<WorkflowEvent> {
		currentStatus = "running";
		const ctx = freshContext(input);
		for (; ;) {
			const prompt = config.humanInputGate?.(ctx);
			if (prompt) {
				currentStatus = "awaiting-input";
				const state: WorkflowState = {
					status: currentStatus,
					output: ctx.output,
					awaiting: { prompt },
					checkpoint: snapshot(ctx),
				};
				yield { type: "awaiting-input", prompt, state };
				return;
			}
			let complete: boolean;
			try {
				complete = await stepOnce(ctx, input);
			} catch (e) {
				currentStatus = "failed";
				yield {
					type: "done",
					state: { status: "failed", output: ctx.output, error: (e as Error).message, checkpoint: snapshot(ctx) },
				};
				return;
			}
			ctx.round++;
			yield { type: "round", round: ctx.round, output: ctx.output };
			if (complete || (maxRounds !== -1 && ctx.round >= maxRounds)) {
				currentStatus = "completed";
				yield { type: "done", state: { status: "completed", output: ctx.output, checkpoint: snapshot(ctx) } };
				return;
			}
		}
	}

	async function resume(state: WorkflowState, humanInput?: string): Promise<WorkflowState> {
		// Fail-closed restore of the checkpoint. (FR-022a)
		const cp = restoreCheckpoint(state.checkpoint);
		const ctx = contextFromCheckpoint(cp);
		if (humanInput !== undefined) {
			ctx.output = humanInput;
			ctx.outputs["__human__"] = humanInput;
		}
		currentStatus = "running";
		return drive(ctx, ctx.output);
	}

	return { run, runStream, resume, status: () => currentStatus };
}
