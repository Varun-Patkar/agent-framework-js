import type {
	Provider,
	GenerateRequest,
	GenerateResponse,
	GenerateChunk,
	ToolCall,
} from "../../src/providers/provider.js";
import type { ModelCapabilities } from "../../src/core/types.js";

const defaultCaps: ModelCapabilities = {
	model: "mock",
	maxInputTokens: 8000,
	maxOutputTokens: 2000,
};

/** A scripted provider for deterministic tests. */
export function mockProvider(opts?: {
	capabilities?: Partial<ModelCapabilities>;
	/** Queue of responses returned in order by `generate`. */
	responses?: GenerateResponse[];
	/** Streaming chunks for `generateStream`. */
	streamChunks?: GenerateChunk[];
	/** Records each request for assertions. */
	onRequest?: (req: GenerateRequest) => void;
}): Provider {
	const responses = [...(opts?.responses ?? [{ text: "ok" }])];
	const capabilities = { ...defaultCaps, ...opts?.capabilities };
	return {
		name: "mock",
		capabilities,
		models: [capabilities],
		model: () => capabilities,
		async generate(req) {
			opts?.onRequest?.(req);
			return responses.shift() ?? { text: "done" };
		},
		async *generateStream(req) {
			opts?.onRequest?.(req);
			const chunks =
				opts?.streamChunks ?? [
					{ type: "text", text: "hel" },
					{ type: "text", text: "lo" },
					{ type: "done", response: { text: "hello" } },
				];
			for (const c of chunks) yield c;
		},
	};
}

/** Helper to build a tool call. */
export function toolCall(name: string, args: unknown, id = "c1"): ToolCall {
	return { id, name, arguments: args };
}
