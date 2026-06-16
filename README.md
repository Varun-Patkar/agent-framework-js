# agent-framework-js

A modular, tree-shakeable JavaScript/TypeScript framework for building and orchestrating AI agents
in **no-backend** deployments — browser, edge runtimes (e.g. Vercel without serverless functions),
and Node. It mirrors the in-scope capability set of Microsoft Agent Framework: agents, code tools,
MCP, skills, multi-agent workflows, middleware, persistence, and OpenTelemetry observability.

LLM providers are intentionally limited to **GitHub Copilot** and **OpenAI-compatible** endpoints
(e.g. LM Studio) behind a pluggable abstraction.

## Install

```bash
npm install agent-framework-js
```

Optional peer dependencies (installed only if you use the feature):

- `@modelcontextprotocol/sdk` — MCP integration
- `@opentelemetry/api` — tracing
- `yaml` — YAML declarative definitions

## Quick start

```ts
import { createAgent, createOpenAICompatibleProvider } from "agent-framework-js";

const provider = createOpenAICompatibleProvider({
  baseUrl: "http://localhost:1234/v1", // LM Studio
  getCredential: () => process.env.LMSTUDIO_KEY ?? "",
  capabilities: { model: "local-model", maxInputTokens: 262144, maxOutputTokens: 32000 },
});

const agent = createAgent({ name: "Helper", instructions: "Be concise.", provider });
const res = await agent.run("Say hello.");
console.log(res.status, res.output);
```

Prefer **deep imports** for the smallest bundle: `agent-framework-js/agents`,
`/providers`, `/tools`, `/mcp`, `/skills`, `/workflows`, `/middleware`, `/persistence`,
`/observability`, `/declarative`.

## Features

| Area          | Entry           | Notes                                                                        |
| ------------- | --------------- | ---------------------------------------------------------------------------- |
| Agents        | `agents`        | text + multimodal input, streaming, reasoning field, threads with compaction |
| Providers     | `providers`     | Copilot + OpenAI-compatible; caller-injected credentials; retry/backoff      |
| Tools         | `tools`         | local function tools, JSON-Schema validation, namespacing, enable/disable    |
| MCP           | `mcp`           | remote (HTTP/SSE) everywhere; stdio in Node only                             |
| Skills        | `skills`        | progressive disclosure; client-side keyword index                            |
| Workflows     | `workflows`     | sequential / concurrent / handoff / group; HITL; checkpoints                 |
| Middleware    | `middleware`    | request/response pipeline                                                    |
| Persistence   | `persistence`   | in-memory + browser (localStorage/IndexedDB)                                 |
| Observability | `observability` | OpenTelemetry spans with secret redaction                                    |
| Declarative   | `declarative`   | YAML or JSON agent definitions                                               |

## Credential handling

Credentials are **always** supplied via a callback and are never bundled, persisted, or logged.

- **Frontend-only**: the end user supplies their own token; it stays client-side.
- **Backend**: the developer may supply it, or the user sends it per request over SSL/TLS — and the
  backend must never log or persist it.

## Configurable safeguards (defaults & customization)

All safeguards ship with safe defaults and are fully overridable. Set a value to `-1` for unlimited
where noted.

| Knob                  | Where            | Default      | Notes                                          |
| --------------------- | ---------------- | ------------ | ---------------------------------------------- |
| `maxIterations`       | `createAgent`    | `10`         | `-1` = unlimited tool-call iterations          |
| `toolTimeoutMs`       | `createAgent`    | none         | per-tool-call timeout                          |
| `compactionThreshold` | `createAgent`    | `0.9`        | fraction of `maxInputTokens` before compaction |
| `compactionModel`     | `createAgent`    | own provider | override model for summaries                   |
| `retry.maxRetries`    | provider         | `3`          | transient-error retries (429/5xx/network)      |
| `maxRounds`           | `createWorkflow` | `16`         | `-1` = unlimited; or end via completion signal |
| `failurePolicy`       | `createWorkflow` | `fail-soft`  | or `fail-fast`                                 |
| `maxConcurrency`      | `createWorkflow` | `4`          | `-1` = unlimited parallel agent/tool calls     |

## Runtime support

Core features use only web-standard APIs and run in browser, edge, and Node. Node-only features
(stdio MCP, filesystem storage) are gated by runtime detection and throw a typed
`RuntimeUnsupportedError` when unavailable.

## Scripts

```bash
npm run build      # dual ESM + CJS + .d.ts
npm test           # vitest
npm run lint
npm run typecheck
```

## License

MIT
