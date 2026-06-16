# Phase 0 Research: JavaScript Agent Framework

All NEEDS CLARIFICATION items were resolved during five `/speckit.clarify` passes (see
[spec.md](spec.md) → Clarifications). This document records the resulting technical decisions.

## 1. Packaging & module format

- **Decision**: TypeScript 5.x → ES2022, published dual ESM + CJS with emitted `.d.ts`. Single
  package with deep import subpaths (`exports` map) per feature module.
- **Rationale**: ESM enables tree-shaking (Constitution I, FR-029); CJS keeps older Node/tooling
  working; `.d.ts` satisfies "published types for all public APIs" (FR-028). Deep subpaths let a
  React app import only `agents` without pulling `workflows`/`mcp`.
- **Alternatives considered**: ESM-only (rejected: breaks some CJS consumers); bundled single file
  (rejected: defeats tree-shaking).

## 2. Runtime portability (no backend / Vercel without serverless)

- **Decision**: Core depends only on web-standard APIs (`fetch`, `ReadableStream`, `crypto.subtle`
  where needed). Node-only features (stdio MCP spawn, filesystem storage) live behind lazy imports
  guarded by runtime capability detection (`src/core/runtime.ts`).
- **Rationale**: FR-030/FR-030a require browser/edge operation with explicit typed errors for
  unsupported features. Lazy guarded imports keep Node APIs out of the browser bundle.
- **Alternatives**: Separate per-runtime builds (rejected as the sole mechanism: more surface to
  maintain; capability detection chosen per clarification, builds optional later).

## 3. LLM providers (limited scope)

- **Decision**: A `Provider` interface with two implementations — GitHub Copilot (Copilot SDK) and
  OpenAI-compatible (custom base URL for LM Studio). Credentials supplied via a caller token/
  credential callback; never bundled, persisted, or logged. Per-model capability config carries
  `maxInputTokens`, `maxOutputTokens`, `supportsVision`, `supportsReasoning`.
- **Rationale**: FR-005/006/007/007a, FR-005a. Capability config drives compaction threshold,
  multimodal gating, and reasoning-field exposure.
- **Alternatives**: Auto-detect model limits from provider metadata (rejected: unreliable for
  arbitrary LM Studio models; caller-supplied with conservative default chosen).

## 4. Tool contract & validation

- **Decision**: One `Tool` contract: `name`, `description`, JSON-Schema `inputSchema`/`outputSchema`,
  `run`. Arguments validated with a JSON Schema validator (`ajv`) before invocation. Tools
  namespaced by source (`server.tool`) and individually enable/disable-able.
- **Rationale**: FR-009/010/011/012a/014a. JSON Schema matches MCP + LLM function-calling natively
  (no conversion layer). Namespacing makes collisions impossible.
- **Alternatives**: Zod-authoring compiled to JSON Schema (deferred: extra dependency; JSON Schema
  chosen as canonical per clarification).

## 5. MCP integration

- **Decision**: Use `@modelcontextprotocol/sdk` client. Remote transport (HTTP + SSE / streamable
  HTTP) available in all runtimes; stdio transport (spawn command+args) only where process spawning
  is permitted. MCP tools adapted onto the standard `Tool` contract.
- **Rationale**: FR-013/013a/013b/014/015. Matches the no-backend gating decision.
- **Alternatives**: Hand-rolled MCP client (rejected: maintenance cost; official SDK preferred).

## 6. Skills (progressive disclosure)

- **Decision**: Each skill has a top-level `description` plus deferred `sources`. A client-side
  keyword/text index over descriptions selects relevant skills; full content is read only after a
  skill is deemed needed. No embeddings/vector store.
- **Rationale**: FR-016/017/017a. Keeps provider scope limited and runs fully client-side.
- **Alternatives**: Vector/embedding retrieval (rejected: needs an embedding provider, out of scope).

## 7. Agent run loop, safeguards, and context management

- **Decision**: An async run loop drives provider calls + tool execution. Configurable safeguards
  with safe defaults (override incl. `-1`/unlimited): max iterations, per-tool-call timeout. Threads
  auto-compact at a configurable fraction of `maxInputTokens` (default 90%), summarizing prior turns
  via the agent's own model (optional override model). Reasoning content exposed as a separate
  optional field; multimodal (text+image) input gated by `supportsVision`.
- **Rationale**: FR-002/003a/003b/004a/004b/011a/012b/012c.
- **Alternatives**: Truncation-only context handling (rejected: user chose compaction).

## 8. Orchestration / workflows

- **Decision**: Graph workflow model with patterns: sequential, concurrent, handoff, group. Stopping
  via explicit completion signal or configurable max-rounds cap (default safe; `-1` unlimited).
  Concurrent failure policy configurable: fail-soft (default, aggregate partial) or fail-fast.
  Configurable max-concurrency. Workflows are streamable, expose execution status, yield a
  serializable "awaiting input" state for HITL, and checkpoint/resume (fail-closed restore).
- **Rationale**: FR-018/019/019a/019b/019c/020/021/021a/021b/022/022a.
- **Alternatives**: Callback-based HITL (deferred: yield/resume chosen for no-backend fit).

## 9. Persistence

- **Decision**: Pluggable `Store` interface with in-memory, browser (`localStorage`/IndexedDB), and
  optional Node-fs adapters. Threads and checkpoints serialize to it.
- **Rationale**: FR-024, no database server.
- **Alternatives**: Mandatory IndexedDB (rejected: not available in all edge runtimes).

## 10. Observability

- **Decision**: Instrument with `@opentelemetry/api`; consumers wire their own SDK/exporters. Spans
  for agent runs, tool calls, provider calls, and workflow steps. All span/log/error output passes
  through centralized redaction.
- **Rationale**: FR-025/026/026a; OTel works in browser/edge.
- **Alternatives**: Custom trace format (rejected: OTel chosen for interoperability).

## 11. Declarative definitions

- **Decision**: Single shared schema; loader accepts both YAML and JSON with format auto-detection
  (YAML parser lazy-loaded). Produces an agent equivalent to programmatic construction.
- **Rationale**: FR-027.
- **Alternatives**: YAML-only or JSON-only (rejected: user wants both).

## 12. Security & secret handling

- **Decision**: Centralized redaction module scrubs known credential fields/patterns at every output
  boundary (logs, OTel spans, error serialization). Secrets held in caller-injected callbacks, never
  serialized. No `eval`/dynamic execution of model or tool output.
- **Rationale**: Constitution II; FR-005a/008/026/026a; SC-006.
- **Alternatives**: Per-call-site scrubbing (rejected: error-prone; centralized chosen).

## 13. Provider resilience

- **Decision**: Exponential-backoff retry on transient errors (429 honoring Retry-After, 5xx,
  network/timeout), bounded by configurable max-retries; auth/4xx fail fast. Mid-stream failure →
  typed failed/incomplete result exposing flagged partial content.
- **Rationale**: FR-008a/003b.
- **Alternatives**: No built-in retry (rejected per clarification).

## 14. Testing strategy

- **Decision**: Vitest. Unit tests per module; contract tests per public interface (mirror
  `contracts/`); integration tests for agent+tool, agent+MCP (mocked), workflow patterns, and
  persistence round-trips. Dedicated secret-leak scan asserting redaction (SC-006).
- **Rationale**: Constitution III.
- **Alternatives**: Jest (rejected: Vitest is faster and ESM-native for this stack).
