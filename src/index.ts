/**
 * agent-framework-js — a modular, tree-shakeable agent framework for no-backend
 * deployments (browser, edge, Node).
 *
 * Prefer deep imports (e.g. `agent-framework-js/agents`) for the smallest bundle;
 * this root re-exports the full public surface for convenience.
 *
 * @packageDocumentation
 */
export * from "./core/index.js";
export * from "./providers/index.js";
export * from "./tools/index.js";
export * from "./agents/index.js";
export * from "./mcp/index.js";
export * from "./skills/index.js";
export * from "./workflows/index.js";
export * from "./middleware/index.js";
export * from "./persistence/index.js";
export * from "./observability/index.js";
export * from "./declarative/index.js";
