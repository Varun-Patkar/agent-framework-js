import { describe, it, expect } from "vitest";
import { createOpenAICompatibleProvider } from "../../src/providers/openai-compatible.js";
import { createCopilotProvider } from "../../src/providers/copilot.js";
import { ProviderError } from "../../src/core/errors.js";
import type { Message } from "../../src/core/types.js";

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

/** Build a streaming SSE Response from raw `data:` payload objects. */
function sseResponse(events: unknown[]): Response {
	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const e of events) {
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
			}
			controller.enqueue(encoder.encode("data: [DONE]\n\n"));
			controller.close();
		},
	});
	return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
}

const caps = { model: "m", maxInputTokens: 1000, maxOutputTokens: 500 };

describe("provider compat: tool-name sanitization (bug 1)", () => {
	it("sanitizes dotted tool names on the wire and translates calls back", async () => {
		let sentBody: Record<string, unknown> = {};
		const provider = createOpenAICompatibleProvider({
			baseUrl: "http://x/v1",
			getCredential: () => "t",
			capabilities: caps,
			fetchImpl: async (_url, init) => {
				sentBody = JSON.parse(init?.body as string);
				return jsonResponse({
					choices: [
						{
							message: {
								content: "",
								tool_calls: [
									{ id: "c1", function: { name: "webiq_browse", arguments: '{"q":"hi"}' } },
								],
							},
						},
					],
				});
			},
		});

		const res = await provider.generate({
			messages: [{ role: "user", parts: [{ type: "text", text: "go" }] }],
			tools: [{ name: "webiq.browse", description: "d", inputSchema: { type: "object" } }],
		});

		// Wire spec name is sanitized.
		const tools = sentBody.tools as Array<{ function: { name: string } }>;
		expect(tools[0].function.name).toBe("webiq_browse");
		// Returned call name is translated back to the registry key.
		expect(res.toolCalls?.[0].name).toBe("webiq.browse");
		expect(res.toolCalls?.[0].arguments).toEqual({ q: "hi" });
	});
});

describe("provider compat: assistant tool_calls emission (bug 3)", () => {
	it("emits tool_calls with content:null for an assistant tool-call turn", async () => {
		let sentBody: Record<string, unknown> = {};
		const provider = createOpenAICompatibleProvider({
			baseUrl: "http://x/v1",
			getCredential: () => "t",
			capabilities: caps,
			fetchImpl: async (_url, init) => {
				sentBody = JSON.parse(init?.body as string);
				return jsonResponse({ choices: [{ message: { content: "ok" } }] });
			},
		});

		const messages: Message[] = [
			{ role: "user", parts: [{ type: "text", text: "go" }] },
			{
				role: "assistant",
				parts: [],
				toolCalls: [{ id: "c1", name: "webiq.browse", arguments: { q: "hi" } }],
			},
			{ role: "tool", name: "webiq.browse", toolCallId: "c1", parts: [{ type: "text", text: "{}" }] },
		];
		await provider.generate({ messages });

		const wireMessages = sentBody.messages as Array<{
			role: string;
			content: unknown;
			tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
		}>;
		const assistant = wireMessages[1];
		expect(assistant.content).toBeNull();
		expect(assistant.tool_calls?.[0]).toMatchObject({
			id: "c1",
			type: "function",
			function: { name: "webiq_browse", arguments: '{"q":"hi"}' },
		});
	});
});

describe("provider compat: streaming tool-call accumulation (bug 4a)", () => {
	it("accumulates delta.tool_calls keyed by index (non-zero start)", async () => {
		const provider = createOpenAICompatibleProvider({
			baseUrl: "http://x/v1",
			getCredential: () => "t",
			capabilities: { ...caps, supportsReasoning: true },
			fetchImpl: async () =>
				sseResponse([
					{ choices: [{ delta: { reasoning: "thinking..." } }] },
					// Tool-call fragments begin at index 2 (reasoning occupied 0/1).
					{ choices: [{ delta: { tool_calls: [{ index: 2, id: "c9", function: { name: "webiq_browse", arguments: '{"q":' } }] } }] },
					{ choices: [{ delta: { tool_calls: [{ index: 2, function: { arguments: '"hi"}' } }] } }] },
				]),
		});

		const chunks = [];
		for await (const c of provider.generateStream({
			messages: [{ role: "user", parts: [{ type: "text", text: "go" }] }],
			tools: [{ name: "webiq.browse", description: "d", inputSchema: { type: "object" } }],
		})) {
			chunks.push(c);
		}

		const toolCallChunk = chunks.find((c) => c.type === "tool-call");
		expect(toolCallChunk).toBeDefined();
		const done = chunks.find((c) => c.type === "done");
		expect(done?.type === "done" && done.response.toolCalls?.[0]).toMatchObject({
			id: "c9",
			name: "webiq.browse",
			arguments: { q: "hi" },
		});
	});
});

