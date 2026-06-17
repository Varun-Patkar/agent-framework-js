/**
 * Backend example 2 — Multi-turn orchestrator with two subagents.
 *
 * Topology:
 *
 *        ┌────────────────┐
 *        │  Orchestrator  │   (keeps a multi-turn Thread across messages)
 *        └──────┬─────────┘
 *         ask_math│  │ask_writer
 *        ┌───────▼┐ ┌▼──────────┐
 *        │ Math   │ │  Writer   │
 *        │ agent  │ │  agent    │
 *        │(calc   │ │ (plain    │
 *        │ MCP)   │ │  LLM)     │
 *        └────────┘ └───────────┘
 *
 * The two subagents are exposed to the orchestrator as ordinary tools
 * (`defineTool`) whose `run` delegates to `subagent.run(...)`. Each delegation
 * pushes an SSE event so the UI can show, in order, which subagent was used.
 *
 * Backend nuances: Copilot token comes from `.env` server-side; the Math agent's
 * calculator MCP can use stdio (Node-only) or http.
 *
 * @packageDocumentation
 */

import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createCopilotProvider, createOpenAICompatibleProvider, type Provider } from "agent-framework-js/providers";
import { connectMCP, type MCPTransport } from "agent-framework-js/mcp";
import { createAgent, type Thread } from "agent-framework-js/agents";
import { defineTool } from "agent-framework-js/tools";

const __dirname = dirname(fileURLToPath(import.meta.url));

function makeProvider(kind: "copilot" | "lmstudio"): Provider {
	if (kind === "copilot") {
		const token = process.env.COPILOT_TOKEN;
		if (!token) throw new Error("COPILOT_TOKEN is not set in examples/.env");
		return createCopilotProvider({
			getCredential: () => token,
			capabilities: { model: process.env.COPILOT_MODEL ?? "gpt-4o", maxInputTokens: 128000, maxOutputTokens: 16000 },
		});
	}
	return createOpenAICompatibleProvider({
		baseUrl: process.env.LMSTUDIO_BASE_URL ?? "http://localhost:1234/v1",
		getCredential: () => "lm-studio",
		capabilities: { model: process.env.LMSTUDIO_MODEL ?? "local-model", maxInputTokens: 262144, maxOutputTokens: 32000 },
	});
}

async function connectCalculator(kind: "stdio" | "http") {
	const transport: MCPTransport =
		kind === "stdio"
			? { kind: "stdio", command: "bunx", args: ["@cyanheads/calculator-mcp-server@latest"] }
			: { kind: "remote", url: process.env.MCP_HTTP_URL ?? "https://calculator.caseyjhand.com/mcp" };
	const mcp = await connectMCP({ id: "calc", transport });
	await mcp.connect();
	return { tools: await mcp.listTools(), close: () => mcp.close() };
}

/** Per-session conversation thread keeps the orchestrator multi-turn. */
const sessions = new Map<string, Thread>();

const app = Fastify();
await app.register(fastifyStatic, { root: join(__dirname, "..", "public") });

/** POST /api/chat — one user message; streams subagent activity + the answer. */
app.post("/api/chat", async (req, reply) => {
	const { sessionId, provider, mcp, message } = req.body as {
		sessionId: string;
		provider: "copilot" | "lmstudio";
		mcp: "stdio" | "http";
		message: string;
	};

	reply.raw.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
	const send = (event: string, data: unknown) => reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

	let calc: Awaited<ReturnType<typeof connectCalculator>> | undefined;
	try {
		const p = makeProvider(provider);
		calc = await connectCalculator(mcp);

		// --- Subagent 1: Math specialist (calculator MCP) ---
		const mathAgent = createAgent({
			name: "MathAgent",
			instructions: "You are a math specialist. Use the calc.calculate tool and return only the result.",
			provider: p,
			tools: calc.tools,
		});

		// --- Subagent 2: Writer specialist (plain LLM) ---
		const writerAgent = createAgent({
			name: "WriterAgent",
			instructions: "You are a concise writer. Turn facts into a friendly one-paragraph explanation.",
			provider: p,
		});

		// Expose each subagent to the orchestrator as a tool; emit order to the UI.
		const askMath = defineTool({
			name: "ask_math",
			description: "Delegate a calculation or math question to the Math specialist.",
			inputSchema: { type: "object", properties: { question: { type: "string" } }, required: ["question"] },
			run: async ({ question }: { question: string }) => {
				send("subagent", { name: "MathAgent", phase: "start", input: question });
				const r = await mathAgent.run(question);
				send("subagent", { name: "MathAgent", phase: "end", output: r.output });
				return { answer: r.output };
			},
		});
		const askWriter = defineTool({
			name: "ask_writer",
			description: "Delegate prose writing / explanation to the Writer specialist.",
			inputSchema: { type: "object", properties: { task: { type: "string" } }, required: ["task"] },
			run: async ({ task }: { task: string }) => {
				send("subagent", { name: "WriterAgent", phase: "start", input: task });
				const r = await writerAgent.run(task);
				send("subagent", { name: "WriterAgent", phase: "end", output: r.output });
				return { text: r.output };
			},
		});

		const orchestrator = createAgent({
			name: "Orchestrator",
			instructions:
				"You coordinate two specialists. Use ask_math for any calculation and ask_writer to " +
				"compose explanations. Combine their results into a helpful final reply.",
			provider: p,
			tools: [askMath, askWriter],
		});

		// Resume this session's thread to stay multi-turn.
		const res = await orchestrator.run(message, { thread: sessions.get(sessionId) });
		sessions.set(sessionId, res.thread);
		send("answer", { text: res.output, status: res.status });
	} catch (err) {
		send("error", { message: (err as Error).message });
	} finally {
		await calc?.close();
		reply.raw.end();
	}
});

/** POST /api/reset — drop a session's thread to start a fresh conversation. */
app.post("/api/reset", async (req) => {
	sessions.delete((req.body as { sessionId: string }).sessionId);
	return { ok: true };
});

const port = Number(process.env.PORT ?? 3002);
await app.listen({ port });
console.log(`\n  Orchestrator + subagents (backend)  →  http://localhost:${port}\n`);
