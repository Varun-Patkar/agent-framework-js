/**
 * Tool registry: registration, namespacing, granular enable/disable, and
 * validated invocation. Tools are addressed namespaced by source (`server.tool`)
 * so collisions across MCP servers and local code are impossible. (FR-012a, FR-014a)
 *
 * @packageDocumentation
 */

import type { Tool } from "./tool.js";
import type { ToolSpec } from "../providers/provider.js";
import { validateArgs } from "./validate.js";
import { ToolError, ValidationError } from "../core/errors.js";

/** Result of invoking a tool. */
export interface ToolResult {
	/** The tool's (namespaced) name. */
	name: string;
	/** The returned value on success. */
	value?: unknown;
	/** A typed error on failure (fed back to the model for self-correction). */
	error?: ToolError;
}

/** Compute the namespaced address for a tool. */
export function namespacedName(tool: Pick<Tool, "name" | "source">): string {
	if (!tool.source || tool.source === "local") return tool.name;
	// Avoid double-prefixing if already namespaced.
	return tool.name.startsWith(`${tool.source}.`) ? tool.name : `${tool.source}.${tool.name}`;
}

/** A registry of tools available to an agent. */
export class ToolRegistry {
	private readonly tools = new Map<string, Tool>();
	private readonly disabled = new Set<string>();
	private readonly disabledServers = new Set<string>();

	constructor(tools: Tool[] = []) {
		for (const t of tools) this.register(t);
	}

	/** Register a tool under its namespaced name. */
	register(tool: Tool): void {
		this.tools.set(namespacedName(tool), tool);
	}

	/** Enable a tool by namespaced name. */
	enable(name: string): void {
		this.disabled.delete(name);
	}

	/** Disable a single tool by namespaced name. (FR-012a) */
	disable(name: string): void {
		this.disabled.add(name);
	}

	/** Disable every tool from an MCP server id. (FR-012a) */
	disableServer(serverId: string): void {
		this.disabledServers.add(serverId);
	}

	/** Re-enable every tool from an MCP server id. */
	enableServer(serverId: string): void {
		this.disabledServers.delete(serverId);
	}

	private isEnabled(name: string, tool: Tool): boolean {
		if (tool.enabled === false) return false;
		if (this.disabled.has(name)) return false;
		if (tool.source && tool.source !== "local" && this.disabledServers.has(tool.source)) return false;
		return true;
	}

	/** List currently enabled tools (those presented to the agent). */
	list(): Tool[] {
		return [...this.tools.entries()]
			.filter(([name, tool]) => this.isEnabled(name, tool))
			.map(([, tool]) => tool);
	}

	/** Provider-facing specs for enabled tools. */
	specs(): ToolSpec[] {
		return [...this.tools.entries()]
			.filter(([name, tool]) => this.isEnabled(name, tool))
			.map(([name, tool]) => ({
				name,
				description: tool.description,
				inputSchema: tool.inputSchema,
			}));
	}

	/**
	 * Validate and invoke a tool. Never throws for tool-level failures; instead
	 * returns a {@link ToolResult} with a typed error so the agent can self-correct.
	 * (FR-011a, FR-012, FR-012c)
	 *
	 * @param name - Namespaced tool name.
	 * @param args - Raw arguments from the model.
	 * @param timeoutMs - Optional per-call timeout.
	 */
	async invoke(name: string, args: unknown, timeoutMs?: number): Promise<ToolResult> {
		const tool = this.tools.get(name);
		if (!tool || !this.isEnabled(name, tool)) {
			return {
				name,
				error: new ToolError(`Tool "${name}" not found or disabled`, "not-found", name),
			};
		}
		try {
			validateArgs(tool.inputSchema, args);
		} catch (e) {
			const ve = e as ValidationError;
			return {
				name,
				error: new ToolError(ve.message, "invalid-arguments", name, ve.details),
			};
		}
		try {
			const value = await runWithTimeout(() => tool.run(args), timeoutMs, name);
			return { name, value };
		} catch (e) {
			if (e instanceof ToolError) return { name, error: e };
			return {
				name,
				error: new ToolError((e as Error).message, "run-failure", name),
			};
		}
	}
}

async function runWithTimeout<T>(
	fn: () => Promise<T>,
	timeoutMs: number | undefined,
	name: string,
): Promise<T> {
	if (!timeoutMs || timeoutMs <= 0) return fn();
	let timer: ReturnType<typeof setTimeout>;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(
			() => reject(new ToolError(`Tool "${name}" timed out after ${timeoutMs}ms`, "timeout", name)),
			timeoutMs,
		);
	});
	try {
		return await Promise.race([fn(), timeout]);
	} finally {
		clearTimeout(timer!);
	}
}
