# Contract: MCP Integration

Maps to FR-013, FR-013a, FR-013b, FR-014, FR-015, FR-030a.

```ts
export type MCPHeaders =
	| Record<string, string>
	| (() => Record<string, string> | Promise<Record<string, string>>); // resolved at connect time

export type MCPTransport =
	| {
			kind: "remote";
			url: string; // HTTP + SSE / streamable (FR-013a)
			type?: "http" | "sse"; // default "http" (Streamable HTTP)
			headers?: MCPHeaders; // custom auth/API-key headers (mcp.json parity)
	  }
	| { kind: "stdio"; command: string; args?: string[]; env?: Record<string, string> }; // spawn; Node-only (FR-013b)

export interface MCPConnectionConfig {
	id: string; // namespace prefix for discovered tools (FR-014a)
	transport: MCPTransport;
	enabled?: boolean; // default true (FR-012a)
}

export interface MCPConnection {
	readonly id: string;
	connect(): Promise<void>;
	listTools(): Promise<Tool[]>; // adapted to the Tool contract (FR-014)
	close(): Promise<void>;
}

export function connectMCP(config: MCPConnectionConfig): Promise<MCPConnection>;
```

**Contract rules**

- Remote transport works in all runtimes; stdio works only where process spawning is permitted. A
  stdio request in a non-spawn runtime throws `RuntimeUnsupportedError` and the framework falls back
  to remote-only (FR-013b/030a).
- `headers` mirror an `mcp.json` HTTP entry (e.g. `Authorization: Bearer …`, `X-API-Key`). They may
  be a static record or a (possibly async) callback resolved at connect time so secrets are never
  persisted. Empty/`null`/`undefined` values are dropped, and values are redacted in logs/traces.
- Discovered MCP tools are exposed through the identical `Tool` contract, namespaced by `id`
  (FR-014/014a).
- Server unavailability yields a typed `MCPError` without crashing the run; other tools remain
  usable (FR-015).

**Contract tests** (MCP server mocked)

- remote connection lists tools; tool invocation returns standard `ToolResult`.
- remote connection with `headers` (record and callback) forwards them to the HTTP transport;
  `type: "sse"` selects the SSE transport and attaches headers to the stream request.
- stdio in simulated browser runtime → `RuntimeUnsupportedError`.
- server-down mid-run → typed `MCPError`, other tools still callable.
