# Contract: Workflow

Maps to FR-018, FR-019, FR-019a, FR-019b, FR-019c, FR-020, FR-021, FR-021a, FR-021b, FR-022, FR-022a.

```ts
export type WorkflowPattern = "sequential" | "concurrent" | "handoff" | "group";

export interface WorkflowConfig {
	pattern: WorkflowPattern; // (FR-019)
	agents: Agent[];
	maxRounds?: number; // default safe; -1 = unlimited (FR-019a)
	failurePolicy?: "fail-soft" | "fail-fast"; // default fail-soft (FR-019b)
	maxConcurrency?: number; // default safe; -1 = unlimited (FR-019c)
}

export type WorkflowStatus =
	| "running"
	| "awaiting-input"
	| "completed"
	| "failed";

export interface WorkflowState {
	// serializable (FR-021a/022)
	status: WorkflowStatus;
	awaiting?: { prompt: string }; // present when awaiting-input
	checkpoint: Checkpoint;
}

export interface Workflow {
	run(input: AgentInput): Promise<WorkflowState>;
	runStream(input: AgentInput): AsyncIterable<WorkflowEvent>; // streaming (FR-020)
	resume(state: WorkflowState, humanInput?: AgentInput): Promise<WorkflowState>; // HITL (FR-021a)
	status(): WorkflowStatus; // observable by host (FR-021b)
}

export function createWorkflow(config: WorkflowConfig): Workflow;
export function restoreCheckpoint(cp: Checkpoint): WorkflowState; // fail-closed (FR-022a)
```

**Contract rules**

- The workflow ends on an explicit completion signal OR when `maxRounds` is reached, whichever first
  (FR-019a).
- Concurrent branch failure follows `failurePolicy`: fail-soft aggregates partial results (default);
  fail-fast cancels remaining branches and errors (FR-019b).
- Parallel agent/tool execution is bounded by `maxConcurrency` (FR-019c).
- A human-in-the-loop point yields a serializable `awaiting-input` state; the host calls `resume`
  with input (FR-021a). Status is queryable throughout (FR-021b).
- `restoreCheckpoint` fails closed with a typed `CheckpointError` (corrupt vs. version-mismatch); no
  partial restore (FR-022a).

**Contract tests**

- sequential passes output A→B; concurrent aggregates; handoff transfers control; group collaborates.
- fail-soft vs fail-fast behavior on a failing branch.
- awaiting-input → resume continues; checkpoint resume reproduces deterministic outcome (SC-008).
- corrupt/version-mismatch checkpoint → typed error, no run.
