import { Fragment, useState } from "react";
import { createAgent } from "agent-framework-js/agents";
import { createWorkflow } from "agent-framework-js/workflows";
import { makeProvider, connectCalculator, type ProviderKind } from "./agent";

type NodeState = { name: string; status: "pending" | "running" | "done"; output: string };

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
	const [prompt, setPrompt] = useState("A train travels 240 km in 3 hours. Compute its average speed, then how far it goes in 7 hours.");
	const [nodes, setNodes] = useState<NodeState[]>([]);
	const [final, setFinal] = useState("");
	const [err, setErr] = useState("");
	const [busy, setBusy] = useState(false);

	async function run() {
		setBusy(true);
		setFinal("");
		setErr("");
		setNodes([]);
		let calc: Awaited<ReturnType<typeof connectCalculator>> | undefined;
		try {
			const p = makeProvider(provider, token);
			calc = await connectCalculator();

			const planner = createAgent({ name: "Planner", instructions: "Break the request into a short numbered calculation plan. Be brief.", provider: p });
			const calculator = createAgent({ name: "Calculator", instructions: "Execute the plan using calc.calculate. Report each numeric result.", provider: p, tools: calc.tools });
			const summarizer = createAgent({ name: "Summarizer", instructions: "Write a clear final answer based on the computed results.", provider: p });
			const agents = [planner, calculator, summarizer];

			// Draw the pipeline; mark the first node running.
			const initial: NodeState[] = agents.map((a, i) => ({ name: a.name, status: i === 0 ? "running" : "pending", output: i === 0 ? "" : "waiting…" }));
			setNodes(initial);

			const wf = createWorkflow({ pattern: "sequential", agents });
			// Sequential: round N completes agents[N-1]. Light up nodes in order.
			for await (const ev of wf.runStream(prompt)) {
				if (ev.type === "round") {
					const idx = ev.round - 1;
					setNodes((ns) =>
						ns.map((n, i) => {
							if (i === idx) return { ...n, status: "done", output: ev.output };
							if (i === idx + 1) return { ...n, status: "running", output: "" };
							return n;
						}),
					);
				} else if (ev.type === "done") {
					setFinal(ev.state.output);
				}
			}
		} catch (e) {
			setErr((e as Error).message);
		} finally {
			await calc?.close();
			setBusy(false);
		}
	}

	return (
		<div className="wrap">
			<h1>Sequential workflow — live ordering (browser)</h1>
			<p className="sub">No backend. Watch each agent light up in order: Planner → Calculator (HTTP MCP) → Summarizer.</p>

			<div className="row">
				<div>
					<label>Provider</label>
					<Toggle value={provider} options={[["copilot", "GitHub Copilot"], ["lmstudio", "LM Studio"]]} onChange={setProvider} />
				</div>
				{provider === "copilot" && (
					<div style={{ flex: 1, minWidth: 220 }}>
						<label>Your GitHub Copilot token</label>
						<input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ghu_…" />
					</div>
				)}
			</div>
			<div className="note">MCP transport: http only (stdio unavailable in the browser).</div>

			<textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} />
			<button className="go" onClick={run} disabled={busy}>{busy ? "Running…" : "Run workflow"}</button>

			<div className="pipe">
				{nodes.map((n, i) => (
					<Fragment key={n.name}>
						{i > 0 && <div className="arrow">→</div>}
						<div className={"node " + n.status}>
							<h3><span className="dot" />{i + 1}. {n.name}</h3>
							<div className="body">{n.output}</div>
						</div>
					</Fragment>
				))}
			</div>

			<div className="final">
				<label>Final answer</label>
				<pre className={err ? "err" : ""}>{err ? "Error: " + err : final}</pre>
			</div>
		</div>
	);
}
