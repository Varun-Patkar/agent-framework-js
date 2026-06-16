---
description: "Task list for JavaScript Agent Framework implementation"
---

# Tasks: JavaScript Agent Framework

**Input**: Design documents from `/specs/001-js-agent-framework/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: INCLUDED — Constitution Principle III (Test-First Quality) mandates unit tests for every public API and integration tests at external boundaries.

**Organization**: Tasks are grouped by user story (US1–US8) so each can be implemented and tested independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story the task belongs to
- All paths are repository-root relative per [plan.md](plan.md)

## Path Conventions

Single tree-shakeable library: `src/` (feature modules over shared `core/`), `tests/{contract,integration,unit}/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and tooling

- [ ] T001 Create project structure (`src/`, `tests/{contract,integration,unit}/`) per [plan.md](plan.md)
- [ ] T002 Initialize TypeScript package in `package.json` with dual ESM+CJS build, `exports` map with deep subpaths, `tsconfig.json` targeting ES2022, and `.d.ts` emission
- [ ] T003 [P] Add dependencies: `@modelcontextprotocol/sdk`, `ajv`, `@opentelemetry/api`, `yaml` (lazy), GitHub Copilot SDK, OpenAI-compatible HTTP client in `package.json`
- [ ] T004 [P] Configure ESLint + Prettier in `.eslintrc` / `.prettierrc`
- [ ] T005 [P] Configure Vitest in `vitest.config.ts` with `tests/` roots and coverage
- [ ] T006 [P] Add CI config running `npm audit`, lint, build, and test in `.github/workflows/ci.yml`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared `core/` that every user story depends on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T007 [P] Create shared content/message types (text/image content parts, `Message`, `ModelCapabilities`) in `src/core/types.ts`
- [ ] T008 [P] Implement typed error hierarchy (`ProviderError`, `ToolError`, `MCPError`, `CheckpointError`, `RuntimeUnsupportedError`, `ValidationError`) in `src/core/errors.ts`
- [ ] T009 [P] Implement runtime capability detection (process-spawn, storage availability) in `src/core/runtime.ts` (FR-030a)
- [ ] T010 [P] Implement centralized secret redaction for all output boundaries in `src/core/redaction.ts` (FR-026a)
- [ ] T011 [P] Unit test redaction + error serialization (secret-leak scan) in `tests/unit/redaction.test.ts` (SC-006)
- [ ] T012 Create public entry `src/index.ts` re-exporting the stable surface (extended per story)

**Checkpoint**: Foundation ready — user stories can begin.

---

## Phase 3: User Story 1 - Create and run a single agent (Priority: P1) 🎯 MVP

**Goal**: Create an agent with a provider and run it (text + streaming) against Copilot or OpenAI-compatible/LM Studio.

**Independent Test**: Configure a provider, create an agent, send a prompt, assert a coherent (and streamed) response; invalid endpoint → typed error with no secret.

### Tests for User Story 1 ⚠️ (write first, ensure they fail)

- [ ] T013 [P] [US1] Contract test for Provider (credential callback, retry/backoff, fail-fast) in `tests/contract/provider.test.ts` (per [contracts/provider.md](contracts/provider.md))
- [ ] T014 [P] [US1] Contract test for Agent run/stream + reasoning + multimodal gating in `tests/contract/agent.test.ts` (per [contracts/agent.md](contracts/agent.md))
- [ ] T015 [P] [US1] Integration test: agent runs against a mocked provider, streaming + invalid-endpoint error in `tests/integration/single-agent.test.ts`

### Implementation for User Story 1

