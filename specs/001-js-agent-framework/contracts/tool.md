# Contract: Tool

Maps to FR-009, FR-010, FR-011, FR-011a, FR-012, FR-012a, FR-012d, FR-014a.

```ts
export interface Tool {
	name: string;
	description: string;
	inputSchema: JSONSchema; // canonical, MCP-popularized (FR-009)
	outputSchema?: JSONSchema;
	source?: "local" | string; // MCP server id otherwise (FR-014a)
	enabled?: boolean; // default true (FR-012a)
	run(args: unknown): Promise<unknown>;
}

export function defineTool<I, O>(t: {
	name: string;
	description: string;
	inputSchema: JSONSchema;
	outputSchema?: JSONSchema;
	run: (args: I) => Promise<O>;
}): Tool;

export interface ToolRegistry {
	register(tool: Tool): void;
	list(): Tool[]; // namespaced names (FR-014a)
	enable(name: string): void; // tool or `server.*` (FR-012a)
	disable(name: string): void;
	invoke(name: string, args: unknown): Promise<ToolResult>;
}
```

**Contract rules**

- Arguments are validated against `inputSchema` before `run`; invalid args produce a typed
  `ToolError(invalid-arguments)` returned to the model for self-correction (FR-011/011a).
- Unknown tool → typed `ToolError(tool-not-found)` returned to the model (FR-011a).
- Tools are addressed namespaced by source (`server.tool`); collisions are impossible (FR-014a).
- Disabled tools/servers are not presented to the agent (FR-012a).
- No built-in tools are shipped; all tools come from the consumer or MCP (FR-012d).

**Contract tests**

- invalid args → typed error fed back, run continues within iteration cap.
- duplicate names across sources remain distinct via namespacing.
- disabled tool absent from `list()` presented to the agent.
