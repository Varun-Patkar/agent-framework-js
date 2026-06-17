# Contributing to agent-framework-js

Thanks for your interest! This project is open for everyone to use and build on.
Contributions, enhancements, and issue reports are all welcome.

## Ways to contribute

- **Report issues**: Found a bug or have a question? Open a GitHub issue with a clear description and,
  ideally, a minimal reproduction.
- **Suggest enhancements**: Open an issue describing the use case and proposed API. Keep changes
  modular and tree-shakeable, in line with the project's design principles.
- **Submit pull requests**: Please **fork the repository**, create a branch from `develop`, and open
  your pull request **against the `develop` branch** (not `main`). Include tests and documentation.

## Branching model

- **`main`** is the default, release branch and is protected — it only receives changes via pull
  request.
- **`develop`** is the integration branch and is also protected. **External contributors cannot push
  to it directly** and must open a pull request from their fork. (The maintainer may commit to
  `develop` directly.)
- So the contribution flow is: **fork → branch off `develop` → PR into `develop`**.

## Roadmap / TODO

- **More LLM providers**: The framework currently ships **GitHub Copilot** and **OpenAI-compatible**
  (e.g. LM Studio) providers. Additional providers (Anthropic, Azure OpenAI, Google Gemini, Ollama,
  Bedrock, etc.) are a primary area for contribution. New providers must implement the `Provider`
  interface in [`src/providers/provider.ts`](src/providers/provider.ts) without requiring changes to
  agent or workflow code.
- General enhancements and issues are welcome — see the issue tracker.

## Development setup

```bash
npm install
npm run build      # dual ESM + CJS + .d.ts
npm test           # vitest
npm run lint
npm run typecheck
```

## Pull request checklist

- [ ] Code is modular and tree-shakeable; no circular dependencies.
- [ ] Public APIs have TSDoc with at least one example.
- [ ] New behavior has unit tests; external boundaries have integration tests.
- [ ] No secrets are hardcoded, logged, or committed.
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` all pass.
- [ ] `README.md` / the agent-usage skill (`.github/skills/agent-framework-usage/SKILL.md`) updated if public behavior changed.

## Adding a new LLM provider (quick guide)

1. Create `src/providers/<name>.ts` exporting a `create<Name>Provider(options)` factory.
2. Implement the `Provider` interface: `name`, `capabilities`, `generate`, and `generateStream`.
3. Obtain credentials via a caller-supplied `getCredential()` callback — never bundle, persist, or
   log them.
4. Reuse `withRetry` / `providerErrorFromStatus` from `src/providers/retry.ts` for transient-error
   handling.
5. Add a contract test under `tests/contract/` and export from `src/providers/index.ts`.

## Code of conduct

Be respectful and constructive. By participating, you agree to keep interactions welcoming for
everyone.

## License

By contributing, you agree that your contributions are licensed under the MIT License.
