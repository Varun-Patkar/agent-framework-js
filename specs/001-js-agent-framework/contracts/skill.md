# Contract: Skill

Maps to FR-016, FR-017, FR-017a.

```ts
export type SkillSource =
	| { kind: "inline"; content: string }
	| { kind: "file"; path: string }
	| { kind: "code"; load: () => Promise<string> };

export interface Skill {
	name: string;
	description: string; // ONLY this drives relevance selection (FR-017)
	sources: SkillSource[]; // loaded on demand (FR-017)
}

export function defineSkill(s: {
	name: string;
	description: string;
	sources: SkillSource[];
}): Skill;

export interface SkillIndex {
	add(skill: Skill): void;
	select(prompt: string): Skill[]; // keyword/text match over descriptions, client-side (FR-017a)
	load(skill: Skill): Promise<string>; // read full content only when needed (FR-017)
}
```

**Contract rules**

- Only the `description` is evaluated for relevance; full `sources` content is read only after a
  skill is selected as needed (FR-017).
- Indexing uses client-side keyword/text matching — no embeddings, no extra provider (FR-017a).

**Contract tests**

- prompt matching a skill description → skill selected, content loaded once.
- prompt outside any skill domain → no skill forced; agent responds normally.
