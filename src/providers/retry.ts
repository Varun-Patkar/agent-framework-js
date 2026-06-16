/**
 * Exponential-backoff retry for transient provider failures. Transient errors
 * (429 with Retry-After, 5xx, network/timeout) are retried; auth/4xx fail fast.
 * (FR-008a)
 *
 * @packageDocumentation
 */

import { ProviderError } from "../core/errors.js";

/** Retry tuning. All fields have safe defaults. */
export interface RetryOptions {
	/** Maximum retry attempts after the first try. Default 3. */
	maxRetries?: number;
	/** Base delay in ms for backoff. Default 250. */
	baseDelayMs?: number;
	/** Maximum delay cap in ms. Default 8000. */
	maxDelayMs?: number;
}

const DEFAULTS: Required<RetryOptions> = {
	maxRetries: 3,
	baseDelayMs: 250,
	maxDelayMs: 8000,
};

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

/**
 * Run `fn`, retrying transient {@link ProviderError}s with exponential backoff
 * and jitter. Non-transient errors are rethrown immediately (fail fast).
 *
 * @param fn - The operation to attempt. It should throw a {@link ProviderError}.
 * @param opts - Retry tuning.
 * @param retryAfterMs - Optional hook returning a server-specified delay (Retry-After).
 */
export async function withRetry<T>(
	fn: () => Promise<T>,
	opts?: RetryOptions,
	retryAfterMs?: (err: ProviderError) => number | undefined,
): Promise<T> {
	const cfg = { ...DEFAULTS, ...opts };
	let attempt = 0;

	for (; ;) {
		try {
			return await fn();
		} catch (err) {
			const isRetryable = err instanceof ProviderError && err.retryable;
			if (!isRetryable || attempt >= cfg.maxRetries) {
				throw err;
			}
			const serverDelay = retryAfterMs?.(err as ProviderError);
			const backoff = Math.min(cfg.baseDelayMs * 2 ** attempt, cfg.maxDelayMs);
			const jitter = Math.random() * cfg.baseDelayMs;
			await sleep(serverDelay ?? backoff + jitter);
			attempt++;
		}
	}
}

/** Map an HTTP status to a {@link ProviderError} with the right retry semantics. */
export function providerErrorFromStatus(status: number, message: string): ProviderError {
	if (status === 429 || status >= 500) {
		return new ProviderError(message, "transient", { status });
	}
	if (status === 401 || status === 403) {
		return new ProviderError(message, "auth", { status });
	}
	return new ProviderError(message, "client", { status });
}
