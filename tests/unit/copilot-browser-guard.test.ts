import { describe, it, expect, afterEach } from "vitest";
import { createCopilotProvider } from "../../src/providers/copilot.js";
import { resetRuntimeCache } from "../../src/core/runtime.js";
import { RuntimeUnsupportedError } from "../../src/core/errors.js";

const caps = { model: "gpt-4o", maxInputTokens: 1000, maxOutputTokens: 500 };

/** Run `fn` with a faked browser global (window.document), then restore. */
function withBrowser<T>(fn: () => T): T {
	const g = globalThis as Record<string, unknown>;
	const originalWindow = g["window"];
	g["window"] = { document: {} };
	resetRuntimeCache();
	try {
		return fn();
	} finally {
		if (originalWindow === undefined) delete g["window"];
		else g["window"] = originalWindow;
		resetRuntimeCache();
	}
}

describe("Copilot frontend-only guard", () => {
	afterEach(() => resetRuntimeCache());

	it("throws a typed RuntimeUnsupportedError in a browser against the default host", () => {
		withBrowser(() => {
			expect(() => createCopilotProvider({ getCredential: () => "t", capabilities: caps })).toThrow(
				RuntimeUnsupportedError,
			);
		});
	});

	it("allows construction in a browser when a custom baseUrl (proxy) is set", () => {
		withBrowser(() => {
			const provider = createCopilotProvider({
				getCredential: () => "t",
				capabilities: caps,
				baseUrl: "https://my-proxy.example.com/copilot",
			});
			expect(provider.name).toBe("copilot");
		});
	});

	it("does not block server-side (Node) construction against the default host", () => {
		const provider = createCopilotProvider({ getCredential: () => "t", capabilities: caps });
		expect(provider.name).toBe("copilot");
	});
});
