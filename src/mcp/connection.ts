/**
 * MCP (Model Context Protocol) integration. Connects to MCP servers and exposes
 * their tools through the framework's uniform tool interface.
 *
 * Remote transport (HTTP/SSE) works in all runtimes; stdio (spawning a server
 * process) works only where process spawning is permitted (Node). Requesting
 * stdio elsewhere throws a typed {@link RuntimeUnsupportedError}. (FR-013, FR-013a,
 * FR-013b, FR-030a)
 *
 * The `@modelcontextprotocol/sdk` package is an optional peer dependency and is
 * loaded lazily so browser bundles that do not use MCP pay no cost.
 *
 * @packageDocumentation
 */

import { MCPError } from "../core/errors.js";
import { requireCapability } from "../core/runtime.js";
import type { Tool } from "../tools/tool.js";
import { mcpToolToTool } from "./adapter.js";

/**
 * Custom HTTP headers for a remote MCP connection. Mirrors the `headers` object
 * of an `mcp.json` HTTP server entry and is the standard way to pass secrets
 * such as `Authorization: Bearer …` or `X-API-Key` tokens.
 *
 * It may be a static record or a (possibly async) callback that returns the
 * headers. The callback form keeps the security model intact: secrets are
 * resolved lazily at connect time (e.g. minting a fresh bearer token) and are
 * never persisted on the config object. Empty/`null`/`undefined` values are
 * dropped so blank auth headers are never sent.
 */
export type MCPHeaders =
	| Record<string, string>
	| (() => Record<string, string> | Promise<Record<string, string>>);

/** Transport options for an MCP connection. */
export type MCPTransport =
	| {
			kind: "remote";
			url: string;
			/**
			 * Wire transport for the remote endpoint. Defaults to `"http"`
			 * (Streamable HTTP, the `"http"`/`"streamable-http"` type in `mcp.json`).
			 * Use `"sse"` for legacy Server-Sent Events servers. (FR-013a)
			 */
			type?: "http" | "sse";
			/** Custom request headers (auth tokens, API keys, content versions, …). */
			headers?: MCPHeaders;
	  }
	| {
			kind: "stdio";
			command: string;
			args?: string[];
			/** Extra environment variables for the spawned server process. */
			env?: Record<string, string>;
	  };

/** Configuration for connecting to an MCP server. */
export interface MCPConnectionConfig {
	/** Connection id; becomes the namespace prefix for discovered tools. (FR-014a) */
	id: string;
	transport: MCPTransport;
	/** Whether the connection's tools are enabled. Defaults to true. */
	enabled?: boolean;
}

/** A live connection to an MCP server. */
export interface MCPConnection {
	readonly id: string;
	connect(): Promise<void>;
	listTools(): Promise<Tool[]>;
	close(): Promise<void>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyClient = any;

/**
 * Resolve {@link MCPHeaders} into a plain record at connect time, invoking the
 * callback form if provided and stripping empty values so we never transmit a
 * blank `Authorization`/`X-API-Key` header. Returns `undefined` when there are
 * no usable headers so the transport is constructed without a `requestInit`.
 */
async function resolveHeaders(
	headers?: MCPHeaders,
): Promise<Record<string, string> | undefined> {
	if (!headers) return undefined;
	const resolved = typeof headers === "function" ? await headers() : headers;
	const entries = Object.entries(resolved).filter(
		([, v]) => v != null && v !== "",
	);
	return entries.length ? Object.fromEntries(entries) : undefined;
}

/**
 * Build an `EventSourceInit` that injects custom headers onto the initial SSE
 * stream request. The legacy SSE transport only attaches `requestInit` headers
 * to the follow-up POST messages, so without this the auth header would be
 * missing from the GET that opens the stream.
 */
function headerEventSourceInit(headers: Record<string, string>): {
	fetch: (url: string | URL, init?: RequestInit) => Promise<Response>;
} {
	return {
		fetch: (url, init) =>
			fetch(url, {
				...init,
				headers: { ...(init?.headers as Record<string, string>), ...headers },
			}),
	};
}

async function createTransport(config: MCPConnectionConfig): Promise<AnyClient> {
	if (config.transport.kind === "stdio") {
		// Gate on runtime capability before attempting to spawn. (FR-013b, FR-030a)
		requireCapability("canSpawnProcess", "MCP stdio transport");
		const { StdioClientTransport } = await import(
			"@modelcontextprotocol/sdk/client/stdio.js"
		);
		return new StdioClientTransport({
			command: config.transport.command,
			args: config.transport.args ?? [],
			...(config.transport.env ? { env: config.transport.env } : {}),
		});
	}

	const headers = await resolveHeaders(config.transport.headers);
	const url = new URL(config.transport.url);

	// Legacy Server-Sent Events transport. (FR-013a)
	if (config.transport.type === "sse") {
		const { SSEClientTransport } = await import(
			"@modelcontextprotocol/sdk/client/sse.js"
		);
		return new SSEClientTransport(url, {
			...(headers
				? {
						requestInit: { headers },
						eventSourceInit: headerEventSourceInit(headers),
				  }
				: {}),
		});
	}

	// Default: Streamable HTTP (the "http"/"streamable-http" type in mcp.json).
	const { StreamableHTTPClientTransport } = await import(
		"@modelcontextprotocol/sdk/client/streamableHttp.js"
	);
	return new StreamableHTTPClientTransport(url, {
		...(headers ? { requestInit: { headers } } : {}),
	});
}

/**
 * Connect to an MCP server.
 *
 * @example
 * ```ts
 * // Remote HTTP server with bearer auth (mirrors an mcp.json HTTP entry).
 * const mcp = await connectMCP({
 *   id: "docs",
 *   transport: {
 *     kind: "remote",
 *     url: "https://api.example.com/mcp",
 *     headers: { Authorization: "Bearer your-api-token-here" },
 *   },
 * });
 * const tools = await mcp.listTools(); // namespaced as docs.<tool>
 * ```
 */
export async function connectMCP(config: MCPConnectionConfig): Promise<MCPConnection> {
	let client: AnyClient | undefined;

	async function connect(): Promise<void> {
		try {
			const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
			const transport = await createTransport(config);
			client = new Client({ name: "agent-framework-js", version: "0.1.0" }, { capabilities: {} });
			await client.connect(transport);
		} catch (e) {
			// Preserve typed runtime errors; wrap everything else as an MCP error.
			if ((e as Error).name === "RuntimeUnsupportedError") throw e;
			throw new MCPError(`Failed to connect to MCP server: ${(e as Error).message}`, config.id);
		}
	}

	async function listTools(): Promise<Tool[]> {
		if (!client) throw new MCPError("Not connected", config.id);
		try {
			const result = await client.listTools();
			return (result.tools ?? []).map((t: { name: string; description?: string; inputSchema: Record<string, unknown> }) =>
				mcpToolToTool(config.id, t, client),
			);
		} catch (e) {
			throw new MCPError(`Failed to list tools: ${(e as Error).message}`, config.id);
		}
	}

	async function close(): Promise<void> {
		await client?.close?.();
		client = undefined;
	}

	return { id: config.id, connect, listTools, close };
}
