import { describe, it, expect } from "vitest";
import { redact, REDACTED } from "../../src/core/redaction.js";
import { ProviderError, ToolError } from "../../src/core/errors.js";

describe("redaction (secret-leak scan)", () => {
	it("scrubs sensitive keys regardless of nesting", () => {
		const input = {
			authorization: "Bearer abc123",
			nested: { apiKey: "sk-0123456789abcdef0123", safe: "keep" },
			list: [{ token: "t-secret" }, "plain"],
		};
		const out = redact(input);
		expect(out.authorization).toBe(REDACTED);
		expect(out.nested.apiKey).toBe(REDACTED);
		expect(out.nested.safe).toBe("keep");
		expect((out.list[0] as { token: string }).token).toBe(REDACTED);
		expect(out.list[1]).toBe("plain");
	});

	it("scrubs credential-looking values inside strings", () => {
		const out = redact({ note: "use Bearer xyz.token.value to auth" });
		expect(out.note).toContain(REDACTED);
		expect(out.note).not.toContain("xyz.token.value");
	});

	it("does not mutate the input", () => {
		const input = { token: "secret" };
		redact(input);
		expect(input.token).toBe("secret");
	});

	it("handles circular references", () => {
		const a: Record<string, unknown> = { name: "a" };
		a.self = a;
		expect(() => redact(a)).not.toThrow();
	});

	it("error toJSON output contains no secret values", () => {
		const provErr = new ProviderError("failed", "auth", {
			details: { authorization: "Bearer leak-me" },
		});
		const json = JSON.stringify(provErr.toJSON());
		expect(json).not.toContain("leak-me");
		expect(json).toContain(REDACTED);

		const toolErr = new ToolError("bad", "invalid-arguments", "calc", {
			apiKey: "sk-shouldnotappear0000",
		});
		expect(JSON.stringify(toolErr.toJSON())).not.toContain("shouldnotappear");
	});
});
