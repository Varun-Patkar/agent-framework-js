/**
 * Backend example 3 — Multi-agent WORKFLOW with visual ordering.
 *
 * A `sequential` workflow runs three agents in a fixed order:
 *
 *     Planner  →  Calculator  →  Summarizer
 *
 * Each agent receives the previous agent's output. We consume `wf.runStream`,
 * which emits one `round` event per completed step; because the pattern is
 * sequential, round N corresponds to `agents[N-1]`. We forward that to the UI as
 * SSE so it can light up each node in order with its output.
 *
 * The Calculator agent uses the calculator MCP server (stdio or http).
 *
 * @packageDocumentation
 */

import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createCopilotProvider, createOpenAICompatibleProvider, type Provider } from "agent-framework-js/providers";
import { connectMCP, type MCPTransport } from "agent-framework-js/mcp";
import { createAgent } from "agent-framework-js/agents";
import { createWorkflow } from "agent-framework-js/workflows";

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

const app = Fastify();
await app.register(fastifyStatic, { root: join(__dirname, "..", "public") });

/** POST /api/workflow — run the sequential workflow and stream node-by-node progress. */
app.post("/api/workflow", async (req, reply) => {
	const { provider, mcp, prompt } = req.body as {
		provider: "copilot" | "lmstudio";
		mcp: "stdio" | "http";
		prompt: string;
	};

	reply.raw.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
	const send = (event: string, data: unknown) => reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

	let calc: Awaited<ReturnType<typeof connectCalculator>> | undefined;
	try {
		const p = makeProvider(provider);
		calc = await connectCalculator(mcp);

		const planner = createAgent({
			name: "Planner",
			instructions: "Break the user's request into a short, numbered calculation plan. Be brief.",
			provider: p,
		});
		const calculator = createAgent({
			name: "Calculator",
			instructions: "Execute the plan using the calc.calculate tool. Report each numeric result.",
			provider: p,
			tools: calc.tools,
		});
		const summarizer = createAgent({
			name: "Summarizer",
			instructions: "Write a clear final answer for the user based on the computed results.",
			provider: p,
		});

		const agents = [planner, calculator, summarizer];
		// Tell the UI the node order up front so it can draw the pipeline.
		send("plan", { agents: agents.map((a) => a.name) });

		const wf = createWorkflow({ pattern: "sequential", agents });
		// Sequential: round N completes agents[N-1]. Light up nodes in order.
		for await (const ev of wf.runStream(prompt)) {
			if (ev.type === "round") {
				const idx = ev.round - 1;
				send("step", { index: idx, name: agents[idx]?.name, output: ev.output });
			} else if (ev.type === "done") {
				send("done", { status: ev.state.status, output: ev.state.output });
			}
		}
	} catch (err) {
		send("error", { message: (err as Error).message });
	} finally {
		await calc?.close();
		reply.raw.end();
	}
});

const port = Number(process.env.PORT ?? 3003);
await app.listen({ port });
console.log(`\n  Workflow (backend)  →  http://localhost:${port}\n`);
