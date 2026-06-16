# Implementation Plan: JavaScript Agent Framework

**Branch**: `001-js-agent-framework` | **Date**: 2026-06-16 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-js-agent-framework/spec.md`

## Summary

Build a modular, tree-shakeable JavaScript/TypeScript package (installable into React, Node, or any
JS host) that reproduces the in-scope capability categories of Microsoft Agent Framework: agents,
function/code tools, MCP integration, skills (progressive disclosure), multi-agent orchestration
workflows, middleware, conversation/thread persistence, OpenTelemetry observability, and declarative
(YAML/JSON) agent definitions. LLM providers are intentionally limited to GitHub Copilot (Copilot
SDK) and OpenAI-compatible (LM Studio) behind a pluggable provider abstraction. The package runs in
no-backend deployments (browser/edge, Vercel without serverless functions), gating runtime-specific
features (e.g., stdio MCP) via runtime capability detection. Security is secure-by-default:
caller-injected credentials, centralized secret redaction at all output boundaries, JSON-Schema input
validation, and fail-closed behavior.

## Technical Context

**Language/Version**: TypeScript 5.x compiled to ES2022; published as ESM (primary) + CJS, with
emitted `.d.ts` types. Consumable from plain JavaScript.

**Primary Dependencies** (minimal, peer/optional where runtime-specific):

- `@modelcontextprotocol/sdk` — MCP client (remote HTTP/SSE everywhere; stdio only in Node).
- A JSON Schema validator (e.g., `ajv`) for tool argument validation (FR-011).
- `@opentelemetry/api` — tracing surface; concrete SDK/exporters supplied by the consumer (FR-025).
- A YAML parser (e.g., `yaml`) for declarative definitions; loaded lazily so JSON-only/browser use
  pays no cost (FR-027, tree-shakeable per Constitution I).
- GitHub Copilot SDK and an OpenAI-compatible HTTP client for the two providers (FR-005, FR-006).
- No built-in tools and no embedding/vector dependency (skills use keyword matching, FR-017a).

**Storage**: Pluggable storage abstraction. Default adapters: in-memory and browser
`localStorage`/`IndexedDB`; Node filesystem adapter optional. No database server (FR-024).

**Testing**: Vitest for unit + integration; provider/MCP boundaries mocked. Contract tests assert
the public tool/provider/workflow interfaces. Secret-leak scan test for SC-006/FR-026a.

**Target Platform**: Modern browsers, edge runtimes (Vercel Edge/Workers), and Node 18+. Core
features must not hard-depend on Node-only APIs (FR-030); runtime capability detection gates the rest
(FR-030a).

**Project Type**: Single library/package (internal feature modules, single published entry with deep
import paths for tree-shaking).

**Performance Goals**: Tree-shakeable so an agent-only import pulls no MCP/YAML/workflow code;
streaming first-token latency bounded only by the provider; bounded concurrency (FR-019c) and retry
backoff (FR-008a) prevent provider overload.

**Constraints**: No backend / no serverless functions for core logic; secrets never bundled,
persisted, or logged; fail-closed on untrusted input and unrestorable checkpoints; configurable safe
defaults for iteration caps, per-tool-call timeouts, workflow round caps, concurrency, and retries.

**Scale/Scope**: 8 capability areas (agents, tools, MCP, skills, workflows, middleware, persistence,
observability) + declarative loader + 2 providers. ~10 internal modules.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                       | Gate                                                                        | Status                                                                                                                                                                                                                 |
| ------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Modular & Composable         | Tree-shakeable, no circular deps, minimal public API, deep import paths     | PASS — independent modules (`agents`, `providers`, `tools`, `mcp`, `skills`, `workflows`, `middleware`, `persistence`, `observability`, `declarative`) over a shared `core`; runtime-/format-specific deps lazy-loaded |
| II. Security by Default         | OWASP-safe, secrets never logged, untrusted input validated, fail-closed    | PASS — caller-injected credentials (FR-005a), JSON-Schema validation (FR-011), centralized redaction (FR-026a), fail-closed checkpoint restore (FR-022a), no `eval` of model/tool output                               |
| III. Test-First Quality         | Unit tests for every public API; integration tests at external boundaries   | PASS — Vitest plan; provider/MCP mocked; contract tests per interface; secret-leak scan                                                                                                                                |
| IV. Documentation-First         | TSDoc + examples on every export; `AGENT_USAGE.md` synced; README/changelog | PLANNED — `AGENT_USAGE.md` authored after implementation (prior decision); TSDoc required on all exports (FR-032); all knobs documented (FR-032a)                                                                      |
| V. Extensible Tooling Interface | Uniform pluggable tool contract; no built-in tools                          | PASS — single `Tool` contract (name, JSON-Schema in/out, description); local + MCP tools unified and namespaced (FR-014a); zero built-in tools (FR-012d)                                                               |

**Result**: PASS (initial and post-design). No violations; Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/001-js-agent-framework/
├── plan.md              # This file (/speckit.plan output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (public interface contracts)
│   ├── agent.md
│   ├── provider.md
│   ├── tool.md
│   ├── mcp.md
│   ├── skill.md
│   ├── workflow.md
│   ├── middleware.md
│   ├── persistence.md
│   ├── observability.md
│   └── declarative.md
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
src/
├── core/                # Shared types, errors, runtime detection, redaction, config
│   ├── errors.ts        # Typed error hierarchy (provider, tool, runtime, checkpoint, validation)
│   ├── runtime.ts       # Capability detection (process spawn, storage) — FR-030a
│   ├── redaction.ts     # Centralized secret scrubbing for all output boundaries — FR-026a
│   └── types.ts         # Content parts (text/image), message, capability flags
├── providers/           # LLM provider abstraction + implementations
│   ├── provider.ts      # Provider interface, model capability config (maxInput/OutputTokens, vision, reasoning)
│   ├── retry.ts         # Exponential backoff for transient errors — FR-008a
│   ├── copilot.ts       # GitHub Copilot provider — FR-005
│   └── openai-compatible.ts  # OpenAI-compatible/LM Studio provider — FR-006
├── tools/               # Tool contract + registry
│   ├── tool.ts          # Tool interface (JSON Schema in/out)
│   ├── registry.ts      # Registration, namespacing, enable/disable — FR-012a/FR-014a
│   └── validate.ts      # JSON Schema argument validation — FR-011
├── mcp/                 # MCP client integration
│   ├── connection.ts    # Remote (HTTP/SSE) + stdio transports — FR-013a/FR-013b
│   └── adapter.ts       # Maps MCP tools onto the Tool contract — FR-014
├── skills/              # Skills (progressive disclosure)
│   ├── skill.ts         # Skill definition (description + sources)
│   └── index.ts         # Keyword index + on-demand loading — FR-017/FR-017a
├── agents/              # Agent runtime
│   ├── agent.ts         # Create/run, streaming, reasoning field — FR-001..003b
│   ├── thread.ts        # Multi-turn thread + compaction — FR-004..004b
│   └── loop.ts          # Tool-call loop, iteration cap, per-call timeout — FR-012b/c, FR-011a
├── workflows/           # Multi-agent orchestration
│   ├── workflow.ts      # Graph model, status, completion signal, round cap — FR-018/019a/021b
│   ├── patterns.ts      # sequential / concurrent / handoff / group — FR-019
│   ├── concurrency.ts   # Max-concurrency + fail-soft/fail-fast — FR-019b/019c
│   └── checkpoint.ts    # Serializable state, HITL yield/resume, fail-closed restore — FR-021a/022/022a
├── middleware/          # Request/response pipeline — FR-023
│   └── middleware.ts
├── persistence/         # Pluggable storage adapters — FR-024
│   ├── store.ts         # Storage interface
│   ├── memory.ts        # In-memory adapter
│   └── browser.ts       # localStorage / IndexedDB adapter
├── observability/       # OpenTelemetry tracing — FR-025
│   └── tracing.ts
├── declarative/         # YAML/JSON agent definitions — FR-027
│   └── loader.ts
└── index.ts             # Public entry (re-exports; deep paths available for tree-shaking)

tests/
├── contract/            # One suite per public interface (mirrors contracts/)
├── integration/         # Agent+tool, agent+MCP(mock), workflows, persistence round-trip
└── unit/                # Per-module units incl. redaction & secret-leak scan
```

**Structure Decision**: Single tree-shakeable library. Internal feature modules sit over a shared
`core` and never import each other circularly (Constitution I). The public `index.ts` re-exports the
stable surface, while deep import paths (e.g., `agent-framework-js/workflows`) let consumers pull only
what they use. Runtime- and format-specific dependencies (MCP stdio, YAML, OTel exporters) are loaded
lazily so a browser/React agent-only import stays minimal. Installable into React/Node/any JS host
via standard package resolution.

## Complexity Tracking

> No constitution violations; this section intentionally left empty.
