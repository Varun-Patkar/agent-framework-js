# Phase 1 Data Model: JavaScript Agent Framework

Conceptual entities, their fields, relationships, validation rules, and state transitions. Types are
TypeScript-flavored for clarity; the published API emits real `.d.ts`.

## Entity: ModelCapabilities

Per-model configuration supplied by the caller (FR-007a).

| Field               | Type    | Rules                                          |
| ------------------- | ------- | ---------------------------------------------- |
| `model`             | string  | required; model id/name                        |
| `maxInputTokens`    | number  | required; > 0; drives compaction threshold     |
| `maxOutputTokens`   | number  | required; > 0                                  |
| `supportsVision`    | boolean | default false; gates image input (FR-002)      |
| `supportsReasoning` | boolean | default false; gates reasoning field (FR-003a) |

## Entity: Provider

Abstraction over an LLM backend (FR-005/006/007).

| Field           | Type                            | Rules                                                            |
| --------------- | ------------------------------- | ---------------------------------------------------------------- |
| `name`          | string                          | required; e.g., `copilot`, `openai-compatible`                   |
| `capabilities`  | ModelCapabilities               | required                                                         |
| `getCredential` | () => string \| Promise<string> | caller-supplied callback; never persisted/logged (FR-005a)       |
| `baseUrl`       | string                          | required for OpenAI-compatible (LM Studio); optional for Copilot |
| `maxRetries`    | number                          | default safe value; transient-retry bound (FR-008a)              |

**Relationships**: An Agent has exactly one Provider. Compaction may use a separate override Provider
(FR-004b).

## Entity: ContentPart / Message

Agent I/O unit (FR-002).

| Field   | Type                                          | Rules                                                                       |
| ------- | --------------------------------------------- | --------------------------------------------------------------------------- |
| `role`  | `"system" \| "user" \| "assistant" \| "tool"` | required                                                                    |
| `parts` | ContentPart[]                                 | each part is text or image; image only if `supportsVision` else typed error |

`ContentPart = { type: "text"; text: string } | { type: "image"; data: string \| URL; mimeType: string }`

## Entity: Tool

Callable capability, local or MCP-provided (FR-009/014a).

| Field          | Type                       | Rules                                                     |
| -------------- | -------------------------- | --------------------------------------------------------- |
| `name`         | string                     | required; addressed namespaced as `source.name` (FR-014a) |
| `description`  | string                     | required; used by the model to decide invocation          |
| `inputSchema`  | JSONSchema                 | required; validates arguments (FR-011)                    |
| `outputSchema` | JSONSchema                 | optional; describes result                                |
| `source`       | `"local" \| string`        | `local` or MCP server id                                  |
| `enabled`      | boolean                    | default true; toggle per tool/server (FR-012a)            |
| `run`          | (args) => Promise<unknown> | required for local tools                                  |

**State**: enabled → disabled (not presented to agent) → enabled.

## Entity: MCPConnection

Link to an MCP server (FR-013).

| Field              | Type                  | Rules                                                         |
| ------------------ | --------------------- | ------------------------------------------------------------- |
| `id`               | string                | required; namespace prefix for its tools                      |
| `transport`        | `"remote" \| "stdio"` | remote everywhere; stdio only where spawn permitted (FR-013b) |
| `url`              | string                | required when remote                                          |
| `command` / `args` | string / string[]     | required when stdio                                           |
| `enabled`          | boolean               | default true (FR-012a)                                        |

**State**: connecting → connected → (unavailable → typed error, FR-015) ; stdio in non-spawn runtime
→ typed "unsupported in this runtime" error (FR-030a).

## Entity: Skill

Domain knowledge bundle with progressive disclosure (FR-016/017).

| Field         | Type          | Rules                                                          |
| ------------- | ------------- | -------------------------------------------------------------- |
| `name`        | string        | required                                                       |
| `description` | string        | required; only this is used for relevance selection (FR-017)   |
| `sources`     | SkillSource[] | files / inline / code; loaded only when skill is deemed needed |

**State**: indexed (description only) → selected (relevant) → loaded (full content read) (FR-017a).

## Entity: Agent

Configured actor (FR-001).

