/**
 * The uniform tool contract. Every capability exposed to an agent — whether a
 * local function or an MCP-provided tool — implements this single interface, with
 * a JSON Schema (MCP-popularized) describing its inputs/outputs. The framework
 * ships no built-in tools. (FR-009, FR-012d, Constitution V)
 *
 * @packageDocumentation
 */

import type { JSONSchema } from "../core/types.js";

/** A callable capability available to an agent. */
export interface Tool<I = unknown, O = unknown> {
	/** Unique name. When provided by an MCP server it is namespaced as `server.tool`. */
	name: string;
	/** Natural-language description used by the model to decide when to call it. */
	description: string;
	/** JSON Schema for the arguments; validated before invocation. */
	inputSchema: JSONSchema;
	/** Optional JSON Schema describing the result. */
	outputSchema?: JSONSchema;
	/** Origin: `"local"` for code tools, or an MCP server id. */
	source?: "local" | string;
	/** Whether the tool is currently presented to the agent. Defaults to true. */
	enabled?: boolean;
	/** Execute the tool with validated arguments. */
	run(args: I): Promise<O>;
}

/**
 * Define a local function tool with full type inference.
 *
 * @example
 * ```ts
 * const add = defineTool({
 *   name: "add",
 *   description: "Add two numbers.",
 *   inputSchema: { type: "object", properties: { a: { type: "number" }, b: { type: "number" } }, required: ["a", "b"] },
 *   run: async ({ a, b }: { a: number; b: number }) => ({ sum: a + b }),
 * });
 * ```
 */
export function defineTool<I, O>(tool: {
	name: string;
	description: string;
	inputSchema: JSONSchema;
	outputSchema?: JSONSchema;
	run: (args: I) => Promise<O>;
}): Tool<I, O> {
	return { source: "local", enabled: true, ...tool };
}
