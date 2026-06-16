/**
 * Middleware pipeline for intercepting and processing agent provider calls —
 * request/response transformation, custom pipelines, and error handling. (FR-023)
 *
 * @packageDocumentation
 */

import type { GenerateRequest, GenerateResponse } from "../providers/provider.js";

/** Context passed through the middleware chain for one provider call. */
export interface MiddlewareContext {
	/** The agent's name. */
	agentName: string;
	/** The outgoing request (may be mutated by middleware). */
	request: GenerateRequest;
}

/** Continue to the next middleware (or the provider call itself). */
export type Next = () => Promise<GenerateResponse>;

/** A pipeline interceptor. */
export interface Middleware {
	name: string;
	handle(ctx: MiddlewareContext, next: Next): Promise<GenerateResponse>;
}

/**
 * Compose middleware into a single function wrapping `core`.
 *
 * @param middleware - Ordered interceptors (first runs outermost).
 * @param core - The terminal operation (the actual provider call).
 */
export function composeMiddleware(
	middleware: Middleware[],
	core: (ctx: MiddlewareContext) => Promise<GenerateResponse>,
): (ctx: MiddlewareContext) => Promise<GenerateResponse> {
	return (ctx) => {
		let index = -1;
		const dispatch = (i: number): Promise<GenerateResponse> => {
			if (i <= index) return Promise.reject(new Error("next() called multiple times"));
			index = i;
			const mw = middleware[i];
			if (!mw) return core(ctx);
			return mw.handle(ctx, () => dispatch(i + 1));
		};
		return dispatch(0);
	};
}
