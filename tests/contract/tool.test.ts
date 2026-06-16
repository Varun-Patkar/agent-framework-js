import { describe, it, expect } from "vitest";
import { ToolRegistry, namespacedName } from "../../src/tools/registry.js";
import { defineTool } from "../../src/tools/tool.js";

const add = defineTool({
	name: "add",
	description: "Add two numbers",
	inputSchema: {
		type: "object",
		properties: { a: { type: "number" }, b: { type: "number" } },
		required: ["a", "b"],
	},
	run: async ({ a, b }: { a: number; b: number }) => ({ sum: a + b }),
});

describe("US2 tools (contract)", () => {
	it("validates arguments and runs the tool", async () => {
		const reg = new ToolRegistry([add]);
		const ok = await reg.invoke("add", { a: 2, b: 3 });
		expect(ok.error).toBeUndefined();
		expect(ok.value).toEqual({ sum: 5 });
	});

	it("returns invalid-arguments error (for self-correction) on bad args", async () => {
		const reg = new ToolRegistry([add]);
		const bad = await reg.invoke("add", { a: "x" });
		expect(bad.error?.reason).toBe("invalid-arguments");
	});

	it("returns not-found for unknown tools", async () => {
		const reg = new ToolRegistry([]);
		const res = await reg.invoke("missing", {});
		expect(res.error?.reason).toBe("not-found");
	});

	it("namespaces tools by source so collisions cannot occur", () => {
		expect(namespacedName({ name: "search", source: "local" })).toBe("search");
		expect(namespacedName({ name: "search", source: "docs" })).toBe("docs.search");
		const reg = new ToolRegistry([
			{ ...add, name: "search", source: "local", run: async () => 1 },
			{ ...add, name: "search", source: "docs", run: async () => 2 },
		]);
		const names = reg.list().length;
		expect(names).toBe(2);
	});

	it("does not present disabled tools", () => {
		const reg = new ToolRegistry([add]);
		reg.disable("add");
		expect(reg.specs().find((s) => s.name === "add")).toBeUndefined();
	});

	it("enforces a per-tool-call timeout", async () => {
		const slow = defineTool({
			name: "slow",
			description: "slow",
			inputSchema: { type: "object" },
			run: async () => new Promise((r) => setTimeout(() => r("late"), 50)),
		});
		const reg = new ToolRegistry([slow]);
		const res = await reg.invoke("slow", {}, 5);
		expect(res.error?.reason).toBe("timeout");
	});
});
