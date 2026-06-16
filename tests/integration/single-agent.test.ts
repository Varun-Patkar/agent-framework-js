import { describe, it, expect } from "vitest";
import { createAgent } from "../../src/agents/agent.js";
import { createOpenAICompatibleProvider } from "../../src/providers/openai-compatible.js";
import { ProviderError } from "../../src/core/errors.js";

describe("US1 single agent (integration)", () => {
	it("runs end-to-end against a stubbed OpenAI-compatible endpoint", async () => {
		const provider = createOpenAICompatibleProvider({
			baseUrl: "http://localhost:1234/v1",
			getCredential: () => "k",
			capabilities: { model: "m", maxInputTokens: 4000, maxOutputTokens: 1000 },
			fetchImpl: async () =>
				new Response(JSON.stringify({ choices: [{ message: { content: "hello world" } }] }), {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
		});
		const agent = createAgent({ name: "E2E", instructions: "be nice", provider });
		const res = await agent.run("hi");
		expect(res.status).toBe("completed");
		expect(res.output).toBe("hello world");
	});

	it("returns a typed failure for an unreachable endpoint without leaking secrets", async () => {
		const provider = createOpenAICompatibleProvider({
			baseUrl: "http://localhost:9/v1",
			getCredential: () => "super-secret-key",
			capabilities: { model: "m", maxInputTokens: 4000, maxOutputTokens: 1000 },
			retry: { maxRetries: 0 },
			fetchImpl: async () => {
				throw new Error("ECONNREFUSED");
			},
		});
		const agent = createAgent({ name: "E2E", instructions: "x", provider });
		const res = await agent.run("hi");
		expect(res.status).toBe("failed");
		expect(res.error).toBeInstanceOf(ProviderError);
		expect(JSON.stringify(res.error?.toJSON())).not.toContain("super-secret-key");
	});
});
