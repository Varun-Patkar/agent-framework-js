import { useRef, useState } from "react";
import { createAgent, type Thread } from "agent-framework-js/agents";
import { defineTool } from "agent-framework-js/tools";
import { makeProvider, connectCalculator, type ProviderKind } from "./agent";

type ChatMsg = { role: "user" | "bot"; text: string };
type Step = { name: "MathAgent" | "WriterAgent"; phase: string; text: string; time: string };

function Toggle<T extends string>(props: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
	return (
		<div className="toggle">
			{props.options.map(([v, label]) => (
				<button key={v} className={props.value === v ? "on" : ""} onClick={() => props.onChange(v)}>
					{label}
				</button>
			))}
		</div>
	);
}

export default function App() {
	const [provider, setProvider] = useState<ProviderKind>("copilot");
	const [token, setToken] = useState("");
	const [input, setInput] = useState("");
	const [log, setLog] = useState<ChatMsg[]>([]);
	const [steps, setSteps] = useState<Step[]>([]);
	const [busy, setBusy] = useState(false);
	const thread = useRef<Thread | undefined>(undefined);

	function pushStep(name: Step["name"], phase: string, text: string) {
		setSteps((s) => [...s, { name, phase, text, time: new Date().toLocaleTimeString() }]);
	}

	async function send() {
		const message = input.trim();
		if (!message) return;
		setInput("");
		setBusy(true);
		setLog((l) => [...l, { role: "user", text: message }]);
		let calc: Awaited<ReturnType<typeof connectCalculator>> | undefined;
		try {
			const p = makeProvider(provider, token);
			calc = await connectCalculator();

			// Two subagents.
			const mathAgent = createAgent({
				name: "MathAgent",
				instructions: "You are a math specialist. Use calc.calculate and return only the result.",
				provider: p,
				tools: calc.tools,
			});
			const writerAgent = createAgent({
				name: "WriterAgent",
				instructions: "You are a concise writer. Turn facts into a friendly one-paragraph explanation.",
				provider: p,
			});

			// Expose each subagent to the orchestrator as a tool that logs its turn.
			const askMath = defineTool({
				name: "ask_math",
				description: "Delegate a calculation to the Math specialist.",
				inputSchema: { type: "object", properties: { question: { type: "string" } }, required: ["question"] },
				run: async ({ question }: { question: string }) => {
					pushStep("MathAgent", "start", "▶ " + question);
					const r = await mathAgent.run(question);
					pushStep("MathAgent", "end", "✓ " + r.output);
					return { answer: r.output };
				},
			});
			const askWriter = defineTool({
				name: "ask_writer",
				description: "Delegate prose writing to the Writer specialist.",
				inputSchema: { type: "object", properties: { task: { type: "string" } }, required: ["task"] },
				run: async ({ task }: { task: string }) => {
					pushStep("WriterAgent", "start", "▶ " + task);
					const r = await writerAgent.run(task);
					pushStep("WriterAgent", "end", "✓ " + r.output);
					return { text: r.output };
				},
			});

			const orchestrator = createAgent({
				name: "Orchestrator",
				instructions:
					"You coordinate two specialists. Use ask_math for any calculation and ask_writer to " +
					"compose explanations. Combine their results into a helpful final reply.",
				provider: p,
				tools: [askMath, askWriter],
			});

			const res = await orchestrator.run(message, { thread: thread.current });
			thread.current = res.thread; // keep the conversation multi-turn
			setLog((l) => [...l, { role: "bot", text: res.output }]);
		} catch (e) {
			setLog((l) => [...l, { role: "bot", text: "Error: " + (e as Error).message }]);
		} finally {
			await calc?.close();
			setBusy(false);
		}
	}

	function reset() {
		thread.current = undefined;
		setLog([]);
		setSteps([]);
	}

	return (
		<div className="wrap">
			<h1>Multi-turn orchestrator + 2 subagents (browser)</h1>
			<p className="sub">No backend. The orchestrator delegates to a Math agent (HTTP calculator MCP) and a Writer agent. The right panel shows, in order, which subagent ran.</p>

			<div className="row">
				<div>
					<label>Provider</label>
					<Toggle value={provider} options={[["copilot", "GitHub Copilot"], ["lmstudio", "LM Studio"]]} onChange={setProvider} />
				</div>
				{provider === "copilot" && (
					<div>
						<label>Your GitHub Copilot token</label>
						<input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ghu_…" />
					</div>
				)}
				<button className="reset" onClick={reset}>Reset conversation</button>
			</div>
			<div className="note" style={{ marginBottom: 16 }}>MCP transport: http only (stdio unavailable in the browser).</div>

			<div className="grid">
				<div className="card">
					<label>Conversation</label>
					<div id="log">
						{log.length === 0 && <div className="empty">Try: “Compute 12 * (7 + 3), then explain the result like I'm five.”</div>}
						{log.map((m, i) => (
							<div key={i} className={"msg " + (m.role === "user" ? "user" : "bot")}>{m.text}</div>
						))}
					</div>
					<div className="composer">
						<input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Type a message…" />
						<button onClick={send} disabled={busy}>{busy ? "…" : "Send"}</button>
					</div>
				</div>
				<div className="card">
					<label>Subagent activity (in order)</label>
					<div className="steps">
						{steps.length === 0 && <div className="empty">No delegations yet.</div>}
						{steps.map((s, i) => (
							<div key={i} className={"step " + s.name}>
								<span className="who">{s.name}</span> <span className="t">{s.phase} · {s.time}</span>
								<div>{s.text}</div>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
