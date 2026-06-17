import { useState } from "react";
import { createAgent } from "agent-framework-js/agents";
import { makeProvider, connectCalculator, type ProviderKind } from "./agent";

/** Segmented toggle control. */
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
	const [prompt, setPrompt] = useState("What is the derivative of 3x^2 + 2x + 1, then evaluate sqrt(144) + 5!?");
	const [out, setOut] = useState("");
	const [tools, setTools] = useState<string[]>([]);
	const [err, setErr] = useState("");
	const [busy, setBusy] = useState(false);

	async function run() {
		setBusy(true);
		setOut("");
		setErr("");
		setTools([]);
		let calc: Awaited<ReturnType<typeof connectCalculator>> | undefined;
		try {
			calc = await connectCalculator();
			setTools(calc.tools.map((t) => t.name));
			const agent = createAgent({
				name: "Calculator",
				instructions: "Use the calc.calculate tool for any math. Show the final result clearly.",
				provider: makeProvider(provider, token),
				tools: calc.tools,
			});
			let acc = "";
			for await (const chunk of agent.runStream(prompt)) {
				if (chunk.type === "text") {
					acc += chunk.text;
					setOut(acc);
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
			<h1>Single-turn agent + Calculator MCP (browser)</h1>
			<p className="sub">No backend. Provider toggle below. HTTP MCP only — the browser cannot spawn a stdio server.</p>

			<div className="card">
				<div className="row">
					<div>
						<label>Provider</label>
						<Toggle
							value={provider}
							options={[
								["copilot", "GitHub Copilot"],
								["lmstudio", "LM Studio"],
							]}
							onChange={setProvider}
						/>
					</div>
					{provider === "copilot" && (
						<div>
							<label>Your GitHub Copilot token (stays in this tab)</label>
							<input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ghu_…" />
						</div>
					)}
				</div>
				<div className="note">MCP transport: <b>http</b> only (stdio is Node-only and unavailable in the browser).</div>
			</div>

			<div className="card">
				<label>Ask the calculator agent</label>
				<textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} />
				<button className="go" onClick={run} disabled={busy}>
					{busy ? "Running…" : "Run"}
				</button>
				{tools.length > 0 && (
					<div className="tools">
						MCP tools: {tools.map((t) => (
							<code key={t}>{t} </code>
						))}
					</div>
				)}
			</div>

			<div className="card">
				<label>Answer</label>
				<pre className={err ? "err" : ""}>{err ? "Error: " + err : out}</pre>
			</div>
		</div>
	);
}
