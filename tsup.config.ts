import { defineConfig } from "tsup";

// Dual ESM + CJS build with per-module entry points so consumers can deep-import
// (e.g. `agent-framework-js/agents`) and tree-shake unused modules. (FR-028, FR-029)
export default defineConfig({
	entry: [
		"src/index.ts",
		"src/agents/index.ts",
		"src/providers/index.ts",
		"src/tools/index.ts",
		"src/mcp/index.ts",
		"src/skills/index.ts",
		"src/workflows/index.ts",
		"src/middleware/index.ts",
		"src/persistence/index.ts",
		"src/observability/index.ts",
		"src/declarative/index.ts",
	],
	format: ["esm", "cjs"],
	dts: true,
	sourcemap: true,
	clean: true,
	treeshake: true,
	splitting: true,
	outExtension({ format }) {
		return { js: format === "cjs" ? ".cjs" : ".js" };
	},
});