- [ ] T016 [P] [US1] Define `Provider` interface + `ModelCapabilities` in `src/providers/provider.ts` (FR-007/007a); credentials are obtained only via the injected callback and never hardcoded, persisted, or logged (FR-008)
- [ ] T017 [P] [US1] Implement exponential-backoff retry (429/5xx/network; auth/4xx fail-fast) in `src/providers/retry.ts` (FR-008a)
- [ ] T018 [US1] Implement OpenAI-compatible/LM Studio provider in `src/providers/openai-compatible.ts` (FR-006), uses T016/T017
- [ ] T019 [US1] Implement GitHub Copilot provider in `src/providers/copilot.ts` (FR-005), uses T016/T017
- [ ] T020 [P] [US1] Implement `Thread`/conversation with compaction at threshold via own/override model in `src/agents/thread.ts` (FR-004/004a/004b)
- [ ] T021 [US1] Implement `createAgent`, `run`, `runStream` (multimodal gating, reasoning field, failed/incomplete status, middleware pipeline applied around provider calls per FR-023) in `src/agents/agent.ts` (FR-001/002/003/003a/003b), uses T016/T020
- [ ] T022 [US1] Export agent + provider surface from `src/index.ts` and add deep subpaths `agent-framework-js/agents`, `/providers`
- [ ] T023 [US1] Add TSDoc with examples to all US1 public exports (FR-032)

**Checkpoint**: A single agent runs against both providers with streaming — MVP deliverable.

---

## Phase 4: User Story 2 - Equip an agent with code tools (Priority: P1) 🎯 MVP

**Goal**: Register local function tools (JSON Schema), have the agent invoke them with validated args, loop-bounded.

**Independent Test**: Register a calculator tool, prompt requiring it, assert correct invocation + result in the answer; invalid args self-correct.

### Tests for User Story 2 ⚠️

- [ ] T024 [P] [US2] Contract test for Tool/registry (validation, namespacing, enable/disable, self-correction) in `tests/contract/tool.test.ts` (per [contracts/tool.md](contracts/tool.md))
- [ ] T025 [P] [US2] Integration test: agent invokes a function tool; invalid args fed back; iteration cap → `limit-exceeded` in `tests/integration/agent-tools.test.ts`

### Implementation for User Story 2

- [ ] T026 [P] [US2] Define `Tool` contract + `defineTool` in `src/tools/tool.ts` (FR-009)
- [ ] T027 [P] [US2] Implement JSON Schema argument validation (ajv) in `src/tools/validate.ts` (FR-011)
- [ ] T028 [US2] Implement `ToolRegistry` (register, list, namespacing, enable/disable, invoke) in `src/tools/registry.ts` (FR-012a/014a), uses T026/T027
- [ ] T029 [US2] Implement agent tool-call loop (max-iterations `-1` aware, per-tool-call timeout, error self-correction) in `src/agents/loop.ts` (FR-011a/012b/012c), integrates with `src/agents/agent.ts`
- [ ] T030 [US2] Export tools surface from `src/index.ts` + deep subpath `agent-framework-js/tools`
- [ ] T031 [US2] Add TSDoc with examples to all US2 public exports (FR-032)

**Checkpoint**: Agents call local tools with validation and bounded loops — full P1 MVP complete.

---

## Phase 5: User Story 3 - Connect agents to MCP servers (Priority: P2)

**Goal**: Connect to MCP servers (remote everywhere, stdio Node-only) and expose their tools via the unified Tool contract.

**Independent Test**: Connect to a mocked MCP server, list namespaced tools, run an agent that calls one; stdio in browser runtime → typed error.

### Tests for User Story 3 ⚠️

- [ ] T032 [P] [US3] Contract test for MCP connection (remote/stdio gating, adapter, unavailability) in `tests/contract/mcp.test.ts` (per [contracts/mcp.md](contracts/mcp.md))
- [ ] T033 [P] [US3] Integration test: mocked MCP server tools invoked through agent; server-down → typed error, other tools usable in `tests/integration/agent-mcp.test.ts`

### Implementation for User Story 3

