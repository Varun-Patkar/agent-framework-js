<!--
SYNC IMPACT REPORT
==================
Version change: 1.0.0 → 1.1.0
Bump rationale: Narrowed Principle V — removed the built-in WebIQ web-search tool mandate;
  the framework now ships no built-in tools and provides only the pluggable tool interface.

Modified principles:
  - V. Extensible Tooling Interface — removed WebIQ web-search requirement; added "no built-in
    tools" rule.
Added principles: N/A
Added sections: None
Removed sections: None

Templates requiring updates:
  - .specify/templates/plan-template.md ✅ compatible (generic Constitution Check gate)
  - .specify/templates/spec-template.md ✅ compatible (no constitution-specific edits required)
  - .specify/templates/tasks-template.md ✅ compatible (task categories cover testing/docs/security)

Follow-up TODOs:
  - TODO(RATIFICATION_DATE): Confirm 2026-06-16 is the official adoption date; adjust if the
    project formally ratified earlier.
  - AGENT_USAGE.md is to be authored after the package is implemented (Principle IV), not before.
-->

# Agent Framework JS Constitution

## Core Principles

### I. Modular & Composable Architecture

Every capability MUST be delivered as a small, self-contained module with a single, clearly
stated purpose. Modules MUST expose explicit public APIs and MUST NOT reach into the internals
of other modules. Cross-module communication happens only through documented interfaces and
typed contracts.

Rules:

- The package MUST be tree-shakeable: consumers import only what they use, and unused modules
  add zero runtime cost.
- No module may create circular dependencies. Shared logic lives in a clearly named core/shared
  module, not duplicated.
- Public API surface MUST be intentional and minimal; internal helpers MUST NOT leak into the
  published entry points.

Rationale: Agents and their integrators compose behavior from parts. Strict modularity keeps the
framework adaptable, testable in isolation, and safe to evolve without breaking consumers.

### II. Security by Default (NON-NEGOTIABLE)

Security is a default state, not an opt-in feature. Code MUST be free of the OWASP Top 10 classes
of vulnerabilities and MUST fail closed when inputs or configuration are untrusted or missing.

Rules:

- Secrets (API keys, tokens, credentials) MUST NEVER be hardcoded, logged, or committed. They are
  read from environment/configuration at runtime and redacted from all logs and errors.
- All external input — including tool arguments, LLM/agent output, and web content — MUST be
  validated and treated as untrusted. No untrusted string is ever passed to `eval`, dynamic
  code execution, shell commands, or file paths without sanitization.
- Network and tool calls MUST enforce timeouts, and outbound requests MUST be restricted to
  explicitly permitted destinations where applicable.
- Dependencies MUST be kept current; known-vulnerable packages (failing `npm audit` at high or
  critical severity) MUST be resolved before release.

Rationale: A framework that runs autonomous agents amplifies the blast radius of any weakness.
Defaulting to secure behavior protects every downstream consumer.

### III. Test-First Quality

Functionality MUST be covered by automated tests, and tests for new behavior SHOULD be written
before or alongside the implementation. A change is not "done" until its tests pass in CI.

Rules:

- Every public API and every module contract MUST have unit tests; integration tests MUST cover
  inter-module flows and any external tool boundary (e.g., MCP servers).
- Bug fixes MUST add a regression test that fails before the fix and passes after.
- The full test suite and linter MUST pass before any merge to the main branch.

Rationale: Autonomous agents exercise code paths unpredictably. Reliable tests are the only
durable guarantee that modular pieces still behave correctly as they combine.

### IV. Documentation-First & Agent-Readable Guidance

Every public capability MUST be documented for both humans and agents. Documentation is part of
the deliverable, not an afterthought.

Rules:

- Every exported API MUST have JSDoc/TSDoc covering purpose, parameters, return values, errors,
  and at least one usage example.
- The repository MUST maintain a single agent-facing guide — the agent-usage skill at
  `.github/skills/agent-framework-usage/SKILL.md` — that any agent can load to understand how to
  install, configure, and call the package — including available tools, inputs/outputs, and safety
  constraints. This skill MUST stay in sync with the public API.
- README and changelog MUST be updated in the same change that alters public behavior.

Rationale: This package exists to be consumed by agents and the developers who build them. If an
agent cannot understand the package from its documentation alone, the feature is incomplete.

### V. Extensible Tooling Interface

Agent tools (capabilities the framework exposes to an agent) MUST follow a uniform, pluggable
interface so new tools can be added without modifying the core.

Rules:

- Each tool MUST declare a name, a typed input schema, a typed output schema, and a description
  suitable for an LLM/agent to decide when to use it.
- Tools MUST be registrable and discoverable at runtime, and MUST degrade gracefully (clear,
  typed errors) when an upstream provider is unavailable.
- The framework MUST NOT ship built-in tools; it provides only the pluggable tool interface, and
  all tools are supplied by the consumer (local code or MCP servers).

Rationale: An agent framework is only as useful as the tools it can offer. A single, consistent
tooling contract keeps capabilities modular, secure, and documentable.

## Technology & Security Standards

- Language: JavaScript/TypeScript targeting modern, supported runtimes; TypeScript types MUST be
  published for all public APIs.
- Packaging: Distributed as an installable package with both ESM and (where needed) CommonJS
  entry points; semantic-versioned releases.
- Security tooling: `npm audit` (or equivalent) and a static linter MUST run in CI; high/critical
  findings block release.
- Configuration: All secrets and environment-specific values MUST be injectable via configuration
  or environment variables — never baked into source.
- External services (LLM providers, MCP servers) MUST be accessed through abstraction layers so
  providers can be swapped or mocked in tests.

## Development Workflow & Quality Gates

- Every change is delivered via pull request and MUST pass automated tests, linting, and security
  checks before merge.
- Code review MUST verify compliance with all five Core Principles; a reviewer MUST explicitly
  confirm modularity, security, tests, and documentation are satisfied.
- Public API changes MUST update the agent-usage skill (`.github/skills/agent-framework-usage/SKILL.md`), README, and the changelog in the same PR.
- Any deviation from a principle MUST be documented in the PR with explicit justification and a
  plan to remove the deviation; unjustified violations block merge.

## Governance

This constitution supersedes all other development practices for the Agent Framework JS project.
When guidance conflicts, the constitution wins.

- Amendments MUST be proposed via pull request, documented with rationale, and approved by the
  project maintainers before taking effect.
- Versioning of this constitution follows semantic versioning: MAJOR for backward-incompatible
  governance or principle changes, MINOR for new principles or materially expanded guidance, and
  PATCH for clarifications and non-semantic refinements.
- All PRs and reviews MUST verify compliance with the principles above. Added complexity MUST be
  justified against the modularity and simplicity expectations.
- Compliance is reviewed at each release; recurring violations MUST trigger either a corrective
  plan or a documented amendment.

**Version**: 1.1.0 | **Ratified**: 2026-06-16 | **Last Amended**: 2026-06-16
