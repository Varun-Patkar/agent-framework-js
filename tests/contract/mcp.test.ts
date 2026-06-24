import { describe, it, expect, afterEach, vi } from "vitest";
import { connectMCP } from "../../src/mcp/connection.js";
import { mcpToolToTool } from "../../src/mcp/adapter.js";
import { resetRuntimeCache } from "../../src/core/runtime.js";

// Capture the options handed to the SDK transports so we can assert that custom
// headers from the connection config reach the underlying HTTP/SSE transport.
const httpCtor = vi.fn();
const sseCtor = vi.fn();

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
	Client: class {
		async connect() {}
		async listTools() {
			return { tools: [] };
		}
		async close() {}
	},
}));

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
	StreamableHTTPClientTransport: class {
		constructor(url: URL, opts?: unknown) {
			httpCtor(url, opts);
		}
	},
}));

vi.mock("@modelcontextprotocol/sdk/client/sse.js", () => ({
	SSEClientTransport: class {
		constructor(url: URL, opts?: unknown) {
			sseCtor(url, opts);
		}
	},
}));

describe("US3 MCP (contract)", () => {
	afterEach(() => {
		resetRuntimeCache();
		httpCtor.mockClear();
		sseCtor.mockClear();
	});

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

	it("passes custom HTTP headers to the streamable transport (static record)", async () => {
		const conn = await connectMCP({
			id: "docs",
			transport: {
				kind: "remote",
				url: "https://api.example.com/mcp",
				headers: {
					Authorization: "Bearer token-123",
					"X-API-Key": "key-456",
					Empty: "", // dropped: never send a blank header
				},
			},
		});
		await conn.connect();
		expect(httpCtor).toHaveBeenCalledTimes(1);
		const [url, opts] = httpCtor.mock.calls[0] as [URL, { requestInit: RequestInit }];
		expect(url.toString()).toBe("https://api.example.com/mcp");
		expect(opts.requestInit.headers).toEqual({
			Authorization: "Bearer token-123",
			"X-API-Key": "key-456",
		});
	});

	it("resolves a headers callback lazily at connect time", async () => {
		const getHeaders = vi.fn(async () => ({ Authorization: "Bearer fresh" }));
		const conn = await connectMCP({
			id: "docs",
			transport: { kind: "remote", url: "https://api.example.com/mcp", headers: getHeaders },
		});
		expect(getHeaders).not.toHaveBeenCalled();
		await conn.connect();
		expect(getHeaders).toHaveBeenCalledTimes(1);
		const [, opts] = httpCtor.mock.calls[0] as [URL, { requestInit: RequestInit }];
		expect(opts.requestInit.headers).toEqual({ Authorization: "Bearer fresh" });
	});

	it("uses the SSE transport with headers when type is 'sse'", async () => {
		const conn = await connectMCP({
			id: "docs",
			transport: {
				kind: "remote",
				type: "sse",
				url: "https://api.example.com/sse",
				headers: { Authorization: "Bearer sse" },
			},
		});
		await conn.connect();
		expect(sseCtor).toHaveBeenCalledTimes(1);
		expect(httpCtor).not.toHaveBeenCalled();
		const [, opts] = sseCtor.mock.calls[0] as [
			URL,
			{ requestInit: RequestInit; eventSourceInit: { fetch: unknown } },
		];
		expect(opts.requestInit.headers).toEqual({ Authorization: "Bearer sse" });
		expect(typeof opts.eventSourceInit.fetch).toBe("function");
	});

	it("omits requestInit when no headers are provided", async () => {
		const conn = await connectMCP({
			id: "docs",
			transport: { kind: "remote", url: "https://api.example.com/mcp" },
		});
		await conn.connect();
		const [, opts] = httpCtor.mock.calls[0] as [URL, Record<string, unknown>];
		expect(opts).toEqual({});
	});

	it("throws a typed unsupported error for stdio where spawning is unavailable", async () => {
		// Simulate a non-Node runtime by swapping `process` for a clone whose
		// `versions` is cleared (so `isNode` is false), while keeping the real
		// prototype (nextTick etc.) so vitest's worker keeps functioning.
		const g = globalThis as Record<string, unknown>;
		const realProcess = g["process"];
		const fakeProcess = Object.create(realProcess as object);
		Object.defineProperty(fakeProcess, "versions", { value: undefined, configurable: true });
		g["process"] = fakeProcess;
		resetRuntimeCache();
		try {
			const conn = await connectMCP({
				id: "local",
				transport: { kind: "stdio", command: "node", args: ["server.js"] },
			});
			await expect(conn.connect()).rejects.toMatchObject({ kind: "runtime-unsupported" });
		} finally {
			g["process"] = realProcess;
			resetRuntimeCache();
		}
	});
});
