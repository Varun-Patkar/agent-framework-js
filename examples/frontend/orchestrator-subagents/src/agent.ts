/**
 * Browser-side framework helpers. See the single-agent example for the full
 * explanation of the frontend nuances (user-pasted Copilot token, Vite proxy for
 * CORS, and HTTP-only MCP in the browser).
 */
import {
	createCopilotProvider,
	createOpenAICompatibleProvider,
	type Provider,
} from "agent-framework-js/providers";
import { connectMCP } from "agent-framework-js/mcp";

export type ProviderKind = "copilot" | "lmstudio";

export function makeProvider(kind: ProviderKind, token: string): Provider {
	if (kind === "copilot") {
		if (!token.trim()) throw new Error("Paste your GitHub Copilot token first.");
		return createCopilotProvider({
			getCredential: () => token,
			capabilities: { model: "gpt-4o", maxInputTokens: 128000, maxOutputTokens: 16000 },
			baseUrl: "/copilot",
		});
	}
	return createOpenAICompatibleProvider({
		baseUrl: "/lmstudio/v1",
		getCredential: () => "lm-studio",
		capabilities: { model: "local-model", maxInputTokens: 262144, maxOutputTokens: 32000 },
	});
}

export async function connectCalculator() {
	const url = new URL("/mcp-calc/mcp", location.origin).toString();
	const mcp = await connectMCP({ id: "calc", transport: { kind: "remote", url } });
	await mcp.connect();
	return { tools: await mcp.listTools(), close: () => mcp.close() };
}
