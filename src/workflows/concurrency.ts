/**
 * Bounded-concurrency execution with a configurable failure policy for concurrent
 * workflows. Fail-soft (default) aggregates partial results; fail-fast cancels
 * remaining work on the first failure. (FR-019b, FR-019c)
 *
 * @packageDocumentation
 */

/** How concurrent branches react to a failure. */
export type FailurePolicy = "fail-soft" | "fail-fast";

/** Per-branch outcome under fail-soft. */
export interface BranchResult<T> {
	index: number;
	value?: T;
	error?: Error;
}

/**
 * Run `tasks` with at most `maxConcurrency` in flight (-1 = unlimited).
 *
 * - `fail-soft`: every branch runs; failures are captured per-branch.
 * - `fail-fast`: the first failure rejects and remaining branches are abandoned.
 *
 * @returns Per-branch results (always, including under fail-fast where the failing
 *   branch carries the error). Under fail-fast this throws on first failure.
 */
export async function runBounded<T>(
	tasks: Array<() => Promise<T>>,
	maxConcurrency: number,
	policy: FailurePolicy,
): Promise<Array<BranchResult<T>>> {
	const limit = maxConcurrency === -1 ? tasks.length : Math.max(1, maxConcurrency);
	const results: Array<BranchResult<T>> = new Array(tasks.length);
	let next = 0;
	let failed: Error | undefined;

	async function worker(): Promise<void> {
		for (; ;) {
			if (policy === "fail-fast" && failed) return;
			const i = next++;
			if (i >= tasks.length) return;
			try {
				results[i] = { index: i, value: await tasks[i]!() };
			} catch (e) {
				const err = e as Error;
				results[i] = { index: i, error: err };
				if (policy === "fail-fast") {
					failed = err;
					return;
				}
			}
		}
	}

	const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
	await Promise.all(workers);

	if (policy === "fail-fast" && failed) throw failed;
	return results;
}
