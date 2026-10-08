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

**Every later surface gets its own handoff.** Phase 0 is the first design gate, not the only one. Any phase that adds a screen, a form factor (phone, tablet) or an interactive surface (a dialog flow, a panel) starts with its own Claude Design export, committed under `docs/design-handoff/<date>-<surface>/` before implementation begins. Import the repo into Claude Design first (§11) so the export reuses the live tokens. A tweak too small to design follows R26's "ask, don't invent", and the answer is recorded as a token in the token home, otherwise a note in that surface's handoff folder (§11.3), where the next handoff will pick it up.

**Phase 1: Server skeleton ("it boots").** **First, ask the user for the Phase-1 decisions (§3): server language + web framework, data access + migrations tooling, the persistence backend (§8), the orchestrator, server test tooling, and the ownership boundary**, and record them in `docs/ROADMAP.md`; this phase writes the first data contexts, migrations and event contracts, all of which carry the owner, so all of it must be chosen before any code is. Then (reference-stack shapes): the solution/workspace + toolchain pin + central version home, the orchestration AppHost (the chosen database + API) and ServiceDefaults, `Core` (the module contract, module discovery, the event bus + `IEvent`, the transactional outbox (§4.8) and `IOwnedEvent`, `ICurrentUser`, the auth wiring seam), the Host composition root, and 3–4 module stubs (`Auth`, `Notifications`, a domain module, a read-model module) each with a real data context + schema + Initial migration. Tests: event-bus, module-discovery, module smoke, and an outbox test proving an event saved with its change reaches its durable subscriber once, while a save that rolls back stores neither. **Wire the server static gates now** (R33/§12.10: lint/analyzers with warnings-as-errors, duplication, dead code, dependency vulnerability audit), while the codebase is small: retrofitting a strict ruleset onto a grown codebase is the expensive path. Secrets handling starts here too (R35: orchestrator-injected, none in the repo).

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

**Seed the UI conventions document in Phase 2**, when the client is scaffolded: its "one way to do each job" register (§11.3) starts with tooltip, confirm, focus return, value formatting and shared view state, so the second screen reuses them instead of inventing its own.

**Phase 3 — Auth end-to-end ("you can log in").**
**First, ask the user which authentication mechanism to use (§4.6)** and record
it in `docs/ROADMAP.md` — never assume one. Then wire the chosen option behind
the `ICurrentUser` seam (reference-stack shapes):
- *Local-DB JWT:* Argon2id hasher, JWT token service, login endpoint,
  `admin add-user` CLI; client login (form + schema validation) + token storage.
- *OpenID Connect / Azure Entra ID:* configure `Authority`/`Audience` validation
  in `Core`; client uses an OIDC/MSAL flow (PKCE); no `Auth` module.

Common to both: auth-header (or `access_token`) injection, protected routes, server-state layer setup, integration tests asserting the framework's require-authorization gate rejects anonymous requests and `ICurrentUser.UserId` and `OwnerId` resolve correctly (the token carries the owner claim, §4.4), and an **e2e login journey** (sign in → land on a protected route → sign out) plus an auth-fixture other e2e specs reuse to start authenticated.

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

**Release and operate (before the first deploy).** **First, ask the user where the app will run** (host, container platform, TLS and reverse proxy) and record it in `docs/ROADMAP.md`; the proxy decides how rate limiting finds the client (§13.4). Then:
- **The dev orchestrator ban stops at dev.** A compose file or platform manifest that runs the published image is a deployment choice; Aspire, or the chosen orchestrator, stays the only way the app runs locally (§3.1, §9).
- **A liveness endpoint in every environment** (§9.2), which the container healthcheck calls. The production host filter must admit the address the healthcheck uses.
- **Boot the built image before publishing it.** The release job starts the image against a real database, waits for liveness and calls one endpoint; a failure stops the publish.
- **Release tags only from the protected main branch.** The release job refuses a tag whose commit is not on it.
- **A backup before every deploy**, because migrations run at startup (R10): a bad migration is applied the moment the new container starts. The backup records each table's row count and the migration history beside the dump.
- **Rehearse the restore.** Restore into a scratch database and compare the row counts against the backup's record; the restore refuses to run without that record. A backup never restored is first tested during data loss.
- **The same engine image as dev and tests** (§8.1).

**Later phases (scope when needed).** Installable PWA (manifest, with service-worker caching decided explicitly and a version check so an app left open across a deploy never runs a bundle the server was not built for, §10.2); engine-level row-security hardening (e.g. Postgres RLS, §8); any LLM/AI features behind an interface (e.g. `ISuggester`) so implementations slot into a chain. *(E2e is not here: it's established in Phase 2 and extended every phase, §12.)*
