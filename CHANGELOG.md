# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-06-16

### Fixed

- **Provider tool calling compatibility (Copilot / OpenAI / Anthropic-via-Copilot).** The
  OpenAI-compatible transport now:
  - **Sanitizes tool names on the wire** to `^[a-zA-Z0-9_-]+$` (dotted MCP names like
    `webiq.browse` → `webiq_browse`) and translates the model's tool-call name back to the
    registry key, so namespaced tools no longer 400. Registry keys and the `server.tool`
    namespacing are unchanged.
  - **Emits assistant `tool_calls` with `content: null`** for tool-call turns. The run loop now
    persists `toolCalls` (and any opaque reasoning blob) on the assistant `Message`, so strict
    providers (e.g. Anthropic) receive a `tool_use` paired with each tool result instead of
    rejecting orphaned tool messages.
  - **Accumulates streamed `delta.tool_calls[]` keyed by `index`** (fragments may start at a
    non-zero index when reasoning occupies 0/1), surfacing them as `tool-call` chunks and in the
    final `done` response.
  - **Transparently re-requests in streaming mode** from `generate` when a reasoning model reports
    `finish_reason: "tool_calls"` without a `tool_calls` array, and **fails loud with a typed
    `ProviderError`** if none materialize (previously the agent stopped silently).

### Added

- `createCopilotProvider` now sends the **required Copilot identification headers**
  (`Editor-Version`, `Editor-Plugin-Version`, `Copilot-Integration-Id`, `Openai-Intent`) by
  default; they are overridable via the new `headers` option.
- `createOpenAICompatibleProvider` gains a `headers` option to merge extra request headers
  (the `authorization` header is always credential-derived).
- `Message` gains optional `toolCalls` and `reasoningOpaque`; `GenerateResponse` gains
  `reasoningOpaque` for thinking continuity. All additive and backward compatible.

## [0.2.0] - 2026-06-16

### Added

- **Multi-model providers**: providers can now be configured with multiple models via `models`
  (with an optional `defaultModel`) — GitHub Copilot commonly exposes several, while
  OpenAI-compatible endpoints stay single-model via the `capabilities` shorthand. Select a model
  per request (`generate({ ..., model })`) or per agent (`createAgent({ ..., model })`). The
  `Provider` interface gains `models` and `model(name?)`, and `resolveModels()` is exported.
  Backward compatible: existing single-`capabilities` usage is unchanged.

### Changed

- The agent-facing usage guide is now shipped as a loadable skill at
  `.github/skills/agent-framework-usage/SKILL.md` (replacing the former `AGENT_USAGE.md`). All
  references (copilot-instructions, CONTRIBUTING, constitution, package.json) were updated and the
  README now points to the skill.

## [0.1.2] - 2026-06-16

### Changed

- Release pipeline switched to npm **trusted publishing (OIDC)** — token-free publishes
  with provenance from GitHub Actions.

## [0.1.1] - 2026-06-16

### Added

- npm publish metadata: `repository`, `bugs`, `homepage`, `publishConfig` (public access,
  provenance), and a `prepublishOnly` build/test guard.

## [0.1.0] - 2026-06-16

### Added

- Initial release of `agent-framework-js`, a modular, tree-shakeable agent framework for
  no-backend deployments (browser, edge, Node).
- **Agents**: create/run, streaming, reasoning output, multimodal (text + image) input gating,
  conversation threads with automatic compaction.
- **Providers**: GitHub Copilot and OpenAI-compatible (e.g. LM Studio) behind a pluggable
  abstraction, caller-injected credentials, exponential-backoff retry.
- **Tools**: uniform JSON-Schema tool contract, argument validation, source namespacing,
  per-tool enable/disable, per-call timeout, bounded tool-call loop with self-correction.
- **MCP**: remote (HTTP/SSE) transport everywhere and stdio in Node, adapted onto the tool
  contract with runtime capability gating.
- **Skills**: progressive disclosure with a client-side keyword index.
- **Workflows**: sequential, concurrent, handoff, and group patterns; completion signal +
  max-rounds cap; fail-soft/fail-fast policy; bounded concurrency; human-in-the-loop
  yield/resume; fail-closed checkpoints.
- **Middleware**: request/response pipeline around provider calls.
- **Persistence**: pluggable store with in-memory and browser (localStorage/IndexedDB) adapters.
- **Observability**: OpenTelemetry spans with centralized secret redaction.
- **Declarative**: YAML/JSON agent definitions with format auto-detection.
- Dual ESM + CJS build with TypeScript types and deep-import subpaths for tree-shaking.

[Unreleased]: https://github.com/Varun-Patkar/agent-framework-js/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/Varun-Patkar/agent-framework-js/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/Varun-Patkar/agent-framework-js/releases/tag/v0.1.1
[0.1.0]: https://github.com/Varun-Patkar/agent-framework-js/tree/v0.1.1
