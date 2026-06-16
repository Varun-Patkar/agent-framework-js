import { describe, it, expect } from "vitest";
import { resolveModels } from "../../src/providers/provider.js";
import { createOpenAICompatibleProvider } from "../../src/providers/openai-compatible.js";
import { createCopilotProvider } from "../../src/providers/copilot.js";
import { createAgent } from "../../src/agents/agent.js";
import { ValidationError } from "../../src/core/errors.js";
import type { ModelCapabilities } from "../../src/core/types.js";

const gpt4o: ModelCapabilities = { model: "gpt-4o", maxInputTokens: 128000, maxOutputTokens: 16000, supportsVision: true };
const o3: ModelCapabilities = { model: "o3-mini", maxInputTokens: 200000, maxOutputTokens: 100000, supportsReasoning: true };

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

describe("multi-model providers", () => {
	it("resolveModels: single capabilities shorthand", () => {
		const r = resolveModels({ capabilities: gpt4o });
		expect(r.models).toHaveLength(1);
		expect(r.defaultModel.model).toBe("gpt-4o");
		expect(r.modelOf().model).toBe("gpt-4o");
	});

	it("resolveModels: array with explicit default and lookup", () => {
		const r = resolveModels({ models: [gpt4o, o3], defaultModel: "o3-mini" });
		expect(r.models).toHaveLength(2);
		expect(r.defaultModel.model).toBe("o3-mini");
		expect(r.modelOf("gpt-4o").supportsVision).toBe(true);
	});

	it("resolveModels: throws when no model configured", () => {
		expect(() => resolveModels({})).toThrow(ValidationError);
	});

	it("resolveModels: throws for an unknown model name", () => {
		const r = resolveModels({ models: [gpt4o] });
		expect(() => r.modelOf("missing")).toThrow(ValidationError);
	});

	it("Copilot provider exposes multiple models and a default", () => {
		const provider = createCopilotProvider({
			getCredential: () => "t",
			models: [gpt4o, o3],
			defaultModel: "gpt-4o",
		});
		expect(provider.models.map((m) => m.model)).toEqual(["gpt-4o", "o3-mini"]);
		expect(provider.capabilities.model).toBe("gpt-4o");
		expect(provider.model("o3-mini").supportsReasoning).toBe(true);
	});

	it("OpenAI-compatible defaults to a single model", () => {
		const provider = createOpenAICompatibleProvider({
			baseUrl: "http://localhost:1234/v1",
			getCredential: () => "",
			capabilities: gpt4o,
		});
		expect(provider.models).toHaveLength(1);
		expect(provider.capabilities.model).toBe("gpt-4o");
	});

	it("sends the requested model name in the request body", async () => {
		const seen: string[] = [];
		const provider = createCopilotProvider({
			getCredential: () => "t",
			models: [gpt4o, o3],
			fetchImpl: async (_url, init) => {
				seen.push(JSON.parse(init!.body as string).model);
				return jsonResponse({ choices: [{ message: { content: "ok" } }] });
			},
		});
		await provider.generate({ messages: [{ role: "user", parts: [{ type: "text", text: "x" }] }] });
		await provider.generate({ messages: [{ role: "user", parts: [{ type: "text", text: "x" }] }], model: "o3-mini" });
		expect(seen).toEqual(["gpt-4o", "o3-mini"]); // default then explicit
	});

	it("agent uses its configured model's capabilities and sends that model", async () => {
		const seen: string[] = [];
		const provider = createCopilotProvider({
			getCredential: () => "t",
			models: [gpt4o, o3],
			defaultModel: "gpt-4o",
			fetchImpl: async (_url, init) => {
				seen.push(JSON.parse(init!.body as string).model);
				return jsonResponse({ choices: [{ message: { content: "answer", reasoning: "because" } }] });
			},
		});
		const agent = createAgent({ name: "R", instructions: "x", provider, model: "o3-mini" });
		const res = await agent.run("q");
		expect(seen).toEqual(["o3-mini"]);
		expect(res.reasoning).toBe("because"); // o3-mini supportsReasoning
	});
});
