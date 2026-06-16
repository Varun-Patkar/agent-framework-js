# Contract: Agent

Maps to FR-001, FR-002, FR-003, FR-003a, FR-003b, FR-004, FR-004a, FR-004b, FR-012b, FR-012c.

```ts
export interface AgentConfig {
	name: string;
	instructions: string;
	provider: Provider;
	tools?: Tool[];
	skills?: Skill[];
	maxIterations?: number; // default safe; -1 = unlimited (FR-012b)
	toolTimeoutMs?: number; // per-tool-call timeout (FR-012c)
	compactionThreshold?: number; // fraction of maxInputTokens, default 0.9 (FR-004a)
	compactionModel?: Provider; // optional override (FR-004b)
}

export interface RunOptions {
	thread?: Thread; // continue an existing conversation (FR-004)
	stream?: boolean; // incremental output (FR-003)
	signal?: AbortSignal;
}

export interface RunResult {
	output: string;
	reasoning?: string; // only for reasoning-capable models (FR-003a)
	status: "completed" | "failed" | "incomplete" | "limit-exceeded";
	partial: boolean; // true if interrupted mid-stream (FR-003b)
	error?: TypedError;
}

export type AgentInput = string | Message | Message[]; // text or multimodal (FR-002)

export interface Agent {
	run(input: AgentInput, opts?: RunOptions): Promise<RunResult>;
	runStream(input: AgentInput, opts?: RunOptions): AsyncIterable<RunChunk>; // FR-003
}

export function createAgent(config: AgentConfig): Agent;
```

**Contract rules**

- Image parts in `input` are rejected with a typed error when `provider.capabilities.supportsVision`
  is false (FR-002).
- Streaming yields text and (when applicable) reasoning chunks distinctly (FR-003a).
- Exceeding `maxIterations` returns `status: "limit-exceeded"` (FR-012b).
- A tool call exceeding `toolTimeoutMs` yields a typed `ToolError` timeout for that call (FR-012c).
- When the thread reaches `compactionThreshold × maxInputTokens`, prior turns are summarized before
  the next provider call (FR-004a/004b).

**Contract tests**

- run returns text for a stubbed provider; reasoning present only when `supportsReasoning`.
- image input + non-vision model → typed error.
- iteration cap reached → `limit-exceeded`.
- compaction triggers at threshold (summarization model invoked).
