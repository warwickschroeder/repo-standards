> **Modular Monolith Blueprint — §10.** [Index](README.md) · [Rules Digest](01-rules-digest.md)

## 10. Client SPA

The client stack is a §3 decision (**ask before Phase 2**); what is fixed is the
*shape*: a typed SPA with a strict type-check gate, a separate blocking lint
gate, a server-state layer invalidated by push (never polling — the repo's
no-poll rule), forms with schema validation, and **one design-token home**
(§11). The structure, rules, and commands below are the **reference-stack**
(React + Vite) realisation — keep the shape, translate the tooling.

### 10.1 Structure

```
src/<App>.Web/
  package.json  vite.config.ts  components.json  eslint.config.js  tsconfig*.json
  e2e/             # end-to-end workspace (§12.3/§12.9):
                   #   support/           — shared harness (stack boot, auth fixtures, DB read-back)
                   #   modules/<Feature>/ — one e2e project per module, specs 1:1 with its runbook
  src/
    components/      # shared components; ui/ holds the component-library copies; layout/ holds
                     #   the app shell; add charts/ wrappers only when a chart is actually needed
    hooks/           # server-state hooks (one module per API area; reference stack: TanStack Query)
    lib/             # api client, realtime (push transport), pure helpers, utils
    routes/          # route screens + the router (feature subfolders as needed)
    styles/globals.css   # the ONE home for design tokens (reference stack: Tailwind @theme inline)
    test/            # test setup
```

Co-locate tests: `Foo.tsx` ↔ `Foo.test.tsx` (or `__tests__/`). Folder names are a
convention — `routes/` vs `pages/`, a top-level `layouts/` vs `components/layout/`
— pick one to match the design handoff and stay consistent.

### 10.2 Rules

- Strict typing, enforced at build. Reference stack: `npm run build`
  (`tsc -b && vite build`) is the type-check gate; **lint is a separate,
  blocking gate** — `npm run lint` (flat `eslint.config.js`: typescript-eslint
  + `react-hooks` + `react-refresh`) runs **before** build in CI. Both must
  pass to claim done (R25).
- Import via a root alias (reference stack: `@/` → `src/*`), never deep
  relative paths.
- **Derive client types from real API responses** — don't hand-write both
  sides of the wire (single source of truth).
- Server state through the chosen server-state layer; forms through the chosen
  form + schema-validation pair (reference stack: TanStack Query; React Hook
  Form + Zod).
- Realtime: authenticate the push connection (reference stack: JWT in the
  `access_token` query string); on a push message, **invalidate the relevant
  server-state caches and refetch** rather than trusting the payload as the
  full truth.
- Charts derive client-side from existing hooks via **pure, tested helpers** and
  **degrade gracefully** — never fabricate series; empty data → honest empty
  state.

### 10.3 Commands

The repo documents its canonical commands (README / `CLAUDE.md`) — these are
the reference stack's; a different stack records its equivalents under the same
roles:

| Command | Purpose |
|---|---|
| `npm run dev` | client dev server (normally launched by the orchestrator) |
| `npm run lint` | lint — blocking gate, runs before build in CI |
| `npm run build` | type-check + production bundle (the gate) |
| `npm run test` | unit/component tests |
| `npm run test:e2e` | e2e **regression harness** — boots the real stack + DB verification (expensive — §12.6/§12.9); filter by module project / tier for the targeted runs R25 requires |
