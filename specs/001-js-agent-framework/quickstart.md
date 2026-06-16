# Quickstart: JavaScript Agent Framework

Validation guide proving the in-scope features work end-to-end. Code snippets are illustrative of the
public API defined in [contracts/](contracts/); see [data-model.md](data-model.md) for entity shapes.

## Prerequisites

- Node 18+ (for development/tests) and/or a browser/edge target (for no-backend deployment).
- One LLM provider reachable:
  - LM Studio running locally with an OpenAI-compatible endpoint, **or**
  - A GitHub Copilot token supplied via callback.
- Install: `npm install agent-framework-js`

## Setup (dev)

```bash
npm install
npm run build      # tsc → ESM + CJS + .d.ts
npm test           # vitest unit + integration + contract + secret-leak scan
```

## Scenario 1 — Single agent (User Story 1, P1)

```ts
import {
	createAgent,
	createOpenAICompatibleProvider,
} from "agent-framework-js";

const provider = createOpenAICompatibleProvider({
	baseUrl: "http://localhost:1234/v1",
	getCredential: () => process.env.LMSTUDIO_KEY ?? "",
	capabilities: {
		model: "local-model",
		maxInputTokens: 262144,
		maxOutputTokens: 32000,
	},
});

const agent = createAgent({
	name: "Helper",
	instructions: "Be concise.",
	provider,
});
const res = await agent.run("Say hello.");
console.log(res.status, res.output);
```

**Expected**: `status: "completed"` and a text answer. Streaming via `agent.runStream(...)` yields
incremental chunks. Invalid endpoint → typed error, no secret in the message. _(FR-001/002/003/008a)_

## Scenario 2 — Code tool / function calling (User Story 2, P1)

```ts
import { defineTool } from "agent-framework-js";

const add = defineTool({
	name: "add",
	description: "Add two numbers.",
	inputSchema: {
		type: "object",
		properties: { a: { type: "number" }, b: { type: "number" } },
		required: ["a", "b"],
	},
	run: async ({ a, b }) => ({ sum: a + b }),
});

const agent = createAgent({
	name: "Calc",
	instructions: "Use tools.",
	provider,
	tools: [add],
});
const res = await agent.run("What is 2 + 3?");
```

**Expected**: tool invoked with validated args; result reflected in the answer. Invalid args →
typed error fed back for self-correction within the iteration cap. _(FR-009/010/011/011a/012b)_

## Scenario 3 — MCP server (User Story 3, P2)

```ts
import { connectMCP } from "agent-framework-js";
const mcp = await connectMCP({
	id: "docs",
	transport: { kind: "remote", url: "https://mcp.example.com" },
});
const tools = await mcp.listTools(); // namespaced as docs.<tool>
const agent = createAgent({
	name: "Researcher",
	instructions: "Use docs.",
	provider,
	tools,
});
```

**Expected**: MCP tools appear via the standard Tool contract, namespaced by `docs`. A stdio
transport in a browser runtime throws `RuntimeUnsupportedError`. _(FR-013/013a/013b/014/014a/030a)_

## Scenario 4 — Skill (User Story 4, P2)

```ts
import { defineSkill } from "agent-framework-js";
const skill = defineSkill({
	name: "refund-policy",
	description: "Company refund and return rules.",
	sources: [{ kind: "inline", content: "Refunds allowed within 30 days..." }],
});
const agent = createAgent({
	name: "Support",
	instructions: "Help users.",
	provider,
	skills: [skill],
});
```

**Expected**: only the description is matched against the prompt; full content loaded only when the
skill is deemed relevant. _(FR-016/017/017a)_

## Scenario 5 — Multi-agent workflow (User Story 5, P2)

```ts
import { createWorkflow } from "agent-framework-js";
const wf = createWorkflow({
	pattern: "sequential",
	agents: [researcher, summarizer],
});
let state = await wf.run("Summarize the latest notes.");
if (state.status === "awaiting-input") {
	state = await wf.resume(state, "approved"); // human-in-the-loop
}
```

**Expected**: sequential passes output A→B; concurrent aggregates (fail-soft default); handoff
delegates; group collaborates. Workflow ends on completion signal or `maxRounds`. A checkpoint
resumes deterministically; a corrupt/version-mismatched checkpoint fails closed.
_(FR-018/019/019a/019b/019c/020/021/021a/021b/022/022a)_

## Scenario 6 — Persist & resume a thread (User Story 6, P3)

```ts
import { createBrowserStore } from "agent-framework-js";
const store = createBrowserStore({ backend: "indexeddb", namespace: "chat" });
// save after a turn, reload page, load by id, continue the conversation
```

**Expected**: restored thread retains prior context. _(FR-024)_

## Scenario 7 — Observability (User Story 7, P3)

```ts
import { configureObservability } from "agent-framework-js";
configureObservability({ tracer: myOtelTracer, enabled: true });
```

**Expected**: OTel spans for run/tool/provider/workflow; no secret appears in any span/log/error.
_(FR-025/026/026a, SC-006)_

## Scenario 8 — Declarative agent (User Story 8, P3)

```ts
import { loadAgentDefinition } from "agent-framework-js";
const agent = loadAgentDefinition(yamlOrJsonString, {
	providerFactory,
	getCredential: () => process.env.LMSTUDIO_KEY ?? "",
});
```

**Expected**: equivalent YAML and JSON definitions both produce a working agent matching the
programmatic build. _(FR-027)_

## Success validation

| Spec criterion                          | Validated by                        |
| --------------------------------------- | ----------------------------------- |
| SC-001 single agent < 10 min            | Scenario 1 + README                 |
| SC-002 all capability categories usable | Scenarios 1–8                       |
| SC-003 tool invoked when required       | Scenario 2 integration test         |
| SC-004 all workflow patterns run        | Scenario 5 contract tests           |
| SC-005 no-backend Vercel host           | browser/edge build of Scenarios 1–5 |
| SC-006 no secret leakage                | secret-leak scan (Scenario 7)       |
| SC-007 documented public API            | TSDoc + AGENT_USAGE.md (post-impl)  |
| SC-008 checkpoint resume deterministic  | Scenario 5 resume test              |
