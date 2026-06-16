import { describe, it, expect, afterEach } from "vitest";
import { connectMCP } from "../../src/mcp/connection.js";
import { mcpToolToTool } from "../../src/mcp/adapter.js";
import { resetRuntimeCache } from "../../src/core/runtime.js";

describe("US3 MCP (contract)", () => {
	afterEach(() => resetRuntimeCache());

	it("namespaces MCP tools by server id", () => {
		const tool = mcpToolToTool(
			"docs",
			{ name: "search", description: "d", inputSchema: { type: "object" } },
			{ async callTool() { } },
		);
		expect(tool.source).toBe("docs");
		expect(tool.name).toBe("search");
	});

	it("invokes an MCP tool via the client", async () => {
		let called = false;
		const tool = mcpToolToTool(
			"docs",
			{ name: "search", description: "d", inputSchema: { type: "object" } },
			{
				async callTool(req: { name: string; arguments: unknown }) {
					called = true;
					expect(req.name).toBe("search");
					return { content: "result" };
				},
			},
		);
		const res = await tool.run({ q: "x" });
		expect(called).toBe(true);
		expect(res).toBe("result");
	});

	it("throws a typed unsupported error for stdio where spawning is unavailable", async () => {
		// Simulate a non-Node runtime by removing process detection.
		const original = (globalThis as Record<string, unknown>)["process"];
		(globalThis as Record<string, unknown>)["process"] = undefined;
		resetRuntimeCache();
		try {
			const conn = await connectMCP({
				id: "local",
				transport: { kind: "stdio", command: "node", args: ["server.js"] },
			});
			await expect(conn.connect()).rejects.toMatchObject({ kind: "runtime-unsupported" });
		} finally {
			(globalThis as Record<string, unknown>)["process"] = original;
			resetRuntimeCache();
		}
	});
});