| Field                 | Type     | Rules                                               |
| --------------------- | -------- | --------------------------------------------------- |
| `name`                | string   | required                                            |
| `instructions`        | string   | required                                            |
| `provider`            | Provider | required                                            |
| `tools`               | Tool[]   | optional                                            |
| `skills`              | Skill[]  | optional                                            |
| `maxIterations`       | number   | default safe; `-1` = unlimited (FR-012b)            |
| `toolTimeoutMs`       | number   | per-tool-call timeout (FR-012c)                     |
| `compactionThreshold` | number   | fraction of `maxInputTokens`; default 0.9 (FR-004a) |
| `compactionModel`     | Provider | optional override (FR-004b)                         |

**Relationships**: Agent ↔ Provider (1:1), Agent ↔ Tool (1:N), Agent ↔ Skill (1:N), Agent ↔ Thread (1:N).

## Entity: Thread / Conversation

Multi-turn context (FR-004).

| Field       | Type      | Rules                               |
| ----------- | --------- | ----------------------------------- |
| `id`        | string    | required                            |
| `messages`  | Message[] | ordered                             |
| `compacted` | boolean   | true after compaction summarization |

**State**: active → (tokens ≥ threshold) → compacting → active(compacted) (FR-004a). Persistable and
restorable via Store (FR-024).

## Entity: RunResult

Outcome of an agent run (FR-002/003a/003b).

| Field       | Type                                                          | Rules                                               |
| ----------- | ------------------------------------------------------------- | --------------------------------------------------- |
| `output`    | string                                                        | final answer                                        |
| `reasoning` | string?                                                       | present only for reasoning-capable models (FR-003a) |
| `status`    | `"completed" \| "failed" \| "incomplete" \| "limit-exceeded"` | (FR-003b/012b)                                      |
| `partial`   | boolean                                                       | true when interrupted mid-stream (FR-003b)          |
| `error`     | TypedError?                                                   | set on failure                                      |

## Entity: Workflow

Graph of agents/steps (FR-018).

| Field            | Type                                                   | Rules                                    |
| ---------------- | ------------------------------------------------------ | ---------------------------------------- |
| `pattern`        | `"sequential" \| "concurrent" \| "handoff" \| "group"` | (FR-019)                                 |
| `nodes`          | WorkflowNode[]                                         | agents/steps                             |
| `maxRounds`      | number                                                 | default safe; `-1` = unlimited (FR-019a) |
| `failurePolicy`  | `"fail-soft" \| "fail-fast"`                           | default `fail-soft` (FR-019b)            |
| `maxConcurrency` | number                                                 | default safe; `-1` = unlimited (FR-019c) |

**State**: running → awaiting-input (serializable, FR-021a) → running → completed/failed. Completion
via explicit signal or `maxRounds` (FR-019a). Status observable by host (FR-021b).

## Entity: Checkpoint

Saved workflow/conversation snapshot (FR-022).

| Field     | Type         | Rules                                 |
| --------- | ------------ | ------------------------------------- |
| `id`      | string       | required                              |
| `version` | string       | schema version for mismatch detection |
| `state`   | serializable | workflow/thread snapshot              |

**State**: restore success → resume; restore failure → fail-closed typed error distinguishing
corrupt vs. version-mismatch; no partial restore (FR-022a).

## Entity: Middleware

Pipeline interceptor (FR-023).

| Field    | Type                           | Rules                                                  |
| -------- | ------------------------------ | ------------------------------------------------------ |
| `name`   | string                         | required                                               |
| `handle` | (ctx, next) => Promise<Result> | wraps request/response; may transform or handle errors |

## Entity: TypedError

Error hierarchy used everywhere (FR-004 errors, FR-008a, FR-011a, FR-015, FR-022a, FR-030a).

| Variant                   | Meaning                                                                     |
| ------------------------- | --------------------------------------------------------------------------- |
| `ProviderError`           | transient (retryable) vs. non-transient (auth/4xx, fail-fast)               |
| `ToolError`               | tool-not-found, invalid-arguments (returned to model), timeout, run-failure |
| `MCPError`                | server unavailable                                                          |
| `CheckpointError`         | corrupt vs. version-mismatch                                                |
| `RuntimeUnsupportedError` | feature unavailable in current runtime                                      |
| `ValidationError`         | schema validation failure                                                   |

All error serialization passes through centralized redaction (FR-026a).

## Entity: Store (persistence adapter)

Pluggable storage (FR-024).

| Method   | Signature                     |
| -------- | ----------------------------- |
| `get`    | (key) => Promise<unknown>     |
| `set`    | (key, value) => Promise<void> |
| `delete` | (key) => Promise<void>        |

Adapters: in-memory, browser (localStorage/IndexedDB), optional Node-fs.
