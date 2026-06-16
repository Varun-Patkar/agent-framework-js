import { describe, it, expect } from "vitest";
import { loadAgentDefinition } from "../../src/declarative/loader.js";
import { mockProvider } from "../helpers/mockProvider.js";
import type { ProviderDefinition } from "../../src/declarative/loader.js";

const providerFactory = (def: ProviderDefinition) =>
	mockProvider({
		capabilities: { model: def.model, maxInputTokens: def.maxInputTokens, maxOutputTokens: def.maxOutputTokens },
		responses: [{ text: "loaded" }],
	});

const json = JSON.stringify({
	name: "JsonAgent",
	instructions: "be helpful",
	provider: { type: "openai-compatible", model: "m", maxInputTokens: 1000, maxOutputTokens: 500 },
});

const yaml = `
name: YamlAgent
instructions: be helpful
provider:
  type: openai-compatible
  model: m
  maxInputTokens: 1000
  maxOutputTokens: 500
`;

describe("US8 declarative (contract)", () => {
	it("loads a JSON definition into a runnable agent", async () => {
		const agent = await loadAgentDefinition(json, { providerFactory, getCredential: () => "" });
		expect(agent.name).toBe("JsonAgent");
		const res = await agent.run("hi");
		expect(res.output).toBe("loaded");
	});

	it("loads an equivalent YAML definition (auto-detected)", async () => {
		const agent = await loadAgentDefinition(yaml, { providerFactory, getCredential: () => "" });
		expect(agent.name).toBe("YamlAgent");
		const res = await agent.run("hi");
		expect(res.output).toBe("loaded");
	});

	it("rejects an invalid definition with a typed error", async () => {
		await expect(
			loadAgentDefinition("{}", { providerFactory, getCredential: () => "" }),
		).rejects.toThrow();
	});
});
