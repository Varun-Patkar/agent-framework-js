/**
 * Centralized secret redaction applied at every output boundary (logs, traces,
 * serialized errors). Security is secure-by-default: no credential value may
 * appear in any emitted output. (FR-026, FR-026a, Constitution II)
 *
 * @packageDocumentation
 */

/** Placeholder substituted for redacted values. */
export const REDACTED = "[REDACTED]";

/** Field names whose values are always scrubbed (case-insensitive substring match). */
const SENSITIVE_KEY_PATTERNS = [
	"authorization",
	"api-key",
	"apikey",
	"api_key",
	"token",
	"secret",
	"password",
	"passwd",
	"credential",
	"bearer",
	"x-api-key",
];

/** Value patterns that look like credentials even outside a known field. */
const SENSITIVE_VALUE_PATTERNS: RegExp[] = [
	/\bBearer\s+[A-Za-z0-9._-]+/gi,
	/\bsk-[A-Za-z0-9]{16,}/g, // OpenAI-style keys
	/\bgh[pousr]_[A-Za-z0-9]{20,}/g, // GitHub tokens
];

function isSensitiveKey(key: string): boolean {
	const k = key.toLowerCase();
	return SENSITIVE_KEY_PATTERNS.some((p) => k.includes(p));
}

function scrubString(value: string): string {
	let out = value;
	for (const re of SENSITIVE_VALUE_PATTERNS) {
		out = out.replace(re, REDACTED);
	}
	return out;
}

/**
 * Return a deep copy of `value` with secrets scrubbed. Safe for arbitrary
 * structures; handles cycles. Never mutates the input.
 *
 * @example
 * ```ts
 * redact({ authorization: "Bearer abc" }); // => { authorization: "[REDACTED]" }
 * ```
 */
export function redact<T>(value: T): T {
	return redactInner(value, new WeakSet()) as T;
}

function redactInner(value: unknown, seen: WeakSet<object>): unknown {
	if (typeof value === "string") return scrubString(value);
	if (value === null || typeof value !== "object") return value;

	if (seen.has(value as object)) return "[Circular]";
	seen.add(value as object);

	if (Array.isArray(value)) {
		return value.map((v) => redactInner(v, seen));
	}

	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
		out[k] = isSensitiveKey(k) ? REDACTED : redactInner(v, seen);
	}
	return out;
}
