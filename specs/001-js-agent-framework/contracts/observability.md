# Contract: Observability

Maps to FR-025, FR-026, FR-026a.

```ts
import type { Tracer } from "@opentelemetry/api";

export interface ObservabilityConfig {
	tracer?: Tracer; // consumer-supplied OTel tracer (FR-025)
	enabled?: boolean; // default false
}

export function configureObservability(cfg: ObservabilityConfig): void;

// Internally, spans are emitted for: agent.run, provider.generate, tool.invoke, workflow.step.
// All span attributes, logs, and serialized errors pass through redaction (FR-026a).
export function redact<T>(value: T): T; // scrubs known credential fields/patterns (FR-026a)
```

**Contract rules**

- Tracing uses OpenTelemetry; consumers wire their own SDK/exporters; works in browser/edge (FR-025).
- No secret or credential value appears in any span, log, or error — guaranteed by centralized
  redaction at every output boundary (FR-026/026a, SC-006).

**Contract tests**

- spans emitted for run/tool/provider/workflow when enabled.
- redaction removes credential fields from attributes and serialized errors (secret-leak scan).
