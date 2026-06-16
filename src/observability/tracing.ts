/**
 * Observability via OpenTelemetry. Consumers supply their own tracer/exporters;
 * the framework emits spans for agent/tool/provider/workflow operations and routes
 * all attributes and errors through redaction so no secret ever leaks. (FR-025,
 * FR-026, FR-026a)
 *
 * The `@opentelemetry/api` package is an optional peer dependency.
 *
 * @packageDocumentation
 */

import { redact } from "../core/redaction.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Tracer = any;

interface ObservabilityState {
	tracer?: Tracer;
	enabled: boolean;
}

const state: ObservabilityState = { enabled: false };

/** Configuration for {@link configureObservability}. */
export interface ObservabilityConfig {
	/** A consumer-supplied OpenTelemetry tracer. */
	tracer?: Tracer;
	/** Whether tracing is active. Default false. */
	enabled?: boolean;
}

/** Enable/disable tracing and set the tracer. */
export function configureObservability(config: ObservabilityConfig): void {
	state.tracer = config.tracer;
	state.enabled = config.enabled ?? !!config.tracer;
}

/** Re-export of the redaction helper for convenience. (FR-026a) */
export { redact };

/**
 * Run `fn` inside a span named `name`. Attributes are redacted before being set.
 * If tracing is disabled or no tracer is configured, `fn` runs without a span.
 *
 * @param name - Span name, e.g. `agent.run`, `tool.invoke`.
 * @param attributes - Span attributes (redacted automatically).
 * @param fn - The operation to trace.
 */
export async function withSpan<T>(
	name: string,
	attributes: Record<string, unknown>,
	fn: () => Promise<T>,
): Promise<T> {
	if (!state.enabled || !state.tracer) return fn();

	const span = state.tracer.startSpan(name);
	const safe = redact(attributes);
	for (const [k, v] of Object.entries(safe)) {
		span.setAttribute(k, typeof v === "object" ? JSON.stringify(v) : (v as never));
	}
	try {
		const result = await fn();
		span.setStatus?.({ code: 1 }); // OK
		return result;
	} catch (e) {
		span.setStatus?.({ code: 2, message: (e as Error).message }); // ERROR
		span.recordException?.(redact({ message: (e as Error).message }));
		throw e;
	} finally {
		span.end();
	}
}

/** Whether tracing is currently active. */
export function isObservabilityEnabled(): boolean {
	return state.enabled && !!state.tracer;
}

/** Reset observability state — intended for tests. */
export function resetObservability(): void {
	state.tracer = undefined;
	state.enabled = false;
}
