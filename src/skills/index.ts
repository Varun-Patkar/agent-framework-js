/**
 * Client-side keyword/text index over skill descriptions. No embeddings and no
 * extra provider — relevance is decided by simple token overlap so it runs fully
 * in the browser/edge. Full content is loaded only after a skill is selected.
 * (FR-017, FR-017a)
 *
 * @packageDocumentation
 */

import type { Skill } from "./skill.js";
import { loadSource } from "./skill.js";

export * from "./skill.js";

const STOPWORDS = new Set([
	"the", "a", "an", "and", "or", "of", "to", "in", "for", "on", "is", "are",
	"with", "how", "what", "do", "does", "i", "you", "it", "this", "that",
]);

function tokenize(text: string): Set<string> {
	return new Set(
		text
			.toLowerCase()
			.split(/[^a-z0-9]+/)
			.filter((w) => w.length > 2 && !STOPWORDS.has(w)),
	);
}

/** Indexes skills by description and selects relevant ones for a prompt. */
export class SkillIndex {
	private readonly entries: Array<{ skill: Skill; tokens: Set<string> }> = [];

	constructor(skills: Skill[] = []) {
		for (const s of skills) this.add(s);
	}

	/** Add a skill to the index (description-only). */
	add(skill: Skill): void {
		this.entries.push({ skill, tokens: tokenize(`${skill.name} ${skill.description}`) });
	}

	/**
	 * Select skills relevant to `prompt` by keyword overlap with their descriptions.
	 *
	 * @param prompt - The user prompt.
	 * @param minOverlap - Minimum overlapping tokens to count as relevant. Default 1.
	 */
	select(prompt: string, minOverlap = 1): Skill[] {
		const promptTokens = tokenize(prompt);
		const scored: Array<{ skill: Skill; score: number }> = [];
		for (const { skill, tokens } of this.entries) {
			let score = 0;
			for (const t of tokens) if (promptTokens.has(t)) score++;
			if (score >= minOverlap) scored.push({ skill, score });
		}
		return scored.sort((a, b) => b.score - a.score).map((s) => s.skill);
	}

	/** Load the full content of a selected skill (concatenated sources). (FR-017) */
	async load(skill: Skill): Promise<string> {
		const parts = await Promise.all(skill.sources.map(loadSource));
		return parts.join("\n\n");
	}
}
