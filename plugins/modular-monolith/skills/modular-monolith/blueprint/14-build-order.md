> **Modular Monolith Blueprint — §14.** [Index](README.md) · [Rules Digest](01-rules-digest.md)

## 14. Build Order (phased)

Ship the thinnest bootable slice first, then widen. Each phase ends green (the
repo's canonical build/test gates on both sides, and the e2e suite where a
journey changed) before the next starts. **Test infrastructure is stood up
early and every phase extends all three layers** (unit, integration, e2e) —
testing is not a trailing phase. Track status — including every §3 stack
decision as it is made — in `docs/ROADMAP.md`.

**Phase 0 — Ingest the Claude Design handoff (prerequisite, design-first).**
Produce the UI upstream in **Claude Design**, then *Export → Handoff to Claude
Code*. Commit the **handoff bundle** + copied prompt + screenshots under
`docs/design-handoff/<date>-<surface>/`, reconcile its target stack to the
client stack chosen with the user (§3 — note the mapping), and lift its
tokens into the single token home with the component-library variable map
(§11). Record the theme policy (dark/light/themeable). Optionally distill a
short derived `DESIGN.md`. This phase is design + docs only — no app code —
and it gates Phase 2. (Server work in Phase 1 can proceed in parallel since it
has no UI.)

**Phase 1 — Server skeleton ("it boots").**
**First, ask the user for the Phase-1 stack decisions (§3): server language +
web framework, data access + migrations tooling, the persistence backend (§8),
the orchestrator, and server test tooling** — record them in `docs/ROADMAP.md`;
this phase writes the first data contexts and migrations, so all of it must be
chosen before any code is. Then (reference-stack shapes): the
solution/workspace + toolchain pin + central version home, the orchestration
AppHost (the chosen database + API) and ServiceDefaults, `Core` (the module
contract, module discovery, the event bus + `IEvent`, `ICurrentUser`, the auth
wiring seam), the Host composition root, and 3–4 module stubs (`Auth`,
`Notifications`, a domain module, a read-model module) each with a real data
context + schema + Initial migration. Tests: event-bus, module-discovery,
module smoke. **Wire the server static gates now** (R33/§12.10 — lint/analyzers
with warnings-as-errors, duplication, dead code, dependency vulnerability
audit), while the codebase is small: retrofitting a strict ruleset onto a
grown codebase is the expensive path. Secrets handling starts here too (R35 —
orchestrator-injected, none in the repo).

**Phase 2 — Branded client shell ("it looks right") — realises the Phase 0 handoff.**
**First, confirm the Phase-2 stack decisions (§3): client framework + build
tooling, styling system + component library, client/e2e test tooling.** Then
stand the client up (reference stack: Vite + React + strict TS + Tailwind +
shadcn) with the Phase 0 tokens already in the token home; realise the
handed-off component-structure spec — build the app shell (nav, header, logo)
and route stubs to match the bundle's screenshots, retuning the component
library to the tokens, adding any named custom variants the design needs, and
implementing the specified interaction states + breakpoints. The orchestrator
adds the client app (reference stack: `AddViteApp`). **Stand up the test
harnesses here:** unit/component (reference: Vitest + RTL) and the e2e
**regression harness** (reference: Playwright, global setup booting the
orchestrated stack from Phase 1 — §12.9) with a first smoke spec (app loads,
shell renders, key breakpoints), **and the client static gates** (R33/§12.10 —
lint, duplication, dead code, dependency audit). No API calls yet. Done when the
shell matches the handoff screenshots, uses **only** tokens (no duplicated
hexes), and the smoke e2e is green.

**Phase 3 — Auth end-to-end ("you can log in").**
**First, ask the user which authentication mechanism to use (§4.6)** and record
it in `docs/ROADMAP.md` — never assume one. Then wire the chosen option behind
the `ICurrentUser` seam (reference-stack shapes):
- *Local-DB JWT:* Argon2id hasher, JWT token service, login endpoint,
  `admin add-user` CLI; client login (form + schema validation) + token storage.
- *OpenID Connect / Azure Entra ID:* configure `Authority`/`Audience` validation
  in `Core`; client uses an OIDC/MSAL flow (PKCE); no `Auth` module.

Common to both: auth-header (or `access_token`) injection, protected routes,
server-state layer setup, integration tests asserting the framework's
require-authorization gate rejects anonymous requests and
`ICurrentUser.UserId` resolves correctly, and a
**e2e login journey** (sign in → land on a protected route → sign out)
plus an auth-fixture other e2e specs reuse to start authenticated.

**Phase 4 — First domain vertical.**
A real domain module with write + read endpoints, event publishing, a read-model
module subscribing to those events, and a Notifications relay pushing a realtime
message (**confirm the push transport with the user first if not yet decided —
§3**). Client screens for the slice. Tests across all layers: unit (logic),
integration over the event seam + read-model round-trip + access-boundary isolation,
and an **e2e spec for the slice's core journey** (incl. the realtime update
landing in the UI) — authored as the first **module regression runbook** + its
per-module e2e project on the real-backend harness (§12.3/§12.9), proving
persistence via a DB read-back. This slice is also the point to **offer the
optional end-user guide practice** (§17.1) — there is now a real audience with
a real workflow to describe, and the module docs it derives from exist.

**Phase 5+ — Widen.**
More domain modules, background jobs (the stack's hosted-worker primitive + a
job runner with bounded parallelism), richer Notifications relays, analytics —
each shipping its own unit + integration + e2e coverage.

**Later phases (scope when needed).**
Installable PWA (manifest); engine-level row-security hardening (e.g. Postgres
RLS, §8); any LLM/AI features behind an
interface (e.g. `ISuggester`) so implementations slot into a chain. *(E2e is
not here — it's established in Phase 2 and extended every phase, §12.)*
