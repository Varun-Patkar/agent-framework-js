import { describe, it, expect } from "vitest";
import { createOpenAICompatibleProvider } from "../../src/providers/openai-compatible.js";
import { withRetry, providerErrorFromStatus } from "../../src/providers/retry.js";
import { ProviderError } from "../../src/core/errors.js";

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

describe("US1 provider (contract)", () => {
	it("invokes the credential callback and sends an auth header", async () => {
		let seenAuth: string | null = null;
		const provider = createOpenAICompatibleProvider({
			baseUrl: "http://localhost:1234/v1",
			getCredential: () => "secret-token",
			capabilities: { model: "m", maxInputTokens: 1000, maxOutputTokens: 500 },
			fetchImpl: async (_url, init) => {
				seenAuth = (init?.headers as Record<string, string>)["authorization"];
				return jsonResponse({ choices: [{ message: { content: "hi" } }] });
			},
		});
		const res = await provider.generate({ messages: [{ role: "user", parts: [{ type: "text", text: "x" }] }] });
		expect(res.text).toBe("hi");
		expect(seenAuth).toBe("Bearer secret-token");
	});

	it("maps 429 to transient and 401 to auth", () => {
		expect(providerErrorFromStatus(429, "x").retryable).toBe(true);
		expect(providerErrorFromStatus(503, "x").retryable).toBe(true);
		expect(providerErrorFromStatus(401, "x").reason).toBe("auth");
		expect(providerErrorFromStatus(400, "x").reason).toBe("client");
	});

	it("retries transient errors then succeeds", async () => {
		let attempts = 0;
		const result = await withRetry(
			async () => {
				attempts++;
				if (attempts < 3) throw new ProviderError("temp", "transient");
				return "done";
			},
			{ baseDelayMs: 1, maxRetries: 5 },
		);
		expect(result).toBe("done");
		expect(attempts).toBe(3);
	});

	it("fails fast on non-transient errors", async () => {
		let attempts = 0;
		await expect(
			withRetry(
				async () => {
					attempts++;
					throw new ProviderError("nope", "auth");
				},
				{ baseDelayMs: 1 },
			),
		).rejects.toBeInstanceOf(ProviderError);
		expect(attempts).toBe(1);
	});
});
