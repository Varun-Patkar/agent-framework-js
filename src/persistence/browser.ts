/**
 * Browser store adapters backed by `localStorage` or `IndexedDB`. Capability-gated
 * so a clear typed error is thrown if used where unavailable. (FR-024, FR-030a)
 *
 * @packageDocumentation
 */

import type { Store } from "./store.js";
import { requireCapability } from "../core/runtime.js";

/** Options for {@link createBrowserStore}. */
export interface BrowserStoreOptions {
	/** Storage backend. Default "local". */
	backend?: "local" | "indexeddb";
	/** Key namespace/prefix. Default "afjs". */
	namespace?: string;
}

/** Create a browser-backed {@link Store}. */
export function createBrowserStore(options: BrowserStoreOptions = {}): Store {
	const backend = options.backend ?? "local";
	const ns = options.namespace ?? "afjs";
	return backend === "indexeddb" ? indexedDbStore(ns) : localStorageStore(ns);
}

function localStorageStore(ns: string): Store {
	requireCapability("hasLocalStorage", "localStorage store");
	const ls = (globalThis as unknown as { localStorage: Storage }).localStorage;
	const k = (key: string) => `${ns}:${key}`;
	return {
		async get(key) {
			const raw = ls.getItem(k(key));
			return raw == null ? undefined : JSON.parse(raw);
		},
		async set(key, value) {
			ls.setItem(k(key), JSON.stringify(value));
		},
		async delete(key) {
			ls.removeItem(k(key));
		},
	};
}

function indexedDbStore(ns: string): Store {
	requireCapability("hasIndexedDB", "IndexedDB store");
	const idb = (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB;

	function open(): Promise<IDBDatabase> {
		return new Promise((resolve, reject) => {
			const req = idb.open(ns, 1);
			req.onupgradeneeded = () => req.result.createObjectStore("kv");
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
	}

	async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
		const db = await open();
		return new Promise<T>((resolve, reject) => {
			const store = db.transaction("kv", mode).objectStore("kv");
			const req = fn(store);
			req.onsuccess = () => resolve(req.result as T);
			req.onerror = () => reject(req.error);
		});
	}

	return {
		async get(key) {
			return tx<unknown>("readonly", (s) => s.get(key));
		},
		async set(key, value) {
			await tx("readwrite", (s) => s.put(value, key));
		},
		async delete(key) {
			await tx("readwrite", (s) => s.delete(key));
		},
	};
}
