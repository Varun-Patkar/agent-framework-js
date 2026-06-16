# Contract: Declarative Definitions

Maps to FR-027.

```ts
export interface AgentDefinition {
	// single shared schema for YAML and JSON
	name: string;
	instructions: string;
	provider: {
		type: "copilot" | "openai-compatible";
		baseUrl?: string;
		model: string;
		maxInputTokens: number;
		maxOutputTokens: number;
		supportsVision?: boolean;
		supportsReasoning?: boolean;
	};
	tools?: string[]; // references to registered tools
	skills?: string[]; // references to registered skills
	maxIterations?: number;
}

export function loadAgentDefinition(
	source: string, // YAML or JSON; format auto-detected (FR-027)
	deps: {
		providerFactory: (def: AgentDefinition["provider"]) => Provider;
		getCredential: () => string | Promise<string>;
		tools?: Record<string, Tool>;
		skills?: Record<string, Skill>;
	},
): Agent;
```

**Contract rules**

- The loader accepts both YAML and JSON against one shared schema and auto-detects the format; the
  YAML parser is lazy-loaded so JSON-only/browser use pays no cost (FR-027).
- A loaded definition produces an agent equivalent to the programmatic equivalent (FR-027).
- Credentials are still injected via callback, never embedded in the definition (FR-005a).

**Contract tests**

- equivalent YAML and JSON definitions both produce a working agent.
- loaded agent behavior matches a programmatically-built one.
