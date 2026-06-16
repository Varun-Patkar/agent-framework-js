import { describe, it, expect } from "vitest";
import { createMemoryStore } from "../../src/persistence/memory.js";
import { ThreadPersistence } from "../../src/persistence/store.js";
import { Thread } from "../../src/agents/thread.js";
import { textMessage } from "../../src/core/types.js";

describe("US6 persistence (contract)", () => {
	it("round-trips a thread through the memory store", async () => {
		const store = createMemoryStore();
		const thread = new Thread("t1", [textMessage("user", "hello")]);
		thread.add(textMessage("assistant", "hi"));
		await ThreadPersistence.save(store, thread);

		const loaded = await ThreadPersistence.load(store, "t1");
		expect(loaded).toBeDefined();
		expect(loaded?.messages).toHaveLength(2);
		expect(loaded?.id).toBe("t1");
	});

	it("returns undefined for a missing thread", async () => {
		const store = createMemoryStore();
		expect(await ThreadPersistence.load(store, "nope")).toBeUndefined();
	});
});
