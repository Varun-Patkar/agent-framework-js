/**
 * Runtime capability detection. The framework runs in browsers, edge runtimes,
 * and Node. Features that need Node-only APIs (process spawning, filesystem) are
 * gated behind these checks and throw {@link RuntimeUnsupportedError} when used
 * in a runtime that cannot support them. (FR-030, FR-030a)
 *
 * @packageDocumentation
 */

import { RuntimeUnsupportedError } from "./errors.js";

/** Describes which optional capabilities the current runtime supports. */
export interface RuntimeCapabilities {
	/** Can spawn child processes (Node only) — required for stdio MCP transport. */
	canSpawnProcess: boolean;
	/** Has `localStorage` available (browsers). */
	hasLocalStorage: boolean;
	/** Has `indexedDB` available (browsers). */
	hasIndexedDB: boolean;
	/** Running under Node.js. */
	isNode: boolean;
	/**
	 * Running inside a web browser (has `window`/`document`). Distinguished from
	 * edge runtimes, which also lack Node but make server-side (CORS-free) requests.
	 */
	isBrowser: boolean;
}

let cached: RuntimeCapabilities | undefined;

/** Detect the current runtime's capabilities (memoized). */
export function detectRuntime(): RuntimeCapabilities {
	if (cached) return cached;

	const g = globalThis as Record<string, unknown>;
	const proc = g["process"] as { versions?: { node?: string } } | undefined;
	const isNode = typeof proc !== "undefined" && !!proc.versions?.node;
	const win = g["window"] as { document?: unknown } | undefined;
	const isBrowser = typeof win !== "undefined" && typeof win.document !== "undefined";

	cached = {
		isNode,
		isBrowser,
		// Process spawning requires Node's child_process; treat Node as capable.
		canSpawnProcess: isNode,
		hasLocalStorage: typeof g["localStorage"] !== "undefined",
		hasIndexedDB: typeof g["indexedDB"] !== "undefined",
	};
	return cached;
}

/**
 * Assert that a runtime capability is present, throwing a typed error otherwise.
 *
 * @param capability - The capability key to require.
 * @param feature - Human-readable feature name used in the error message.
 * @throws {RuntimeUnsupportedError} when the capability is unavailable.
 */
export function requireCapability(
	capability: keyof RuntimeCapabilities,
	feature: string,
): void {
	if (!detectRuntime()[capability]) {
		throw new RuntimeUnsupportedError(feature, { capability });
	}
}

/** Reset the memoized detection — intended for tests only. */
export function resetRuntimeCache(): void {
	cached = undefined;
}
