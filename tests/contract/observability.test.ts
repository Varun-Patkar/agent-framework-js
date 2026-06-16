import { describe, it, expect, afterEach } from "vitest";
import {
	configureObservability,
	withSpan,
	resetObservability,
	isObservabilityEnabled,
} from "../../src/observability/tracing.js";

interface FakeSpan {
	attrs: Record<string, unknown>;
	ended: boolean;
}

function fakeTracer() {
	const spans: Array<{ name: string; span: FakeSpan }> = [];
	return {
		spans,
		startSpan(name: string) {
			const span: FakeSpan = { attrs: {}, ended: false };
			spans.push({ name, span });
			return {
				setAttribute(k: string, v: unknown) {
					span.attrs[k] = v;
				},
				setStatus() { },
				recordException() { },
				end() {
					span.ended = true;
				},
			};
		},
	};
}

describe("US7 observability (contract)", () => {
	afterEach(() => resetObservability());

	it("emits a span when enabled and redacts attributes", async () => {
		const tracer = fakeTracer();
		configureObservability({ tracer, enabled: true });
		expect(isObservabilityEnabled()).toBe(true);

		const result = await withSpan("agent.run", { authorization: "Bearer leak" }, async () => 42);
		expect(result).toBe(42);
		expect(tracer.spans).toHaveLength(1);
		expect(tracer.spans[0].name).toBe("agent.run");
		expect(tracer.spans[0].span.attrs["authorization"]).toBe("[REDACTED]");
		expect(tracer.spans[0].span.ended).toBe(true);
	});

	it("runs the function without a span when disabled", async () => {
		const result = await withSpan("x", {}, async () => "ok");
		expect(result).toBe("ok");
		expect(isObservabilityEnabled()).toBe(false);
	});
});
