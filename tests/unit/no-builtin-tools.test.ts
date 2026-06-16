import { describe, it, expect } from "vitest";
import { createAgent } from "../../src/agents/agent.js";
import { ToolRegistry } from "../../src/tools/registry.js";
import { mockProvider } from "../helpers/mockProvider.js";

describe("no built-in tools (FR-012d)", () => {
	it("a fresh registry exposes zero tools", () => {
		expect(new ToolRegistry().list()).toHaveLength(0);
		expect(new ToolRegistry().specs()).toHaveLength(0);
	});

	it("an agent created without tools sends no tool specs to the provider", async () => {
		let toolsSeen: unknown;
		const agent = createAgent({
			name: "NoTools",
			instructions: "x",
			provider: mockProvider({ onRequest: (req) => (toolsSeen = req.tools), responses: [{ text: "ok" }] }),
		});
		await agent.run("hi");
		expect(toolsSeen).toBeUndefined();
	});
});
