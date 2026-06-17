import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** See single-agent example for why each proxy exists (CORS / browser reach). */
export default defineConfig({
	plugins: [react()],
	server: {
		port: 5103,
		proxy: {
			"/copilot": { target: "https://api.githubcopilot.com", changeOrigin: true, rewrite: (p) => p.replace(/^\/copilot/, "") },
			"/lmstudio": { target: "http://localhost:1234", changeOrigin: true, rewrite: (p) => p.replace(/^\/lmstudio/, "") },
			"/mcp-calc": { target: "https://calculator.caseyjhand.com", changeOrigin: true, rewrite: (p) => p.replace(/^\/mcp-calc/, "") },
		},
	},
});
