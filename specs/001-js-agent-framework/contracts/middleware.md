# Contract: Middleware

Maps to FR-023.

```ts
export interface MiddlewareContext {
	agent: Agent;
	request: GenerateRequest;
	response?: GenerateResponse;
}

export type Next = () => Promise<GenerateResponse>;

export interface Middleware {
	name: string;
	handle(ctx: MiddlewareContext, next: Next): Promise<GenerateResponse>;
}

export function useMiddleware(agent: Agent, mw: Middleware[]): Agent;
```

**Contract rules**

- Middleware runs as an ordered pipeline around each provider request/response; a middleware may
  transform the request, transform/short-circuit the response, or handle errors (FR-023).
- Middleware must call `next()` to continue the chain unless intentionally short-circuiting.

**Contract tests**

- request-transform middleware mutates the outgoing request.
- response-transform middleware alters the result.
- error-handling middleware converts a thrown error into a typed result.
