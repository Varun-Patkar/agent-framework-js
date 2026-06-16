/**
 * Pluggable storage abstraction for persisting conversation/thread state in a
 * no-backend environment. No database server is assumed. (FR-024)
 *
 * @packageDocumentation
 */

import type { Thread } from "../agents/thread.js";
import { Thread as ThreadClass } from "../agents/thread.js";

/** A minimal key/value store. */
export interface Store {
	get(key: string): Promise<unknown | undefined>;
	set(key: string, value: unknown): Promise<void>;
	delete(key: string): Promise<void>;
}

/** Save and load threads via a {@link Store}. */
export const ThreadPersistence = {
	/** Persist a thread under the key `thread:<id>`. */
	async save(store: Store, thread: Thread): Promise<void> {
		await store.set(`thread:${thread.id}`, thread.toJSON());
	},
	/** Load and rehydrate a thread, or undefined if absent. */
	async load(store: Store, id: string): Promise<Thread | undefined> {
		const data = (await store.get(`thread:${id}`)) as
			| { id: string; messages: never[]; compacted?: boolean }
			| undefined;
		return data ? ThreadClass.fromJSON(data) : undefined;
	},
};
