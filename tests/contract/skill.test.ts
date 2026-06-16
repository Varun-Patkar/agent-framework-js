import { describe, it, expect } from "vitest";
import { SkillIndex, defineSkill } from "../../src/skills/index.js";

describe("US4 skills (contract)", () => {
	const refund = defineSkill({
		name: "refund-policy",
		description: "Company refund and return rules for purchases",
		sources: [{ kind: "inline", content: "Refunds allowed within 30 days." }],
	});
	const shipping = defineSkill({
		name: "shipping",
		description: "Delivery and shipping timelines",
		sources: [{ kind: "inline", content: "Ships in 2 days." }],
	});

	it("selects a skill by keyword overlap with its description", () => {
		const idx = new SkillIndex([refund, shipping]);
		const selected = idx.select("what is the refund policy?");
		expect(selected[0]?.name).toBe("refund-policy");
	});

	it("selects nothing for an off-domain prompt", () => {
		const idx = new SkillIndex([refund, shipping]);
		expect(idx.select("tell me a joke about cats")).toHaveLength(0);
	});

	it("loads full content only on demand", async () => {
		const idx = new SkillIndex([refund]);
		const content = await idx.load(refund);
		expect(content).toContain("30 days");
	});
});
