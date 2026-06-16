# Contract: Persistence

Maps to FR-024.

```ts
export interface Store {
	get(key: string): Promise<unknown | undefined>;
	set(key: string, value: unknown): Promise<void>;
	delete(key: string): Promise<void>;
}

export function createMemoryStore(): Store; // default, all runtimes
export function createBrowserStore(opts?: {
	// localStorage / IndexedDB (FR-024)
	backend?: "local" | "indexeddb";
	namespace?: string;
}): Store;
// createNodeFsStore is available only in Node runtimes (capability-gated, FR-030a).

export interface ThreadPersistence {
	save(store: Store, thread: Thread): Promise<void>;
	load(store: Store, id: string): Promise<Thread | undefined>;
}
```

**Contract rules**

- Storage is pluggable; no database server is assumed (FR-024).
- A thread saved and later loaded restores prior context intact (FR-024 / User Story 6).
- Node-only adapters are capability-gated and throw `RuntimeUnsupportedError` elsewhere (FR-030a).

**Contract tests**

- memory + browser stores round-trip a thread.
- restored thread continues the conversation with context retained.
