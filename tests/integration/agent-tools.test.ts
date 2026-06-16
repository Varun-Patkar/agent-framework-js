import { describe, it, expect } from "vitest";
import { createAgent } from "../../src/agents/agent.js";
import { defineTool } from "../../src/tools/tool.js";
import { mockProvider, toolCall } from "../helpers/mockProvider.js";

describe("US2 agent + tools (integration)", () => {
	it("invokes a function tool and incorporates the result", async () => {
		let called = false;
		const add = defineTool({
			name: "add",
			description: "Add two numbers",
			inputSchema: {
				type: "object",
				properties: { a: { type: "number" }, b: { type: "number" } },
				required: ["a", "b"],
			},
			run: async ({ a, b }: { a: number; b: number }) => {
				called = true;
				return { sum: a + b };
			},
		});

		const agent = createAgent({
			name: "Calc",
			instructions: "use tools",
			tools: [add],
			provider: mockProvider({
				responses: [
					{ text: "", toolCalls: [toolCall("add", { a: 2, b: 3 })] },
					{ text: "The sum is 5" },
				],
			}),
		});

		const res = await agent.run("what is 2+3?");
		expect(called).toBe(true);
		expect(res.output).toBe("The sum is 5");
	});

	it("feeds invalid-argument errors back so the agent can self-correct", async () => {
		const requests: number[] = [];
		const add = defineTool({
			name: "add",
			description: "Add",
			inputSchema: {
				type: "object",
				properties: { a: { type: "number" }, b: { type: "number" } },
				required: ["a", "b"],
			},
			run: async ({ a, b }: { a: number; b: number }) => ({ sum: a + b }),
		});

		const agent = createAgent({
			name: "Calc",
			instructions: "use tools",
			tools: [add],
			provider: mockProvider({
				onRequest: (req) => requests.push(req.messages.length),
				responses: [
					{ text: "", toolCalls: [toolCall("add", { a: "bad" })] }, // invalid
					{ text: "fixed" }, // self-correct
				],
			}),
		});

		const res = await agent.run("add");
		expect(res.output).toBe("fixed");
		// Second request includes the tool error message fed back.
		expect(requests.length).toBe(2);
		expect(requests[1]).toBeGreaterThan(requests[0]);
	});
});
