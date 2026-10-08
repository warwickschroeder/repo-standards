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
- **Derive client types from real API responses, by a named mechanism**: generate them from the server's OpenAPI document, or pin each hand-written type with a contract test that reads a real response. Don't hand-write both sides of the wire unchecked (single source of truth). A field the type declares and the server never sends compiles cleanly and fails at runtime, so it is deleted in the same change as the endpoint that stopped sending it.
- Server state through the chosen server-state layer; forms through the chosen
  form + schema-validation pair (reference stack: TanStack Query; React Hook
  Form + Zod).
- **"Nothing there" and "couldn't find out" are different screens.** Each region maps its query onto exactly one of loading, error, empty or data; an unknown is never shown as empty or zero. A failed request is never papered over with a fallback (reference stack: `?? []`, `?? 0`) that renders as a confident empty list, a zero balance or first-run advice. A failed refetch keeps the cached data on screen beside the error (reference stack: TanStack Query keeps `data` when a refetch fails, so check `data` before `isError` and never let the error replace a list that is still valid). Wording follows the status code that actually came back: a 202 means started, never done. Verify each error path by blocking its request in the running app and reading what the screen says.
- Realtime: authenticate the push connection (reference stack: JWT in the `access_token` query string); on a push message, **invalidate the relevant server-state caches and refetch** rather than trusting the payload as the full truth. The connection's lifecycle is where realtime silently dies, so these hold too:
  - **Open the connection inside the auth guard**, not at the app root. At the root it runs once while signed out and never starts after an in-app sign-in.
  - **On sign-out, remove every handler and stop the connection**, so one session's handlers never run in the next.
  - **Coalesce bursts.** A job that pushes once per row costs a full round of refetches per row; a trailing throttle of a few hundred milliseconds turns that into a handful.
  - **A push sent while the connection was down is lost**, so on every connect and reconnect invalidate every cache a push would have refreshed.
  - **Restart a connection that has given up.** Automatic reconnect stops after a few attempts and never retries a failed first start (reference stack: SignalR's default stops after about 42 seconds), so start it again on the next window focus. Don't restart on an expired token: the server closes it at once, and the next API call's 401 sends the user to sign in.
  - **Live telemetry is the one sanctioned poll.** An operator screen showing live figures may refetch on an interval while it is visible, and never in a background tab (reference stack: TanStack Query's `refetchInterval`, which pauses in the background by default).
- Charts derive client-side from existing hooks via **pure, tested helpers** and **degrade gracefully**: never fabricate series; empty data → honest empty state. Beyond that:
  - **Each chart is one named image to assistive tech**: a wrapper with `role="img"`, an accessible name and a text alternative that says what the chart shows.
  - **Turn off a library's own keyboard layer when the wrapper names the chart.** Reference stack: Recharts 3 turns `accessibilityLayer` on by default, which puts an unnamed `role="application"` and a tab stop on the `<svg>` inside the named wrapper; pass `accessibilityLayer={false}` at every chart root, and keep one test that renders every chart and finds no `role="application"`, because an upgrade can restore a default silently. Then click the chart and read `document.activeElement`: a layer the library makes click-focusable draws the browser's outline round the whole plot.
  - **A visible legend names every series.** Names left only in the hover tooltip are invisible on touch and to anyone not hovering.
  - **Axes fit the data, and a chart that crosses zero draws a zero line.**
- **Layout answers to the room its container has, not the window's width.** An app shell with a sidebar gives content less than the viewport, so a viewport breakpoint fires with less room than it assumes. Use container queries (reference stack: Tailwind 4's built-in `@container` with `@min-[…]` variants) on the element above the grid, with thresholds measured from the widest content a cell must hold. A container is the containing block for its `position: fixed` descendants, the same hazard as a retained transform (§11.3), so never put one on the page's main area or around a fixed child that is not portalled. A width measured in script starts unknown: measure when the element attaches, and read "not measured yet" as unknown, never as wide, or a layout picked for room it does not have overlaps its own columns.
- **A bundle never talks to a server it was not built for.** Decide service-worker caching explicitly and record it beside the §3 decisions: an installed app kept open across a deploy keeps running whatever the worker cached (reference stack: `vite-plugin-pwa`'s default worker precaches the bundle and waits for a prompt before taking a new one, so either cache nothing or ship that prompt). Either way, bake the build's version into the bundle, have the server report its own, and block the app behind a non-dismissable update dialog when they differ. Never block when the version cannot be read, because a failed request is not a mismatch, and never in a dev build.

### 10.3 Commands

The repo documents its canonical commands (README / `CLAUDE.md`) — these are
the reference stack's; a different stack records its equivalents under the same
roles:

| Command | Purpose |
|---|---|
| `npm run dev` | client dev server (normally launched by the orchestrator) |
| `npm run lint` | lint — blocking gate, runs before build in CI |
| `npm run build` | type-check + production bundle (the gate) |
| `npx vitest run` | unit/component tests, one shot. A bare `vitest` (the usual `npm run test` script) is watch mode whenever the terminal looks interactive, and never exits |
| `npm run test:e2e` | e2e **regression harness** — boots the real stack + DB verification (expensive — §12.6/§12.9); filter by module project / tier for the targeted runs R25 requires |
