import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Tree-shaking guard: importing the `agents` entry must not statically pull in
 * heavy/runtime-specific modules (MCP, YAML, workflows). We assert the source of
 * the agents barrel does not statically import those modules. (FR-029)
 */
describe("tree-shaking boundaries", () => {
	const read = (p: string) => readFileSync(resolve(__dirname, "../../", p), "utf8");

	it("agents barrel does not statically import mcp/declarative/workflows", () => {
		const src = read("src/agents/index.ts") + read("src/agents/agent.ts");
		expect(src).not.toMatch(/from "\.\.\/mcp/);
		expect(src).not.toMatch(/from "\.\.\/declarative/);
		expect(src).not.toMatch(/from "\.\.\/workflows/);
	});

	it("MCP and declarative load heavy deps lazily via dynamic import", () => {
		expect(read("src/mcp/connection.ts")).toMatch(/await import\(/);
		expect(read("src/declarative/loader.ts")).toMatch(/await import\("yaml"\)/);
	});
});
