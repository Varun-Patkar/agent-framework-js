/**
 * Typed error hierarchy. Every failure surfaced by the framework is one of these
 * typed errors so callers (and agents) can branch on `kind` rather than parsing
 * messages. All error serialization passes through redaction (see `redaction.ts`).
 *
 * @packageDocumentation
 */

import { redact } from "./redaction.js";

/** Discriminator for {@link FrameworkError} subclasses. */
export type ErrorKind =
	| "provider"
	| "tool"
	| "mcp"
	| "checkpoint"
	| "runtime-unsupported"
	| "validation";

/** Base class for all framework errors. */
export abstract class FrameworkError extends Error {
	abstract readonly kind: ErrorKind;
	/** Optional structured details (already redaction-safe at serialization time). */
	readonly details?: Record<string, unknown>;

	constructor(message: string, details?: Record<string, unknown>) {
		super(message);
		this.name = new.target.name;
		this.details = details;
	}

	/** Redaction-safe JSON form used by logs/traces. */
	toJSON(): Record<string, unknown> {
		return redact({
			name: this.name,
			kind: this.kind,
			message: this.message,
			details: this.details,
		});
	}
}

/** Reason a provider call failed. Transient reasons are retryable. */
export type ProviderErrorReason =
	| "transient" // 429/5xx/network/timeout — retryable
	| "auth" // 401/403 — fail fast
	| "client" // other 4xx — fail fast
	| "malformed"; // unparseable/incomplete response

/** LLM provider failure. (FR-008a) */
export class ProviderError extends FrameworkError {
	readonly kind = "provider" as const;
	readonly reason: ProviderErrorReason;
	readonly status?: number;

	constructor(
		message: string,
		reason: ProviderErrorReason,
		opts?: { status?: number; details?: Record<string, unknown> },
	) {
		super(message, opts?.details);
		this.reason = reason;
		this.status = opts?.status;
	}

	/** Whether this error should be retried with backoff. */
	get retryable(): boolean {
		return this.reason === "transient";
	}
}

/** Reason a tool invocation failed. */
export type ToolErrorReason =
	| "not-found"
	| "invalid-arguments"
	| "timeout"
	| "run-failure";

/** Tool invocation failure. (FR-011a, FR-012c) */
export class ToolError extends FrameworkError {
	readonly kind = "tool" as const;
	readonly reason: ToolErrorReason;
	readonly toolName: string;

	constructor(
		message: string,
		reason: ToolErrorReason,
		toolName: string,
		details?: Record<string, unknown>,
	) {
		super(message, details);
		this.reason = reason;
		this.toolName = toolName;
	}
}

/** MCP server failure (e.g., unavailable). (FR-015) */
export class MCPError extends FrameworkError {
	readonly kind = "mcp" as const;
	readonly serverId: string;

	constructor(message: string, serverId: string, details?: Record<string, unknown>) {
		super(message, details);
		this.serverId = serverId;
	}
}

/** Reason a checkpoint could not be restored. (FR-022a) */
export type CheckpointErrorReason = "corrupt" | "version-mismatch";

/** Checkpoint restore failure. Fails closed — no partial restore. */
export class CheckpointError extends FrameworkError {
	readonly kind = "checkpoint" as const;
	readonly reason: CheckpointErrorReason;

	constructor(message: string, reason: CheckpointErrorReason, details?: Record<string, unknown>) {
		super(message, details);
		this.reason = reason;
	}
}

/** A feature was requested that the current runtime cannot support. (FR-030a) */
export class RuntimeUnsupportedError extends FrameworkError {
	readonly kind = "runtime-unsupported" as const;
	readonly feature: string;

	constructor(feature: string, details?: Record<string, unknown>) {
		super(`Feature "${feature}" is not supported in the current runtime`, details);
		this.feature = feature;
	}
}

/** Schema validation failure. (FR-011) */
export class ValidationError extends FrameworkError {
	readonly kind = "validation" as const;

	constructor(message: string, details?: Record<string, unknown>) {
		super(message, details);
	}
}
