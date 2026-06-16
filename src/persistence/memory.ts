/**
 * In-memory store adapter. Works in every runtime; ideal as a default and for tests.
 * @packageDocumentation
 */

import type { Store } from "./store.js";

/** Create an in-memory {@link Store}. */
export function createMemoryStore(): Store {
	const map = new Map<string, unknown>();
	return {
		async get(key) {
			return map.get(key);
		},
		async set(key, value) {
			map.set(key, value);
		},
		async delete(key) {
			map.delete(key);
		},
	};
}
