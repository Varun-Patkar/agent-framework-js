import { describe, it, expect, afterEach } from "vitest";
import { requireCapability, resetRuntimeCache, detectRuntime } from "../../src/core/runtime.js";
import { RuntimeUnsupportedError } from "../../src/core/errors.js";

describe("runtime capability gating", () => {
	afterEach(() => resetRuntimeCache());

	it("detects Node runtime in the test environment", () => {
		expect(detectRuntime().isNode).toBe(true);
	});

	it("throws a typed unsupported error when a capability is missing", () => {
		const original = (globalThis as Record<string, unknown>)["process"];
		(globalThis as Record<string, unknown>)["process"] = undefined;
		resetRuntimeCache();
		try {
			expect(() => requireCapability("canSpawnProcess", "stdio")).toThrow(RuntimeUnsupportedError);
		} finally {
			(globalThis as Record<string, unknown>)["process"] = original;
			resetRuntimeCache();
		}
	});
});
