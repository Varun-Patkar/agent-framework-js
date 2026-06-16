<!-- SPECKIT START -->

For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
`specs/001-js-agent-framework/plan.md`

Related design artifacts:

- `specs/001-js-agent-framework/spec.md` — feature specification & clarifications
- `specs/001-js-agent-framework/research.md` — Phase 0 technical decisions
- `specs/001-js-agent-framework/data-model.md` — entities
- `specs/001-js-agent-framework/contracts/` — public interface contracts
- `specs/001-js-agent-framework/quickstart.md` — validation scenarios
<!-- SPECKIT END -->

# Project guide for GitHub Copilot — agent-framework-js

> This section is the single source of truth for how to work in this repo. It is NOT managed by
> SpecKit (keep it below the SPECKIT block). Update it when conventions change.

## What this project is

`agent-framework-js` is a **published npm package** (https://www.npmjs.com/package/agent-framework-js):
a modular, tree-shakeable JavaScript/TypeScript framework for building and orchestrating AI agents in
**no-backend** environments (browser, edge runtimes like Vercel without serverless functions, and
Node 18+). It mirrors the in-scope capabilities of Microsoft Agent Framework.

LLM providers are intentionally limited to **GitHub Copilot** and **OpenAI-compatible** (e.g. LM
Studio). Adding more providers is the main roadmap item (see `CONTRIBUTING.md`).

## Architecture & conventions (follow these)

- **Language**: TypeScript 5.x → ES2022. Published as **dual ESM + CJS** with emitted `.d.ts`.
- **Modules** live under `src/<module>/` with a barrel `index.ts`. Current modules: `core`,
  `providers`, `tools`, `agents`, `mcp`, `skills`, `workflows`, `middleware`, `persistence`,
  `observability`, `declarative`. Each is a deep-import entry (e.g. `agent-framework-js/agents`).
- **Tree-shakeable**: never add side effects at import time; keep `"sideEffects": false` true.
  Runtime-/format-specific deps (MCP SDK, `yaml`, OTel) are **lazy-loaded via `await import(...)`**.
- **No circular deps**: feature modules depend on `core`, not on each other. Shared logic goes in
  `core`.
- **Public API**: every export needs **TSDoc with at least one `@example`**. Keep the surface minimal;
  internal helpers must not leak.
- **Errors**: throw/return the typed errors from `src/core/errors.ts`
  (`ProviderError`, `ToolError`, `MCPError`, `CheckpointError`, `RuntimeUnsupportedError`,
  `ValidationError`). Branch on `.kind`/`.reason`, never parse messages.
- **Security (non-negotiable)**: credentials come only from a caller `getCredential()` callback —
  never hardcode, log, or persist them. All log/trace/error output goes through
  `redact()` in `src/core/redaction.ts`. Never `eval` model/tool output. Validate tool args against
  JSON Schema. Fail closed on untrusted input and unrestorable checkpoints.
- **Runtime gating**: Node-only features (stdio MCP, fs storage) must call `requireCapability(...)`
  from `src/core/runtime.ts` and throw `RuntimeUnsupportedError` elsewhere.
- **Safeguards are configurable with safe defaults** (override, `-1` = unlimited where noted):
  `maxIterations` (10), `toolTimeoutMs`, `compactionThreshold` (0.9), provider `retry.maxRetries`
  (3), workflow `maxRounds` (16), `failurePolicy` (fail-soft), `maxConcurrency` (4). Document any new
  knob in README and the agent-usage skill (`.github/skills/agent-framework-usage/SKILL.md`).

## Commands

```bash
npm install         # install deps
npm run build       # tsup → dual ESM+CJS + .d.ts
npm test            # vitest (unit + integration + contract)
npm run lint        # eslint
npm run typecheck   # tsc --noEmit
npm run format      # prettier --write
```

Tests live in `tests/{unit,integration,contract}` and use a scripted provider from
`tests/helpers/mockProvider.ts`. Every change must keep lint, typecheck, test, and build green.

## Definition of done (apply to every change)

1. Code follows the conventions above (modular, secure, tree-shakeable).
2. New/changed behavior has tests; bug fixes add a regression test.
3. Public API changes update **TSDoc**, **README.md**, the **agent-usage skill**
   (`.github/skills/agent-framework-usage/SKILL.md`), and **CHANGELOG.md** (under `## [Unreleased]`).
4. `npm run lint && npm run typecheck && npm test && npm run build` all pass.

## Release process (IMPORTANT — publishing is automated, never publish locally)

Publishing happens **only** through GitHub Actions via npm **trusted publishing (OIDC)** — there is
no npm token anywhere, and `npm publish` from a laptop is intentionally not used.

To cut a release:

```bash
# 1. Make sure CHANGELOG.md [Unreleased] reflects the changes.
# 2. Bump version (also creates the git tag):
npm version patch     # or minor / major
# 3. Push the tag — this triggers .github/workflows/release.yml:
git push --follow-tags
```

The workflow runs lint → typecheck → test → build → `npm publish --provenance`. Watch it at
`https://github.com/Varun-Patkar/agent-framework-js/actions`. Do not add an `NPM_TOKEN` or an
`env: NODE_AUTH_TOKEN` to the workflow — trusted publishing is configured on npmjs.com.

CI (`.github/workflows/ci.yml`) runs lint/typecheck/build/test/audit on pushes and PRs. Dependabot
(`.github/dependabot.yml`) opens weekly dependency PRs (dev deps grouped).

## How to add a new LLM provider (most common task)

1. Create `src/providers/<name>.ts` exporting `create<Name>Provider(options)`.
2. Implement the `Provider` interface from `src/providers/provider.ts`: `name`, `capabilities`
   (`maxInputTokens`, `maxOutputTokens`, `supportsVision?`, `supportsReasoning?`), `generate`,
   `generateStream`.
3. Take credentials via a `getCredential()` callback; reuse `withRetry` / `providerErrorFromStatus`
   from `src/providers/retry.ts`.
4. Add a contract test in `tests/contract/`, export from `src/providers/index.ts`, and update README
   + the agent-usage skill (`.github/skills/agent-framework-usage/SKILL.md`) + CHANGELOG.
