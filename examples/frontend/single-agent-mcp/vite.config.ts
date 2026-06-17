import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Dev-server proxies that make a no-backend browser app work:
 *  - /copilot   → api.githubcopilot.com  (Copilot sends no CORS headers, so the
 *                 browser must talk to a same-origin proxy; this also lifts the
 *                 framework's browser CORS guard when baseUrl points here).
 *  - /lmstudio  → local LM Studio server.
 *  - /mcp-calc  → hosted streamable-http calculator MCP server.
 */
export default defineConfig({
	plugins: [react()],
	server: {
		port: 5101,
		proxy: {
			"/copilot": {
				target: "https://api.githubcopilot.com",
				changeOrigin: true,
				rewrite: (p) => p.replace(/^\/copilot/, ""),
			},
			"/lmstudio": {
				target: "http://localhost:1234",
				changeOrigin: true,
				rewrite: (p) => p.replace(/^\/lmstudio/, ""),
			},
			"/mcp-calc": {
				target: "https://calculator.caseyjhand.com",
				changeOrigin: true,
				rewrite: (p) => p.replace(/^\/mcp-calc/, ""),
			},
		},
	},
});
