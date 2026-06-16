import { describe, it, expect } from "vitest";
import { createWorkflow } from "../../src/workflows/workflow.js";
import { restoreCheckpoint, createCheckpoint } from "../../src/workflows/checkpoint.js";
import { runBounded } from "../../src/workflows/concurrency.js";
import { createAgent } from "../../src/agents/agent.js";
import { mockProvider } from "../helpers/mockProvider.js";
import { CheckpointError } from "../../src/core/errors.js";

function agentEchoing(name: string, text: string) {
	return createAgent({
		name,
		instructions: "x",
		provider: mockProvider({ responses: [{ text }] }),
	});
}

describe("US5 workflows (contract)", () => {
	it("runs a sequential workflow passing output forward", async () => {
		const wf = createWorkflow({
			pattern: "sequential",
			agents: [agentEchoing("a", "first"), agentEchoing("b", "second")],
		});
		const state = await wf.run("start");
		expect(state.status).toBe("completed");
		expect(state.output).toBe("second");
	});

	it("aggregates concurrent outputs (fail-soft default)", async () => {
		const wf = createWorkflow({
			pattern: "concurrent",
			agents: [agentEchoing("a", "A"), agentEchoing("b", "B")],
		});
		const state = await wf.run("go");
		expect(state.output).toContain("A");
		expect(state.output).toContain("B");
	});

	it("transfers control in a handoff workflow", async () => {
		const wf = createWorkflow({
			pattern: "handoff",
			agents: [agentEchoing("router", "route"), agentEchoing("worker", "done")],
			selectNext: (output) => (output === "route" ? "worker" : null),
			isComplete: (output) => output === "done",
		});
		const state = await wf.run("hello");
		expect(state.output).toBe("done");
	});

	it("respects fail-fast policy in runBounded", async () => {
		await expect(
			runBounded(
				[
					async () => 1,
					async () => {
						throw new Error("boom");
					},
				],
				1,
				"fail-fast",
			),
		).rejects.toThrow("boom");
	});

	it("yields awaiting-input for HITL and resumes", async () => {
		let provided = false;
		const wf = createWorkflow({
			pattern: "sequential",
			agents: [agentEchoing("a", "out")],
			humanInputGate: (ctx) => (provided || ctx.outputs["__human__"] ? null : "approve?"),
		});
		let state = await wf.run("x");
		expect(state.status).toBe("awaiting-input");
		expect(state.awaiting?.prompt).toBe("approve?");
		provided = true;
		state = await wf.resume(state, "approved");
		expect(state.status).toBe("completed");
	});

	it("fails closed on a version-mismatched checkpoint", () => {
		const cp = { ...createCheckpoint("id", { output: "x" }), version: "999" };
		expect(() => restoreCheckpoint(cp)).toThrow(CheckpointError);
		try {
			restoreCheckpoint(cp);
		} catch (e) {
			expect((e as CheckpointError).reason).toBe("version-mismatch");
		}
	});

	it("fails closed on corrupt checkpoint data", () => {
		expect(() => restoreCheckpoint("{not json")).toThrow(CheckpointError);
	});
});
