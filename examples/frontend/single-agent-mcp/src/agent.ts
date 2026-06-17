/**
 * Browser-side framework helpers shared by this example.
 *
 * Frontend nuances captured here:
 *  - The Copilot token CANNOT be shipped from a server — the user pastes their
 *    own token in the UI and we pass it through `getCredential`.
 *  - The browser cannot reach `api.githubcopilot.com` directly (no CORS), so the
 *    Copilot provider points `baseUrl` at the Vite `/copilot` proxy, which also
 *    lifts the framework's browser CORS guard.
 *  - Only HTTP (remote) MCP works in the browser — stdio would require spawning a
 *    process, which the runtime gate forbids outside Node.
 */
import {
	createCopilotProvider,
	createOpenAICompatibleProvider,
	type Provider,
} from "agent-framework-js/providers";
import { connectMCP } from "agent-framework-js/mcp";

export type ProviderKind = "copilot" | "lmstudio";

/** Build the selected provider. `token` is only needed (and used) for Copilot. */
export function makeProvider(kind: ProviderKind, token: string): Provider {
	if (kind === "copilot") {
		if (!token.trim()) throw new Error("Paste your GitHub Copilot token first.");
		return createCopilotProvider({
			getCredential: () => token, // user-supplied; never persisted
			capabilities: { model: "gpt-4o", maxInputTokens: 128000, maxOutputTokens: 16000 },
			baseUrl: "/copilot", // Vite proxy → bypasses the browser CORS guard
		});
	}
	// LM Studio: the user runs it locally; proxied through Vite to avoid CORS.
	return createOpenAICompatibleProvider({
		baseUrl: "/lmstudio/v1",
		getCredential: () => "lm-studio",
		capabilities: { model: "local-model", maxInputTokens: 262144, maxOutputTokens: 32000 },
	});
}

/** Connect the calculator MCP server over HTTP (the only browser-safe transport). */
export async function connectCalculator() {
	const url = new URL("/mcp-calc/mcp", location.origin).toString();
	const mcp = await connectMCP({ id: "calc", transport: { kind: "remote", url } });
	await mcp.connect();
	return { tools: await mcp.listTools(), close: () => mcp.close() };
}
