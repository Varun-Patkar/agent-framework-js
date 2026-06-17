import { describe, it, expect } from "vitest";
import { createAgent } from "../../src/agents/agent.js";
import { mockProvider, toolCall } from "../helpers/mockProvider.js";

describe("US1 agent (contract)", () => {
	it("runs and returns text", async () => {
		const agent = createAgent({
			name: "Helper",
			instructions: "Be concise.",
			provider: mockProvider({ responses: [{ text: "hi there" }] }),
		});
		const res = await agent.run("hello");
		expect(res.status).toBe("completed");
		expect(res.output).toBe("hi there");
	});

	it("streams incremental chunks then a done result", async () => {
		const agent = createAgent({
			name: "S",
			instructions: "x",
			provider: mockProvider({}),
		});
		const chunks: string[] = [];
		let final = "";
		for await (const c of agent.runStream("hi")) {
			if (c.type === "text") chunks.push(c.text);
			if (c.type === "done") final = c.result.output;
		}
		expect(chunks.join("")).toBe("hello");
		expect(final).toBe("hello");
	});

	it("exposes reasoning only for reasoning-capable models", async () => {
		const withReasoning = createAgent({
			name: "R",
			instructions: "x",
			provider: mockProvider({
				capabilities: { supportsReasoning: true },
				responses: [{ text: "answer", reasoning: "because" }],
			}),
		});
		const a = await withReasoning.run("q");
		expect(a.reasoning).toBe("because");

		const noReasoning = createAgent({
			name: "N",
			instructions: "x",
			provider: mockProvider({ responses: [{ text: "answer", reasoning: "hidden" }] }),
		});
		const b = await noReasoning.run("q");
		expect(b.reasoning).toBeUndefined();
	});

	it("rejects image input for non-vision models with a typed error", async () => {
		const agent = createAgent({
			name: "V",
			instructions: "x",
			provider: mockProvider({}),
		});
		const res = await agent.run({
			role: "user",
			parts: [{ type: "image", data: "data:image/png;base64,AAA", mimeType: "image/png" }],
		});
		expect(res.status).toBe("failed");
		expect(res.error?.kind).toBe("provider");
	});

	it("returns limit-exceeded when iteration cap is hit", async () => {
		// Always returns a tool call → loop never converges.
		const agent = createAgent({
			name: "Loop",
			instructions: "x",
			maxIterations: 2,
			provider: mockProvider({
				responses: [
					{ text: "", toolCalls: [toolCall("noop", {})] },
					{ text: "", toolCalls: [toolCall("noop", {})] },
					{ text: "", toolCalls: [toolCall("noop", {})] },
				],
			}),
			tools: [
				{
					name: "noop",
					description: "noop",
					inputSchema: { type: "object" },
					source: "local",
					run: async () => "ok",
				},
			],
		});
		const res = await agent.run("go");
		expect(res.status).toBe("limit-exceeded");
		// A looping model must not yield a blank answer: fall back to the last
		// successful tool result so callers (e.g. a workflow node) show something.
		expect(res.output).toBe(JSON.stringify("ok"));
	});
});
