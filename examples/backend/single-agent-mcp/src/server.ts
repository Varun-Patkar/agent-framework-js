/**
 * Backend example 1 — Single-turn agent with a calculator MCP server.
 *
 * What this demonstrates from `agent-framework-js`:
 *   - Creating a provider with a runtime toggle: GitHub Copilot OR LM Studio.
 *   - Connecting an MCP server over BOTH transports the backend supports:
 *       • stdio  — spawns `bunx @cyanheads/calculator-mcp-server` (Node-only).
 *       • http   — talks to the hosted streamable-http calculator server.
 *   - Building a single agent from the discovered MCP tools and streaming a run.
 *
 * Backend nuances captured here (vs. the frontend twin):
 *   - The Copilot token is read SERVER-SIDE from `.env` (`COPILOT_TOKEN`) and is
 *     never sent to the browser.
 *   - stdio MCP works here because process spawning is allowed in Node.
 *
 * @packageDocumentation
 */

import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createCopilotProvider, createOpenAICompatibleProvider } from "agent-framework-js/providers";
import { connectMCP, type MCPTransport } from "agent-framework-js/mcp";
import { createAgent } from "agent-framework-js/agents";
import type { Provider } from "agent-framework-js/providers";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Build a provider from the UI toggle. Credentials stay on the server. */
function makeProvider(kind: "copilot" | "lmstudio"): Provider {
	if (kind === "copilot") {
		const token = process.env.COPILOT_TOKEN;
		if (!token) throw new Error("COPILOT_TOKEN is not set in examples/.env");
		// getCredential is a callback so the token is never persisted or logged.
		return createCopilotProvider({
			getCredential: () => token,
			capabilities: {
				model: process.env.COPILOT_MODEL ?? "gpt-4o",
				maxInputTokens: 128000,
				maxOutputTokens: 16000,
			},
		});
	}
	// LM Studio: an OpenAI-compatible server the user runs locally. No real key.
	return createOpenAICompatibleProvider({
		baseUrl: process.env.LMSTUDIO_BASE_URL ?? "http://localhost:1234/v1",
		getCredential: () => "lm-studio",
		capabilities: {
			model: process.env.LMSTUDIO_MODEL ?? "local-model",
			maxInputTokens: 262144,
			maxOutputTokens: 32000,
		},
	});
}

/** Connect the calculator MCP server over the chosen transport and return its tools. */
async function connectCalculator(kind: "stdio" | "http") {
	const transport: MCPTransport =
		kind === "stdio"
			? // Node-only: spawn the calculator server process.
				{ kind: "stdio", command: "bunx", args: ["@cyanheads/calculator-mcp-server@latest"] }
			: // Works everywhere: hosted streamable-http endpoint.
				{ kind: "remote", url: process.env.MCP_HTTP_URL ?? "https://calculator.caseyjhand.com/mcp" };

	const mcp = await connectMCP({ id: "calc", transport });
	await mcp.connect();
	const tools = await mcp.listTools(); // namespaced as calc.<tool>
	return { tools, close: () => mcp.close() };
}

const app = Fastify();
await app.register(fastifyStatic, { root: join(__dirname, "..", "public") });

/**
 * POST /api/run — run the agent once and stream the answer back as SSE.
 * Body: { provider: "copilot"|"lmstudio", mcp: "stdio"|"http", prompt: string }
 */
app.post("/api/run", async (req, reply) => {
	const { provider, mcp, prompt } = req.body as {
		provider: "copilot" | "lmstudio";
		mcp: "stdio" | "http";
		prompt: string;
	};

	reply.raw.writeHead(200, {
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-cache",
		Connection: "keep-alive",
	});
	const send = (event: string, data: unknown) =>
		reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

	let calc: Awaited<ReturnType<typeof connectCalculator>> | undefined;
	try {
		calc = await connectCalculator(mcp);
		send("tools", { names: calc.tools.map((t) => t.name) });

		const agent = createAgent({
			name: "Calculator",
			instructions:
				"You are a precise calculator. Use the calc.calculate tool for any arithmetic, " +
				"algebra, or derivative. Show the final result clearly.",
			provider: makeProvider(provider),
			tools: calc.tools,
		});

		for await (const chunk of agent.runStream(prompt)) {
			if (chunk.type === "text") send("text", { text: chunk.text });
			else if (chunk.type === "reasoning") send("reasoning", { text: chunk.text });
			else if (chunk.type === "done") send("done", { status: chunk.result.status });
		}
	} catch (err) {
		send("error", { message: (err as Error).message });
	} finally {
		await calc?.close();
		reply.raw.end();
	}
});

const port = Number(process.env.PORT ?? 3001);
await app.listen({ port });
console.log(`\n  Single-agent + MCP (backend)  →  http://localhost:${port}\n`);
