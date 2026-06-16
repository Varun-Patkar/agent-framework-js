/**
 * Convenience helper for attaching middleware to an agent configuration.
 * Middleware is applied around provider calls when the agent runs. (FR-023)
 *
 * @packageDocumentation
 */

import type { AgentConfig } from "../agents/agent.js";
import type { Middleware } from "./middleware.js";

/**
 * Return a copy of `config` with the given middleware appended.
 *
 * @example
 * ```ts
 * const cfg = useMiddleware(baseConfig, loggingMiddleware, retryMiddleware);
 * const agent = createAgent(cfg);
 * ```
 */
export function useMiddleware(config: AgentConfig, ...middleware: Middleware[]): AgentConfig {
	return { ...config, middleware: [...(config.middleware ?? []), ...middleware] };
}