- [ ] T034 [P] [US3] Implement MCP connection with remote (HTTP/SSE) + capability-gated stdio transport in `src/mcp/connection.ts` (FR-013/013a/013b/030a)
- [ ] T035 [US3] Implement adapter mapping MCP tools onto the `Tool` contract (namespaced by connection id) in `src/mcp/adapter.ts` (FR-014/014a/015), uses T028/T034
- [ ] T036 [US3] Export MCP surface from `src/index.ts` + deep subpath `agent-framework-js/mcp`
- [ ] T037 [US3] Add TSDoc with examples to all US3 public exports (FR-032)

**Checkpoint**: Agents use local + MCP tools uniformly.

---

## Phase 6: User Story 4 - Give agents domain skills (Priority: P2)

**Goal**: Define skills (description + deferred sources), select by keyword match, load full content only on demand.

**Independent Test**: Attach a skill, ask a question answerable only from it, assert the answer reflects content; off-domain prompt doesn't force the skill.

### Tests for User Story 4 ⚠️

- [ ] T038 [P] [US4] Contract test for Skill/SkillIndex (description-only selection, on-demand load) in `tests/contract/skill.test.ts` (per [contracts/skill.md](contracts/skill.md))
- [ ] T039 [P] [US4] Integration test: relevant skill loaded once; off-domain prompt loads nothing in `tests/integration/agent-skills.test.ts`

### Implementation for User Story 4

- [ ] T040 [P] [US4] Define `Skill` + `defineSkill` + `SkillSource` in `src/skills/skill.ts` (FR-016)
- [ ] T041 [US4] Implement client-side keyword `SkillIndex` (select + lazy `load`) in `src/skills/index.ts` (FR-017/017a)
- [ ] T042 [US4] Wire skill selection/loading into the agent run path in `src/agents/agent.ts` (FR-017)
- [ ] T043 [US4] Export skills surface from `src/index.ts` + deep subpath `agent-framework-js/skills`
- [ ] T044 [US4] Add TSDoc with examples to all US4 public exports (FR-032)

**Checkpoint**: Agents draw on skills via progressive disclosure.

---

## Phase 7: User Story 5 - Orchestrate multiple agents with workflows (Priority: P2)

**Goal**: Compose agents into sequential/concurrent/handoff/group workflows with streaming, HITL yield/resume, completion signal + round cap, failure policy, concurrency cap, and checkpoint resume.

**Independent Test**: Build sequential, concurrent, and handoff workflows; verify routing/aggregation; pause for input and resume; checkpoint resume is deterministic; corrupt checkpoint fails closed.

### Tests for User Story 5 ⚠️

- [ ] T045 [P] [US5] Contract test for Workflow (patterns, maxRounds, failurePolicy, maxConcurrency, status, resume) in `tests/contract/workflow.test.ts` (per [contracts/workflow.md](contracts/workflow.md))
- [ ] T046 [P] [US5] Integration test: sequential→concurrent→handoff→group; HITL resume; checkpoint resume determinism (SC-008); corrupt checkpoint fail-closed in `tests/integration/workflows.test.ts`

### Implementation for User Story 5

- [ ] T047 [P] [US5] Implement bounded concurrency + fail-soft/fail-fast policy in `src/workflows/concurrency.ts` (FR-019b/019c)
- [ ] T048 [P] [US5] Implement serializable checkpoint + fail-closed restore (corrupt vs version-mismatch) in `src/workflows/checkpoint.ts` (FR-022/022a)
- [ ] T049 [US5] Implement orchestration patterns (sequential, concurrent, handoff, group) in `src/workflows/patterns.ts` (FR-019), uses T047
- [ ] T050 [US5] Implement `createWorkflow`/`run`/`runStream`/`resume`/`status` (completion signal, round cap, awaiting-input yield) in `src/workflows/workflow.ts` (FR-018/019a/020/021/021a/021b), uses T048/T049
- [ ] T051 [US5] Export workflows surface from `src/index.ts` + deep subpath `agent-framework-js/workflows`
- [ ] T052 [US5] Add TSDoc with examples to all US5 public exports (FR-032)

