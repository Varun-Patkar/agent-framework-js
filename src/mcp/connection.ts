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

/** Transport options for an MCP connection. */
export type MCPTransport =
	| { kind: "remote"; url: string }
	| { kind: "stdio"; command: string; args?: string[] };

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
		});
	}
	const { StreamableHTTPClientTransport } = await import(
		"@modelcontextprotocol/sdk/client/streamableHttp.js"
	);
	return new StreamableHTTPClientTransport(new URL(config.transport.url));
}

/**
 * Connect to an MCP server.
 *
 * @example
 * ```ts
 * const mcp = await connectMCP({ id: "docs", transport: { kind: "remote", url: "https://mcp.example.com" } });
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
