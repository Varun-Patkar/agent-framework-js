/**
 * Skills: domain-specific knowledge bundles attached to agents. Skills use
 * progressive disclosure — only a skill's short description is used to decide
 * relevance, and its full content is loaded only when the skill is deemed needed.
 * (FR-016, FR-017)
 *
 * @packageDocumentation
 */

/** A source of skill content, loaded on demand. */
export type SkillSource =
	| { kind: "inline"; content: string }
	| { kind: "file"; path: string }
	| { kind: "code"; load: () => Promise<string> };

/** A domain knowledge bundle. */
export interface Skill {
	/** Unique skill name. */
	name: string;
	/** Short description — the ONLY text used to decide relevance. (FR-017) */
	description: string;
	/** Content sources, read only when the skill is selected. */
	sources: SkillSource[];
}

/**
 * Define a skill.
 *
 * @example
 * ```ts
 * const refund = defineSkill({
 *   name: "refund-policy",
 *   description: "Company refund and return rules.",
 *   sources: [{ kind: "inline", content: "Refunds allowed within 30 days..." }],
 * });
 * ```
 */
export function defineSkill(skill: Skill): Skill {
	return skill;
}

/** Read a single source's content. File sources require a Node runtime. */
export async function loadSource(source: SkillSource): Promise<string> {
	switch (source.kind) {
		case "inline":
			return source.content;
		case "code":
			return source.load();
		case "file": {
			const { readFile } = await import("node:fs/promises");
			return readFile(source.path, "utf8");
		}
	}
}