**Checkpoint**: Multi-agent orchestration works end-to-end without a backend.

---

## Phase 8: User Story 6 - Persist and resume conversation state (Priority: P3)

**Goal**: Pluggable storage (in-memory, browser localStorage/IndexedDB, optional Node-fs) to save/restore threads.

**Independent Test**: Run an agent, persist the thread, restore it, continue, assert prior context retained.

### Tests for User Story 6 ⚠️

- [ ] T053 [P] [US6] Contract test for Store + ThreadPersistence round-trip in `tests/contract/persistence.test.ts` (per [contracts/persistence.md](contracts/persistence.md))
- [ ] T054 [P] [US6] Integration test: save → restore → continue conversation in `tests/integration/persistence.test.ts`

### Implementation for User Story 6

- [ ] T055 [P] [US6] Define `Store` interface + in-memory adapter in `src/persistence/store.ts` and `src/persistence/memory.ts` (FR-024)
- [ ] T056 [P] [US6] Implement browser adapter (localStorage/IndexedDB) in `src/persistence/browser.ts` (FR-024)
- [ ] T057 [US6] Implement `ThreadPersistence` save/load wiring threads to a `Store` (FR-024), uses T020/T055
- [ ] T058 [US6] Export persistence surface from `src/index.ts` + deep subpath `agent-framework-js/persistence`
- [ ] T059 [US6] Add TSDoc with examples to all US6 public exports (FR-032)

**Checkpoint**: Conversations persist and resume with no server.

---

## Phase 9: User Story 7 - Observe and debug agent runs (Priority: P3)

**Goal**: OpenTelemetry spans for run/tool/provider/workflow with redaction guaranteeing no secret leakage.

**Independent Test**: Enable tracing, run an agent that calls a tool, assert spans with timing/status and zero secrets.

### Tests for User Story 7 ⚠️

- [ ] T060 [P] [US7] Contract test for observability (spans emitted, redaction applied) in `tests/contract/observability.test.ts` (per [contracts/observability.md](contracts/observability.md))
- [ ] T061 [P] [US7] Integration test: spans for run+tool+provider+workflow; secret-leak scan across all output in `tests/integration/observability.test.ts` (SC-006)

### Implementation for User Story 7

- [ ] T062 [US7] Implement `configureObservability` + OTel span emission (run/tool/provider/workflow) routed through redaction in `src/observability/tracing.ts` (FR-025/026/026a), uses T010
- [ ] T063 [US7] Instrument agent/tool/provider/workflow call sites with spans (FR-025)
- [ ] T064 [US7] Export observability surface from `src/index.ts` + deep subpath `agent-framework-js/observability`
- [ ] T065 [US7] Add TSDoc with examples to all US7 public exports (FR-032)

**Checkpoint**: Execution is observable and secret-safe.

---

## Phase 10: User Story 8 - Define agents declaratively (Priority: P3)

**Goal**: Load agents from YAML or JSON (one shared schema, auto-detected) producing an equivalent runnable agent.

**Independent Test**: Author equivalent YAML and JSON definitions, load both, assert behavior matches a programmatic agent.

### Tests for User Story 8 ⚠️

- [ ] T066 [P] [US8] Contract test for `loadAgentDefinition` (YAML+JSON parity, credential injection) in `tests/contract/declarative.test.ts` (per [contracts/declarative.md](contracts/declarative.md))
- [ ] T067 [P] [US8] Integration test: equivalent YAML and JSON produce matching agents in `tests/integration/declarative.test.ts`

### Implementation for User Story 8

- [ ] T068 [P] [US8] Define shared `AgentDefinition` schema in `src/declarative/loader.ts` (FR-027)
- [ ] T069 [US8] Implement `loadAgentDefinition` with YAML/JSON auto-detect (lazy YAML parser), building an agent via injected factories (FR-027/005a), uses T021
- [ ] T070 [US8] Export declarative surface from `src/index.ts` + deep subpath `agent-framework-js/declarative`
- [ ] T071 [US8] Add TSDoc with examples to all US8 public exports (FR-032)

