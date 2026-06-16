/**
 * Adapts MCP-provided tools onto the framework's uniform {@link Tool} contract,
 * namespaced by the connection id so collisions are impossible. (FR-014, FR-014a)
 *
 * @packageDocumentation
 */

import type { Tool } from "../tools/tool.js";
import { MCPError } from "../core/errors.js";

interface MCPToolDef {
	name: string;
	description?: string;
	inputSchema: Record<string, unknown>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Wrap an MCP tool definition as a framework tool. Invocation calls back through
 * the MCP client; failures surface as typed {@link MCPError}/tool errors.
 */
export function mcpToolToTool(serverId: string, def: MCPToolDef, client: any): Tool {
	return {
		name: def.name,
		description: def.description ?? "",
		inputSchema: def.inputSchema,
		source: serverId,
		enabled: true,
		async run(args: unknown): Promise<unknown> {
			try {
				const result = await client.callTool({ name: def.name, arguments: args });
				return result.content ?? result;
			} catch (e) {
				throw new MCPError(`MCP tool "${def.name}" failed: ${(e as Error).message}`, serverId);
			}
		},
	};
}