describe("provider compat: generate stream-assembly fallback (bug 4b)", () => {
	it("re-requests via streaming when finish_reason is tool_calls but none are returned", async () => {
		let call = 0;
		const provider = createOpenAICompatibleProvider({
			baseUrl: "http://x/v1",
			getCredential: () => "t",
			capabilities: { ...caps, supportsReasoning: true },
			fetchImpl: async (_url, init) => {
				call++;
				const streaming = JSON.parse(init?.body as string).stream === true;
				if (!streaming) {
					// Non-streaming: reasoning model signals tool_calls but omits the array.
					return jsonResponse({
						choices: [{ finish_reason: "tool_calls", message: { content: "I'll research…" } }],
					});
				}
				// Streaming: the tool call actually materializes.
				return sseResponse([
					{ choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "webiq_browse", arguments: "{}" } }] } }] },
				]);
			},
		});

		const res = await provider.generate({
			messages: [{ role: "user", parts: [{ type: "text", text: "go" }] }],
			tools: [{ name: "webiq.browse", description: "d", inputSchema: { type: "object" } }],
		});

		expect(call).toBe(2); // non-streaming, then streaming fallback
		expect(res.toolCalls?.[0].name).toBe("webiq.browse");
	});

	it("throws a typed ProviderError when no tool calls materialize even when streamed", async () => {
		const provider = createOpenAICompatibleProvider({
			baseUrl: "http://x/v1",
			getCredential: () => "t",
			capabilities: caps,
			fetchImpl: async (_url, init) => {
				const streaming = JSON.parse(init?.body as string).stream === true;
				if (!streaming) {
					return jsonResponse({ choices: [{ finish_reason: "tool_calls", message: { content: "" } }] });
				}
				return sseResponse([{ choices: [{ delta: { content: "no tools here" } }] }]);
			},
			retry: { maxRetries: 0 },
		});

		await expect(
			provider.generate({
				messages: [{ role: "user", parts: [{ type: "text", text: "go" }] }],
				tools: [{ name: "t", description: "d", inputSchema: { type: "object" } }],
			}),
		).rejects.toBeInstanceOf(ProviderError);
	});
});

describe("provider compat: Copilot headers (bug 2)", () => {
	it("sends the required Copilot identification headers by default", async () => {
		let seen: Record<string, string> = {};
		const provider = createCopilotProvider({
			getCredential: () => "tok",
			capabilities: caps,
			fetchImpl: async (_url, init) => {
				seen = init?.headers as Record<string, string>;
				return jsonResponse({ choices: [{ message: { content: "hi" } }] });
			},
		});
		await provider.generate({ messages: [{ role: "user", parts: [{ type: "text", text: "x" }] }] });
		expect(seen["Editor-Version"]).toBeDefined();
		expect(seen["Editor-Plugin-Version"]).toBeDefined();
		expect(seen["Copilot-Integration-Id"]).toBe("vscode-chat");
		expect(seen["Openai-Intent"]).toBeDefined();
		expect(seen["authorization"]).toBe("Bearer tok");
	});

	it("lets callers override individual headers", async () => {
		let seen: Record<string, string> = {};
		const provider = createCopilotProvider({
			getCredential: () => "tok",
			capabilities: caps,
			headers: { "Copilot-Integration-Id": "custom-id" },
			fetchImpl: async (_url, init) => {
				seen = init?.headers as Record<string, string>;
				return jsonResponse({ choices: [{ message: { content: "hi" } }] });
			},
		});
		await provider.generate({ messages: [{ role: "user", parts: [{ type: "text", text: "x" }] }] });
		expect(seen["Copilot-Integration-Id"]).toBe("custom-id");
		expect(seen["Editor-Version"]).toBeDefined(); // other defaults retained
	});
});
