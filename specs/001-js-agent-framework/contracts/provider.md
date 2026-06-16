# Contract: Provider

Maps to FR-005, FR-005a, FR-006, FR-007, FR-007a, FR-008, FR-008a.

```ts
export interface ModelCapabilities {
	model: string;
	maxInputTokens: number; // required (FR-007a)
	maxOutputTokens: number; // required (FR-007a)
	supportsVision?: boolean; // default false (FR-002)
	supportsReasoning?: boolean; // default false (FR-003a)
}

export interface Provider {
	readonly name: string;
	readonly capabilities: ModelCapabilities;
	generate(req: GenerateRequest): Promise<GenerateResponse>;
	generateStream(req: GenerateRequest): AsyncIterable<GenerateChunk>;
}

export interface CredentialSource {
	getCredential(): string | Promise<string>; // caller-supplied; never persisted/logged (FR-005a)
}

export interface CopilotProviderOptions extends CredentialSource {
	capabilities: ModelCapabilities;
	maxRetries?: number; // default safe (FR-008a)
}

export interface OpenAICompatibleProviderOptions extends CredentialSource {
	baseUrl: string; // e.g., LM Studio endpoint (FR-006)
	capabilities: ModelCapabilities;
	maxRetries?: number;
}

export function createCopilotProvider(o: CopilotProviderOptions): Provider; // FR-005
export function createOpenAICompatibleProvider(
	o: OpenAICompatibleProviderOptions,
): Provider; // FR-006
```

**Contract rules**

- Credentials are obtained only via `getCredential()` and never stored, bundled, or logged (FR-005a).
- Transient failures (429 w/ Retry-After, 5xx, network/timeout) retried with exponential backoff up
  to `maxRetries`; auth/4xx fail fast with a typed `ProviderError` (FR-008a).
- New providers implement `Provider` without changes to agent/workflow code (FR-007).

**Contract tests**

- credential callback invoked; value absent from any serialized log/trace/error (SC-006).
- 429 then success → retried; 401 → immediate typed error.
