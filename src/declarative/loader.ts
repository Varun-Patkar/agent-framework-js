/**
 * Declarative agent definitions. Agents can be defined in YAML or JSON against a
 * single shared schema; the loader auto-detects the format (the YAML parser is
 * lazy-loaded so JSON-only/browser use pays no cost) and builds an equivalent
 * runnable agent. Credentials are still injected via callback, never embedded.
 * (FR-027, FR-005a)
 *
 * @packageDocumentation
 */

import type { ModelCapabilities } from "../core/types.js";
import type { Provider } from "../providers/provider.js";
import type { Tool } from "../tools/tool.js";
import type { Skill } from "../skills/skill.js";
import { createAgent, type Agent } from "../agents/agent.js";
import { ValidationError } from "../core/errors.js";

/** Provider section of a declarative definition. */
export interface ProviderDefinition extends ModelCapabilities {
	type: "copilot" | "openai-compatible";
	baseUrl?: string;
}

/** A declarative agent definition (shared by YAML and JSON). */
export interface AgentDefinition {
	name: string;
	instructions: string;
	provider: ProviderDefinition;
	/** Names referencing tools provided in `deps.tools`. */
	tools?: string[];
	/** Names referencing skills provided in `deps.skills`. */
	skills?: string[];
	maxIterations?: number;
}

/** Dependencies the loader needs to construct a live agent. */
export interface LoaderDeps {
	/** Build a provider from the definition + injected credential. */
	providerFactory: (def: ProviderDefinition, getCredential: () => string | Promise<string>) => Provider;
	/** Credential callback — never embedded in the definition. (FR-005a) */
	getCredential: () => string | Promise<string>;
	/** Registered tools available for reference by name. */
	tools?: Record<string, Tool>;
	/** Registered skills available for reference by name. */
	skills?: Record<string, Skill>;
}

function looksLikeJson(source: string): boolean {
	const t = source.trimStart();
	return t.startsWith("{") || t.startsWith("[");
}

async function parse(source: string): Promise<unknown> {
	if (looksLikeJson(source)) {
		try {
			return JSON.parse(source);
		} catch (e) {
			throw new ValidationError(`Invalid JSON definition: ${(e as Error).message}`);
		}
	}
	// Lazy-load the YAML parser only when needed. (FR-027)
	const YAML = await import("yaml");
	try {
		return YAML.parse(source);
	} catch (e) {
		throw new ValidationError(`Invalid YAML definition: ${(e as Error).message}`);
	}
}

function assertDefinition(value: unknown): asserts value is AgentDefinition {
	const d = value as Partial<AgentDefinition>;
	if (!d || typeof d.name !== "string" || typeof d.instructions !== "string" || !d.provider) {
		throw new ValidationError("Definition must include name, instructions, and provider");
	}
}

/**
 * Load an agent from a YAML or JSON definition string.
 *
 * @example
 * ```ts
 * const agent = await loadAgentDefinition(yamlOrJson, {
 *   providerFactory,
 *   getCredential: () => process.env.LMSTUDIO_KEY ?? "",
 * });
 * ```
 */
export async function loadAgentDefinition(source: string, deps: LoaderDeps): Promise<Agent> {
	const parsed = await parse(source);
	assertDefinition(parsed);

	const provider = deps.providerFactory(parsed.provider, deps.getCredential);
	const tools = (parsed.tools ?? [])
		.map((name) => deps.tools?.[name])
		.filter((t): t is Tool => !!t);
	const skills = (parsed.skills ?? [])
		.map((name) => deps.skills?.[name])
		.filter((s): s is Skill => !!s);

	return createAgent({
		name: parsed.name,
		instructions: parsed.instructions,
		provider,
		tools,
		skills,
		maxIterations: parsed.maxIterations,
	});
}
