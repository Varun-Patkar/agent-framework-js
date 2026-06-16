import { describe, it, expect } from "vitest";
import { composeMiddleware, type Middleware } from "../../src/middleware/middleware.js";
import { useMiddleware } from "../../src/middleware/use.js";
import { createAgent } from "../../src/agents/agent.js";
import { mockProvider } from "../helpers/mockProvider.js";
import type { GenerateResponse } from "../../src/providers/provider.js";

describe("middleware (contract)", () => {
	it("composes middleware around the core call in order", async () => {
		const order: string[] = [];
		const mw = (name: string): Middleware => ({
			name,
			async handle(ctx, next) {
				order.push(`${name}:before`);
				const res = await next();
				order.push(`${name}:after`);
				return res;
			},
		});
		const run = composeMiddleware([mw("a"), mw("b")], async () => {
			order.push("core");
			return { text: "ok" } as GenerateResponse;
		});
		const res = await run({ agentName: "t", request: { messages: [] } });
		expect(res.text).toBe("ok");
		expect(order).toEqual(["a:before", "b:before", "core", "b:after", "a:after"]);
	});

	it("lets middleware transform the response", async () => {
		const upper: Middleware = {
			name: "upper",
			async handle(_ctx, next) {
				const res = await next();
				return { ...res, text: res.text.toUpperCase() };
			},
		};
		const cfg = useMiddleware(
			{ name: "M", instructions: "x", provider: mockProvider({ responses: [{ text: "hi" }] }) },
			upper,
		);
		const agent = createAgent(cfg);
		const res = await agent.run("x");
		expect(res.output).toBe("HI");
	});
});