**Checkpoint**: All eight capability areas usable through the public API (SC-002).

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Cross-story hardening and final validation

- [ ] T072 [P] Expose the public middleware API (`Middleware`, `useMiddleware`) over the agent pipeline hook from T021, in `src/middleware/middleware.ts`, with a contract test in `tests/contract/middleware.test.ts` (FR-023, per [contracts/middleware.md](contracts/middleware.md))
- [ ] T073 [P] Add `tests/unit/tree-shaking.test.ts` asserting agent-only import excludes mcp/workflows/yaml (FR-029)
- [ ] T074 [P] Add `tests/unit/runtime-gating.test.ts` for unsupported-feature typed errors in browser/edge simulation (FR-030a)
- [ ] T075 Write README with install + quickstart for React/Node/edge and document every configurable knob (defaults + customization) (FR-032a)
- [ ] T076 Author `AGENT_USAGE.md` agent-facing guide synced to the final public API (Constitution IV, FR-031/031a)
- [ ] T077 [P] Run `npm audit` and resolve high/critical findings (Constitution II)
- [ ] T078 Execute [quickstart.md](quickstart.md) scenarios 1–8 and confirm success criteria SC-001…SC-008
- [ ] T079 Verify build emits ESM + CJS + `.d.ts` and `exports` deep subpaths resolve in a sample React and Node consumer
- [ ] T080 [P] Add `tests/unit/no-builtin-tools.test.ts` asserting a fresh registry/agent has zero auto-registered tools (FR-012d)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup; **blocks all user stories**
- **User Stories (Phases 3–10)**: depend on Foundational; ordered by priority P1 → P2 → P3
- **Polish (Phase 11)**: depends on the targeted user stories being complete

### User Story Dependencies

- **US1 (P1)**: after Foundational — no other story deps
- **US2 (P1)**: after Foundational; tool loop integrates with US1 agent (T029)
- **US3 (P2)**: after US2 (reuses `ToolRegistry`, T028)
- **US4 (P2)**: after US1 (agent run path); independent of US3
- **US5 (P2)**: after US1 (agents) — independent of US3/US4
- **US6 (P3)**: after US1 (threads, T020)
- **US7 (P3)**: after Foundational (redaction T010); instruments US1–US5 call sites
- **US8 (P3)**: after US1 (`createAgent`)
- **Middleware (FR-023)**: the request/response pipeline hook is built into the agent in US1 (T021); the public `Middleware`/`useMiddleware` API + contract test are added in Polish (T072), which depends on T021.

### Within Each User Story

- Tests written first and failing → models/contracts → services → integration → exports → TSDoc

### Parallel Opportunities

- Setup: T003–T006 in parallel
- Foundational: T007–T011 in parallel
- All `[P]` tasks within a story (distinct files) run in parallel; e.g., US1 T013/T014/T015 (tests) and T016/T017/T020 (independent modules)
- After Foundational, US1 and US5 can be staffed in parallel; US3 waits on US2

---

## Implementation Strategy

- **MVP first**: Complete Phase 1–2, then **US1 + US2** (both P1) for a usable agent-with-tools deliverable.
- **Incremental delivery**: Layer P2 stories (US3 MCP, US4 skills, US5 workflows) then P3 (US6 persistence, US7 observability, US8 declarative).
- **Test-first** throughout per Constitution III; **docs** (TSDoc per story, README + `AGENT_USAGE.md` in Polish) per Constitution IV.

## Parallel Example: User Story 1

```text
# Launch US1 tests together (all [P], distinct files):
T013 provider.test.ts   T014 agent.test.ts   T015 single-agent.test.ts

# Then independent US1 modules in parallel:
T016 provider.ts   T017 retry.ts   T020 thread.ts
# Sequential after: T018/T019 (providers) → T021 (agent) → T022/T023
```
