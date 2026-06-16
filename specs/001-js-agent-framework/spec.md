# Feature Specification: JavaScript Agent Framework

**Feature Branch**: `001-js-agent-framework`

**Created**: 2026-06-16

**Status**: Draft

**Input**: User description: "I want to copy the functionality of microsoft/agent-framework but in a JavaScript package. For now I'm fine with having GitHub Copilot (can use Copilot SDK) and OpenAI-compatible (mine is LM Studio) APIs as LLM providers, but I need all features. I should be able to make agents and add code tools, MCPs, skills — everything that is in Agent Framework. Just LLM providers can be limited for now. This is for another project (a no-backend project that requires orchestration of agents that can be hosted on Vercel with no serverless functions)."

## Clarifications

### Session 2026-06-16

- Q: Which MCP transport(s) must the framework support given the no-backend/browser constraint? → A: Both — remote transport (HTTP + SSE / streamable HTTP) is always available; stdio (spawn a server via command + args) is available only when running in a Node-capable runtime that permits process spawning. In a frontend runtime without process-spawn access, only remote transport is available.
- Q: How should the framework treat GitHub Copilot (and similar) credentials in a no-backend runtime? → A: Credentials are always injected via a caller-supplied token/credential callback; the framework never bundles, persists, or logs them. In a frontend-only deployment the end user supplies their own token and it stays client-side only. In a backend deployment the developer may supply it, or the user provides it per request over SSL — in which case the backend must not log or persist it. This MUST be documented.
- Q: What schema format should tools and skills use for typed inputs/outputs? → A: JSON Schema as the canonical format, following the MCP-popularized schema, so local tools, MCP tools, and LLM function-calling all interoperate without a conversion layer. Additionally, the framework MUST let users enable/disable whole MCP servers and individual tools (granular toggling), preserving the freedoms the reference framework offers.
- Q: How should runaway agent/tool loops be bounded? → A: A configurable maximum iteration/step count per run with a safe default, settable to -1 for unlimited; plus a configurable per-tool-call timeout (not a per-run timeout). Safeguards are on by default but fully overridable by the user.
- Q: Should the framework ship any built-in tools (e.g., web search)? → A: No. The framework provides the tool interface only and ships no built-in tools — there is no built-in web-search tool. All tools are supplied by the consumer (local code or MCP).
- Q: How should an agent discover and use an attached skill at run time? → A: Progressive disclosure. Each skill has a top-level description; the agent uses only that description to decide whether the skill is relevant to the prompt. The skill's full content is loaded (read) only after it is deemed needed — full content is never injected otherwise. Indexing is used for fast skill lookup/selection.
- Q: How should multi-agent workflows decide when to stop? → A: Both an explicit completion signal and a safety cap. Agents/steps can signal completion to end the workflow, AND a configurable max-rounds/turns cap bounds it (whichever occurs first). The cap ships with a safe default but is configurable, including -1 for unlimited.
- Q: In a concurrent workflow, what happens when one branch fails while others succeed? → A: Configurable per workflow. The user chooses fail-soft (failed branches return typed errors, successful branches complete, partial results aggregated) or fail-fast (first failure cancels remaining branches and the workflow errors). Default is fail-soft.
- Q: What happens when checkpointed state cannot be restored (corrupt or version-mismatched)? → A: Fail closed. Restore returns a clear typed error that distinguishes corrupt data from a version mismatch; the framework does not auto-fallback or partially restore, and the caller decides whether to start fresh. Better to not run than run badly.
- Q: Which open tracing standard should observability use? → A: OpenTelemetry (OTel) as the canonical standard, with pluggable exporters. It works in browser/edge runtimes, preserving the no-backend constraint.
- Q: How should skill indexing for fast lookup work, given limited provider scope? → A: Keyword/text matching over skill descriptions — no embeddings and no extra embedding provider. It runs fully client-side, keeping provider scope limited and avoiding overcomplication.
- Q: How does a paused workflow obtain human input in a no-backend runtime? → A: The workflow yields a serializable "awaiting input" state; the host application collects the input however it wants and calls resume with that input. The workflow must also be transparent about its status so the host can report progress to the user, and while awaiting input the host can supply that input to continue.
- Q: What format(s) should declarative agent definitions use? → A: Both YAML and JSON against a single shared schema, with the loader auto-detecting the format. JSON is zero-dependency/browser-friendly; YAML matches the reference framework and is friendlier to author.
- Q: Should the framework bound parallelism for concurrent agent/tool calls? → A: Yes — a configurable max-concurrency limit with a safe default (and -1 for unlimited). All such configurable knobs (concurrency, iteration caps, timeouts, failure policy, workflow round caps) MUST be documented so developers/agents know how to customize them.
- Q: How should tool name collisions (e.g., an MCP tool whose name matches a local or another server's tool) be resolved? → A: Namespace tools by source (e.g., `server.tool`), so collisions are impossible and every tool is uniquely addressable.
- Q: What happens when a conversation grows beyond the model's context window? → A: Compaction. When the conversation reaches 90% of the context window (configurable threshold), the prior conversation is compacted (summarized into a compact form) and new messages continue from the compacted state. Compaction is the default; the threshold is configurable.
- Q: Which model performs the compaction summarization, given limited provider scope? → A: The agent's own configured provider/model performs compaction by default, with an optional caller-specified summarization model override. No separate provider is required.
- Q: How does the framework determine a model's context-window size for compaction? → A: The caller provides per-model capability config, including `maxInputTokens` and `maxOutputTokens` (e.g., 262144 / 32000) and capability flags such as vision and reasoning support. Compaction uses the configured input-token limit; a conservative default applies only if unspecified.
- Q: Should agents accept multimodal (image) input, not just text? → A: Yes. Agent input supports text and images (multimodal), gated by the model's vision capability flag; sending images to a non-vision model returns a typed error.
- Q: How should reasoning/thinking content from reasoning-capable models be exposed? → A: As a separate, optional field on the response distinct from the final answer, populated only for reasoning-capable models; non-reasoning models return the same response shape without it.
- Q: How should the framework handle transient provider failures (rate limits, 5xx, network/timeouts)? → A: Automatic retry with exponential backoff on transient errors (429 honoring Retry-After, 5xx, network/timeouts), bounded by a configurable max-retries; non-transient errors (auth/4xx) fail fast with a typed error.
- Q: What happens when a provider returns a malformed response or times out mid-stream? → A: The run is marked failed/incomplete with a typed error; any partial content already received is exposed but clearly flagged as incomplete (not treated as a successful answer). Transient-error retry applies where the failure is transient.
- Q: What happens when the agent requests a nonexistent tool or supplies arguments that fail schema validation? → A: The typed error (tool-not-found or invalid-arguments) is returned to the model as a tool result so it can self-correct (retry with valid arguments or choose another tool), bounded by the max-iteration cap.
- Q: How should the framework handle runtime-capability gating (Node-only APIs, stdio spawn) in browser/edge runtimes? → A: Detect runtime capabilities (e.g., process spawning, storage) at runtime; core features work everywhere, and unsupported features throw a clear typed "unsupported in this runtime" error.
- Q: How are secrets prevented from appearing in logs, traces, or error messages? → A: Centralized redaction at every output boundary (logs, OpenTelemetry traces, error serialization) that scrubs known credential fields/patterns before anything is emitted.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Create and run a single agent (Priority: P1)

A developer building a no-backend web application creates an agent by giving it a name, instructions, and an LLM provider (GitHub Copilot or an OpenAI-compatible endpoint such as LM Studio), then sends it a message and receives a response — all from client-side/edge JavaScript with no server functions required.

**Why this priority**: This is the foundational capability. Without the ability to create and invoke a single agent against a supported provider, no other feature has value. It is the minimum viable product.

**Independent Test**: Can be fully tested by configuring a provider, creating an agent, sending a prompt, and asserting that a coherent response (and any streamed tokens) is returned. Delivers immediate standalone value.

**Acceptance Scenarios**:

1. **Given** a configured OpenAI-compatible provider (LM Studio), **When** the developer creates an agent and runs it with a prompt, **Then** the agent returns a text response.
2. **Given** a configured GitHub Copilot provider, **When** the developer runs the agent with a prompt, **Then** the agent returns a text response.
3. **Given** an agent run is in progress, **When** the developer requests streaming, **Then** partial response tokens are delivered incrementally before completion.
4. **Given** an invalid or unreachable provider endpoint, **When** the agent is run, **Then** a clear, typed error is returned without exposing secrets.

---

### User Story 2 - Equip an agent with code tools (function calling) (Priority: P1)

A developer registers local JavaScript functions as tools (with name, description, and typed inputs/outputs) so the agent can decide to call them, receive structured results, and incorporate the outcome into its response.

**Why this priority**: Tool/function calling is the core differentiator of an agent over a plain chat call and is explicitly required ("add code tools"). It is essential to the MVP usefulness.

**Independent Test**: Register a deterministic function tool (e.g., a calculator), prompt the agent in a way that requires the tool, and assert the tool was invoked with correct arguments and the result appears in the final answer.

**Acceptance Scenarios**:

1. **Given** a registered function tool, **When** the agent determines the tool is needed, **Then** the framework invokes the function with validated arguments and feeds the typed result back to the agent.
2. **Given** a tool that throws or rejects, **When** it is invoked, **Then** the failure is surfaced to the agent as a typed error and the run continues or fails gracefully.
3. **Given** multiple registered tools, **When** the agent runs, **Then** the agent receives each tool's name, description, and schema to decide which (if any) to call.

---

### User Story 3 - Connect agents to MCP servers (Priority: P2)

A developer connects an agent to one or more Model Context Protocol (MCP) servers so the tools/resources exposed by those servers become available to the agent alongside local code tools.

**Why this priority**: MCP is explicitly requested and significantly expands available capabilities, but agents are already useful with local tools (P1), so it builds on the MVP.

**Independent Test**: Connect to a reference MCP server, list the tools it exposes, run an agent that calls one of them, and assert the result is returned through the same tool interface as local tools.

**Acceptance Scenarios**:

1. **Given** a reachable MCP server, **When** the agent is configured with it, **Then** the server's tools are discovered and presented to the agent uniformly with local tools.
2. **Given** an MCP server tool is invoked, **When** it returns a result, **Then** the result is passed back to the agent in the standard typed tool-result form.
3. **Given** an MCP server becomes unavailable, **When** a call is attempted, **Then** a clear typed error is returned and other tools remain usable.

---

### User Story 4 - Give agents domain skills (Priority: P2)

A developer assembles "skills" — domain-specific knowledge bundles built from sources such as files, inline content, and code — that an agent can discover and draw on when responding.

**Why this priority**: Skills are explicitly requested and add meaningful domain capability, but depend on a working agent + tooling core, so they rank after P1.

**Independent Test**: Define a skill from a small knowledge source, attach it to an agent, ask a question answerable only from that skill, and assert the response reflects the skill content.

**Acceptance Scenarios**:

1. **Given** a skill defined from one or more sources, **When** it is attached to an agent, **Then** the agent can discover and use it during a run.
2. **Given** a question outside the skill's domain, **When** the agent runs, **Then** the skill is not forced and the agent responds normally.

---

### User Story 5 - Orchestrate multiple agents with workflows (Priority: P2)

A developer composes multiple agents into a multi-agent workflow using graph-based patterns (sequential, concurrent, handoff, and group collaboration), with support for streaming, human-in-the-loop checkpoints, and resumable/checkpointed state — running entirely without a dedicated backend.

**Why this priority**: This is the central motivation of the consuming project ("orchestration of agents"). It depends on single agents existing first (P1), so it is a high-value second tier.

**Independent Test**: Build a two-agent sequential workflow (e.g., researcher → summarizer), run it end to end, and assert each agent contributes in order and the final output combines their work. Then build a concurrent and a handoff variant and verify routing.

**Acceptance Scenarios**:

1. **Given** two agents in a sequential workflow, **When** the workflow runs, **Then** the first agent's output is passed to the second and a combined result is produced.
2. **Given** a concurrent workflow, **When** it runs, **Then** multiple agents execute in parallel and their results are aggregated.
3. **Given** a handoff workflow, **When** one agent decides to delegate, **Then** control transfers to the designated agent.
4. **Given** a workflow with a human-in-the-loop checkpoint, **When** it reaches that point, **Then** execution pauses for input and can resume from the saved checkpoint.
5. **Given** a previously checkpointed workflow, **When** it is resumed, **Then** it continues from the saved state rather than restarting.

---

### User Story 6 - Persist and resume conversation state (Priority: P3)

A developer persists an agent's conversation/thread state (using browser-available storage) so a session can be resumed later without a server.

**Why this priority**: Important for real apps but the framework is usable for single-shot runs without it; it is an enhancement over the core.

**Independent Test**: Run an agent, persist the thread, reload, restore the thread, continue the conversation, and assert prior context is retained.

**Acceptance Scenarios**:

1. **Given** an active conversation thread, **When** it is saved and later restored, **Then** the agent continues with the prior context intact.

---

### User Story 7 - Observe and debug agent runs (Priority: P3)

A developer enables tracing/telemetry to inspect agent and workflow execution (steps, tool calls, timings) for debugging, using an open standard so traces can be exported to common tools.

**Why this priority**: Observability is valuable for production confidence but not required to deliver functional agents; it layers on top.

**Independent Test**: Enable tracing, run an agent that calls a tool, and assert that spans for the agent run and tool call are emitted with timing and status.

**Acceptance Scenarios**:

1. **Given** tracing is enabled, **When** an agent runs and calls a tool, **Then** structured trace data for the run and each step is produced with no secrets included.

---

### User Story 8 - Define agents declaratively (Priority: P3)

A developer defines agents and their configuration declaratively (e.g., YAML/JSON) for faster setup and versioning, then loads them at runtime.

**Why this priority**: A convenience/versioning enhancement; programmatic creation (P1) already covers the need.

**Independent Test**: Author a declarative agent definition, load it, run it, and assert behavior matches an equivalent programmatically-created agent.

**Acceptance Scenarios**:

1. **Given** a declarative agent definition, **When** it is loaded, **Then** an equivalent runnable agent is produced.

---

### Edge Cases

- What happens when a provider returns a malformed or partial response, or times out mid-stream? — the run is marked failed/incomplete with a typed error; partial content is exposed but flagged incomplete, and transient failures are retried.
- How does the system handle an agent requesting a tool that does not exist or supplying arguments that fail schema validation? — the typed error is returned to the model as a tool result so it can self-correct, bounded by the max-iteration cap.
- How does the system handle tool-call loops (an agent repeatedly calling tools without converging)? — bounded by a configurable max-iteration cap (default safe value; -1 for unlimited).
- What happens when a single tool call hangs or runs too long? — a configurable per-tool-call timeout surfaces a typed timeout error for that call.
- What happens when an MCP server exposes a tool whose name collides with a local tool's name? — tools are namespaced by source (e.g., `server.tool`), so collisions cannot occur and every tool is uniquely addressable.
- What happens when a stdio MCP connection is requested in a runtime that cannot spawn processes (e.g., browser)? — the framework detects the missing capability and throws a clear typed "unsupported in this runtime" error, falling back to remote transport only.
- How does the framework behave under a browser/edge runtime where Node-only APIs are unavailable? — runtime capability detection keeps core features working; features needing unavailable APIs throw a clear typed "unsupported in this runtime" error.
- How does a workflow behave when one branch fails while others succeed (concurrent pattern)? — per a configurable failure policy: fail-soft (default; aggregate partial results) or fail-fast (cancel remaining branches and error).
- What stops a group-collaboration or handoff workflow from running forever? — an explicit completion signal or a configurable max-rounds cap (safe default; -1 for unlimited), whichever occurs first.
- What happens when checkpointed state cannot be restored (corrupt or version-mismatched data)? — restore fails closed with a clear typed error (corrupt vs. version-mismatch); no auto-fallback or partial restore; the caller decides whether to start fresh.
- What happens when a provider enforces rate limits or returns auth errors? — transient errors (429/5xx/network) are retried with exponential backoff up to a configurable max; auth/4xx errors fail fast with a typed error.
- How are secrets prevented from appearing in logs, traces, or error messages? — centralized redaction at every output boundary (logs, traces, error serialization) scrubs known credential fields/patterns before anything is emitted.

## Requirements _(mandatory)_

### Functional Requirements

#### Agents

- **FR-001**: System MUST allow creating an agent configured with a name, instructions, an LLM provider, and an optional set of tools and skills.
- **FR-002**: System MUST allow running an agent with input and returning the agent's response. Input MUST support text and images (multimodal), gated by the model's vision capability flag; supplying image input to a non-vision model MUST return a typed error.
- **FR-003**: System MUST support streaming incremental output from an agent run.
- **FR-003a**: System MUST expose reasoning/thinking content as a separate, optional field on the response (and in the stream), distinct from the final answer, populated only for reasoning-capable models; non-reasoning models MUST return the same response shape without it.
- **FR-003b**: When a response is malformed or a stream is interrupted/times out mid-run, the system MUST mark the run as failed/incomplete with a typed error and MUST expose any partial content received, clearly flagged as incomplete rather than as a successful answer.
- **FR-004**: System MUST support multi-turn conversations via a thread/conversation abstraction that preserves context across turns.
- **FR-004a**: System MUST automatically compact a conversation when it reaches a configurable fraction of the model's context window (default 90%): prior conversation is summarized into a compact form and subsequent messages continue from the compacted state, preserving system instructions and the most recent context.
- **FR-004b**: Compaction summarization MUST use the agent's own configured provider/model by default, and MUST allow a caller-specified summarization model override; no separate provider is required.

#### LLM Providers

- **FR-005**: System MUST support a GitHub Copilot LLM provider (via the Copilot SDK).
- **FR-005a**: System MUST obtain provider credentials through a caller-supplied token/credential callback and MUST NOT bundle, persist, or log them. In a frontend-only deployment the end user supplies their own token and it MUST remain client-side only; in a backend deployment the developer MAY supply it, or the end user MAY provide it per request over a secure (SSL/TLS) channel, in which case the backend MUST NOT log or persist it.
- **FR-006**: System MUST support an OpenAI-compatible LLM provider configurable with a custom base URL (to target local endpoints such as LM Studio).
- **FR-007**: System MUST expose a provider abstraction so additional providers can be added later without changing agent or workflow code.
- **FR-007a**: System MUST accept per-model capability configuration from the caller, including `maxInputTokens` and `maxOutputTokens` and capability flags (e.g., supports vision, supports reasoning). The context-window-dependent behavior (e.g., compaction) MUST use the configured `maxInputTokens`, applying a conservative default only when unspecified.
- **FR-008**: System MUST read provider credentials/endpoints from injected configuration and MUST NOT hardcode, log, or expose them.
- **FR-008a**: System MUST automatically retry transient provider failures (HTTP 429 honoring any Retry-After header, 5xx, and network/timeout errors) using exponential backoff, bounded by a configurable maximum retry count; non-transient errors (e.g., authentication/4xx) MUST fail fast with a typed error and MUST NOT be retried.

#### Tools (Function Calling)

- **FR-009**: Users MUST be able to register local JavaScript functions as tools, each with a name, description, and typed input/output schema expressed as JSON Schema (following the MCP-popularized schema).
- **FR-010**: System MUST present registered tools to the agent so the model can decide when to invoke them.
- **FR-011**: System MUST validate tool arguments against the declared JSON Schema before invocation and reject invalid calls with a typed error.
- **FR-011a**: When the agent requests a nonexistent tool or supplies arguments that fail validation, the system MUST return the typed error (tool-not-found or invalid-arguments) to the model as a tool result so the agent can self-correct, bounded by the configured max-iteration cap, rather than aborting the run.
- **FR-012**: System MUST return tool results to the agent in a uniform, typed result form and surface tool failures as typed errors.
- **FR-012a**: Users MUST be able to enable or disable tools at granular levels — an entire MCP server (all its tools) or an individual tool (local or MCP-provided) — so disabled tools are not presented to the agent.
- **FR-012b**: System MUST enforce a configurable maximum iteration/step count per agent run with a safe default; when exceeded, the run MUST stop and return a typed "limit exceeded" result. The cap MUST be configurable to -1 to allow unlimited iterations.
- **FR-012c**: System MUST enforce a configurable per-tool-call timeout (there is no per-run timeout); when a tool call exceeds its timeout, the framework MUST surface a typed timeout error for that call.
- **FR-012d**: System MUST NOT ship any built-in tools (including web search); it provides only the tool interface, and all tools are supplied by the consumer via local code or MCP servers.

#### MCP Integration

- **FR-013**: System MUST allow connecting an agent to one or more MCP servers and discovering the tools/resources they expose.
- **FR-013a**: System MUST support a remote MCP transport (HTTP + SSE / streamable HTTP) in all supported runtimes, including frontend/browser runtimes without process-spawn access.
- **FR-013b**: System MUST support a stdio MCP transport that launches a server from a configured command and arguments, available only when running in a runtime that permits process spawning (e.g., Node); when process spawning is unavailable, the framework MUST fall back to remote transport only and surface a clear typed error if a stdio connection is requested.
- **FR-014**: System MUST present MCP-provided tools to the agent through the same uniform tool interface used for local tools, regardless of transport.
- **FR-014a**: System MUST namespace tools by their source (e.g., `serverName.toolName`) so that tools from different MCP servers or local code are uniquely addressable and name collisions cannot occur.
- **FR-015**: System MUST handle MCP server unavailability gracefully, returning typed errors without crashing the run.

#### Skills

- **FR-016**: Users MUST be able to define skills from one or more sources (e.g., files, inline content, code) and attach them to agents. Each skill MUST have a top-level description used for relevance selection.
- **FR-017**: System MUST allow an agent to discover and use attached skills during a run via progressive disclosure: the agent evaluates only each skill's description against the prompt to decide relevance, and MUST load a skill's full content only after the skill is deemed needed — the full content MUST NOT be injected otherwise.
- **FR-017a**: System MUST index skills by their descriptions using keyword/text matching (no embeddings and no embedding provider) to make skill lookup and selection fast; indexing MUST run fully client-side.

#### Orchestration & Workflows

- **FR-018**: System MUST allow composing multiple agents into multi-agent workflows.
- **FR-019**: System MUST support sequential, concurrent, handoff, and group-collaboration orchestration patterns.
- **FR-019a**: System MUST allow an agent/step to signal workflow completion to end the workflow, AND MUST enforce a configurable max-rounds/turns safety cap (whichever occurs first). The cap MUST ship with a safe default and be configurable, including -1 for unlimited rounds.
- **FR-019b**: System MUST support a configurable per-workflow failure policy for concurrent execution: fail-soft (failed branches return typed errors, successful branches complete, and partial results are aggregated) or fail-fast (the first branch failure cancels remaining branches and the workflow returns an error). The default MUST be fail-soft.
- **FR-019c**: System MUST enforce a configurable maximum concurrency limit for parallel agent/tool calls, with a safe default and -1 permitted for unlimited concurrency.
- **FR-020**: System MUST support streaming workflow execution output.
- **FR-021**: System MUST support human-in-the-loop pause/resume points within a workflow.
- **FR-021a**: When a workflow reaches a human-in-the-loop point, the system MUST yield a serializable "awaiting input" state (no server required); the host application collects the input and calls resume with it to continue the run.
- **FR-021b**: System MUST expose the workflow/agent execution status (e.g., running, awaiting input, completed, failed) so the host can report progress to the user, and MUST allow the host to supply input while the workflow is awaiting input.
- **FR-022**: System MUST support checkpointing workflow state and resuming from a saved checkpoint.
- **FR-022a**: When a checkpoint cannot be restored, the system MUST fail closed and return a clear typed error that distinguishes corrupt data from a version mismatch; it MUST NOT auto-fallback to a fresh run or partially restore state. The caller decides whether to start fresh.

#### Middleware

- **FR-023**: System MUST provide a middleware mechanism to intercept and process agent requests/responses (e.g., for custom pipelines, transformations, and error handling).

#### State Persistence

- **FR-024**: System MUST allow persisting and restoring conversation/thread state using storage available in a no-backend environment (e.g., browser storage), via a pluggable storage abstraction.

#### Observability

- **FR-025**: System MUST provide tracing/telemetry for agent and workflow execution (steps, tool calls, timing, status) using OpenTelemetry (OTel) as the canonical standard, with pluggable exporters and support for browser/edge runtimes.
- **FR-026**: System MUST ensure no secrets or credentials appear in logs, traces, or error messages.
- **FR-026a**: System MUST apply centralized redaction at every output boundary (logs, OpenTelemetry traces, and error serialization), scrubbing known credential fields/patterns before any data is emitted.

#### Declarative Definitions

- **FR-027**: System MUST allow defining agents declaratively in both YAML and JSON against a single shared schema, with the loader auto-detecting the format, and loading them into equivalent runnable agents.

#### Packaging & Runtime

- **FR-028**: System MUST be distributed as an installable JavaScript package with published TypeScript types for all public APIs.
- **FR-029**: System MUST be tree-shakeable so consumers only include the features they import.
- **FR-030**: System MUST operate without a dedicated backend and MUST run in environments hostable on Vercel without serverless functions (i.e., client-side and/or edge runtimes), avoiding hard dependencies on Node-only server APIs for core features.
- **FR-030a**: System MUST detect runtime capabilities (e.g., process spawning, available storage) at runtime so core features work across browser, edge, and Node; when a feature unsupported in the current runtime is requested (e.g., stdio MCP spawn in a browser), the system MUST throw a clear typed "unsupported in this runtime" error rather than failing obscurely.
- **FR-031**: System MUST provide a single agent-facing usage guide (markdown) that any agent can be handed to understand how to install, configure, and use the package, kept in sync with the public API.
- **FR-031a**: Documentation MUST explain the credential-handling model: in frontend-only deployments the end user supplies and retains their own token client-side; in backend deployments the developer may supply it or the user sends it per request over SSL/TLS, and the backend must never log or persist it.
- **FR-032**: System MUST document every public API with examples.
- **FR-032a**: Documentation MUST describe every configurable safeguard/knob — max iterations, per-tool-call timeout, workflow max-rounds, concurrent failure policy, and max concurrency — including defaults and how developers/agents can customize them.

### Key Entities _(include if feature involves data)_

- **Agent**: A configured actor with a name, instructions, an associated provider, and optional tools and skills; can be run with input to produce output.
- **Provider**: An abstraction over an LLM backend (GitHub Copilot, OpenAI-compatible/LM Studio) responsible for turning agent requests into model responses; configured with per-model capabilities including `maxInputTokens`, `maxOutputTokens`, and feature flags (e.g., vision, reasoning).
- **Tool**: A callable capability with a name, description, and JSON Schema typed input/output; may originate from local code or an MCP server; namespaced by source (e.g., `server.tool`) and individually enable/disable-able.
- **MCP Connection**: A link to an MCP server exposing a set of tools/resources to one or more agents, established over either a remote transport (HTTP/SSE, available everywhere) or a stdio transport (spawned from a command + args, available only where process spawning is permitted).
- **Skill**: A domain-specific knowledge bundle assembled from one or more sources and attachable to agents; carries a top-level description used for relevance selection, with full content loaded only on demand (progressive disclosure).
- **Thread/Conversation**: The ordered context of an agent's interaction across turns; can be persisted and restored, and is automatically compacted (summarized) when it reaches a configurable fraction of the context window (default 90%).
- **Workflow**: A graph of agents and steps executed under an orchestration pattern, supporting streaming, human-in-the-loop, and checkpointing.
- **Checkpoint**: A saved snapshot of workflow/conversation state enabling resumption.
- **Middleware**: A pluggable interceptor in the request/response pipeline.
- **Trace/Span**: Structured observability data describing execution steps and timings.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A developer can create and run a working single agent against a supported provider in under 10 minutes starting from installation, using only the documentation.
- **SC-002**: 100% of the feature categories present in the reference framework that are in scope here — agents, tools, MCP, skills, workflows/orchestration, middleware, state persistence, observability, declarative definitions — are usable through the package's public API.
- **SC-003**: An agent equipped with a function tool correctly invokes that tool and incorporates its result in at least 95% of runs where the prompt unambiguously requires the tool.
- **SC-004**: A multi-agent workflow using each supported pattern (sequential, concurrent, handoff, group) can be built and run to completion using only documented APIs.
- **SC-005**: The package runs in a no-backend deployment hostable on Vercel without serverless functions, demonstrated by a sample app that creates and orchestrates agents entirely from client/edge code.
- **SC-006**: No secret or credential value appears in any log, trace, or error output across all supported features (verified by automated checks).
- **SC-007**: Every public API entry point has documentation with at least one usage example, and the agent-facing usage guide stays consistent with the public API.
- **SC-008**: A workflow can be checkpointed and resumed, producing the same final outcome as an uninterrupted run for a deterministic scenario.

## Assumptions

- Only GitHub Copilot (via Copilot SDK) and OpenAI-compatible providers (e.g., LM Studio) are required initially; the provider abstraction anticipates more later, but no other providers are in scope now.
- "No backend / no serverless functions" means core agent and orchestration logic runs in the browser and/or edge runtime; any provider that requires a secret-bearing call is the consumer's responsibility to expose safely, and the framework will not assume a long-running server.
- Credentials are always injected via a caller-supplied callback and never bundled or persisted by the framework. In frontend-only deployments the end user (not the developer) supplies their own token, which stays client-side; in backend deployments the developer may supply it, or the user sends it per request over SSL/TLS and the backend must not log or persist it.
- "All features" refers to the capability categories of the reference framework (agents, tools, MCP, skills, workflows, middleware, observability, declarative agents, state persistence); exact API shapes are JavaScript-idiomatic equivalents, not literal ports of .NET/Python APIs.
- TypeScript is the implementation/typing language for published types, while the package remains consumable from plain JavaScript.
- Persistence in the no-backend context uses storage available to the runtime (e.g., browser local/session/IndexedDB storage) via a pluggable abstraction; no database server is assumed.- Hosted/cloud-specific features of the reference framework (e.g., Foundry-hosted agents, durable-task server hosting) are out of scope for this no-backend package.
- Industry-standard defaults apply for timeouts, retry/backoff on provider calls, and user-friendly error messages unless otherwise specified.
