> **Modular Monolith Blueprint — §12.** [Index](README.md) · [Rules Digest](01-rules-digest.md)

## 12. Testing & Verification Discipline

**Maximise coverage at every layer.** This blueprint expects comprehensive
automated tests — unit, integration, **and end-to-end** — not a thin happy-path
suite. Every layer of the stack has a test layer that owns it; together they
form a test pyramid. The aim is the **highest coverage that buys real
confidence**: every endpoint, event flow, read-model projection, and critical
user journey is exercised, plus the failure/edge/isolation paths a user could
hit. Coverage is a means, not the target — chase *behaviour* coverage (branches,
error paths, cross-module seams), not a vanity line-percentage from trivial
assertions.

**Everything in this section is automated and mandatory.** The one hand-run practice this blueprint recognises — a short smoke script targeting only what a release changed — is deliberately **optional and on-request** ([§17.2](#172-manual-smoke-tests-docssmoke-tests)), and is never a substitute for anything below.

### 12.1 The test pyramid (what each layer owns)

Tooling names below are the reference stack's (§3.1) — a different stack keeps
the same four layers and gates with its own equivalents.

| Layer | Tooling (reference stack) | Owns / proves | Speed |
|---|---|---|---|
| **Unit** | server: xUnit + FluentAssertions · web: Vitest + RTL | Pure logic in isolation: importers/parsers, rule engines, derivations, mappers, reducers, hooks, single components, the event bus, module discovery. Cover branches + edge cases. | Fast — run freely |
| **Integration** | server: `WebApplicationFactory<Program>` + **the real chosen engine via Testcontainers** (R32 — never an in-memory substitute) | Behaviour across seams: each endpoint end-to-end, **event publish → subscriber → local read-model round-trip**, auth/authorisation, **access-boundary isolation** (§6.3), handler partial-failure — plus what only the real engine proves: CHECK constraints, foreign keys, unique indexes, real transactions, migrations applying, schema-per-module isolation, engine-specific SQL (reference stack: `ExecuteDelete`, `pg_trgm`, `ILIKE`, tsvector/GIN). | Needs Docker — one container per test assembly, template-cloned per test |
| **Full-stack** *(optional — add when you must prove the whole app boots together)* | `Aspire.Hosting.Testing` (the full app + real DB) | Orchestration-level wiring the in-process factory doesn't cover. | Slow — not in CI; run deliberately when orchestration wiring changes (§12.6) |
| **End-to-end (UI)** | **Playwright** as a real-backend **regression harness** — boots the real stack + DB (§12.9); no mock-backed e2e | Real user journeys in a real browser: login, navigation, each feature's critical flows, realtime push, accessibility, the design handoff's **states + breakpoints**, and **persistence** (a written row read back). | Slow — targeted tiers per change (R25); Full tier on the user's schedule (§12.6) |

Rule of thumb: **push a test as low as it can go** (a unit test if pure logic can
prove it), but **every user-visible journey gets an e2e test** and **every
cross-module/data-layer behaviour gets an integration test** — don't simulate at
a lower layer what only a higher layer actually proves.

### 12.2 What to run (and read) before claiming done — R25

The repo's canonical gates (reference-stack commands shown; a different stack
records its equivalents):

- Server: `dotnet build` (full type-check; analyzers + warnings-as-errors make
  it the server lint gate too) → `dotnet test`.
- Web: `npm run lint` → `npm run build` (type-check + bundle) → `npm run test`.
- Static gates (R33/§12.10): the **duplication** and **dead-code** checks
  whenever the change adds or removes code, and the **dependency vulnerability
  audit** whenever dependencies changed — cheap, run them freely.
- **Targeted per-module runs (R25/R34):** for each module the change touched,
  its integration-test project and its e2e project's **smoke/targeted tier**
  (§12.9) — this is required validation, not optional, because CI never runs
  the harness (§12.7).
- Full e2e harness (all modules, Full tier): **expensive** (§12.6) and not in
  CI — recommend the exact command for the user's schedule; the e2e specs
  themselves still ship with the change.
- Evidence before assertions: if something failed or was skipped, **say so with
  the output.** A green test run is not enough — the build catches what the test
  runner skips, and unit/integration green doesn't prove the journey works.

### 12.3 Test layout — three suites per module, one shared home per suite

**The structural rule (R23/R32): every module keeps its three test suites in
three separate per-module projects** — unit, integration, and e2e — mirroring
the module split in `src/`, so test code respects the same isolation as
production code (no module's tests reference another module's tests). **At most
one shared test-support project per suite type** exists to kill duplication;
each references only `Core` (never a module), so sharing fixtures can't breach
module isolation (R1).

| Suite | Per-module project | Shared support project (one, optional) | Database |
|---|---|---|---|
| **Unit** | `<App>.Modules.<M>.UnitTests` | `<App>.TestSupport.Unit` — builders, fakes, assertion helpers. **No database packages.** | None — must not touch a data context (R32) |
| **Integration** | `<App>.Modules.<M>.IntegrationTests` | `<App>.TestSupport.Integration` — container + migrated-template-clone fixtures | **Real chosen engine in a container** |
| **E2e** | one e2e-runner project per module (reference stack: a Playwright project over `e2e/modules/<M>/`) | `e2e/support/` — harness boot, auth fixtures, DB read-back client | **Real stack + real database** via the regression harness (§12.9) |

- **Unit:** the per-module unit project (and `TestSupport.Unit`) references
  **no** database packages at all — no DB driver, no Testcontainers, no
  integration support — so "a test that doesn't need a database must not touch
  a data context" is enforced by the compiler/resolver rather than by
  discipline, and the unit suite runs without Docker. (In the reference stack
  this split is also the only grouping the VS Code Testing view can show, since
  its tree is fixed at project → namespace → class and C# Dev Kit does not
  surface xUnit `[Trait]`s as test tags.) A module with no pure-logic tests
  simply has no unit project.
- **Integration:** tests run through the real Host via the stack's in-process
  test factory (reference stack: `Microsoft.AspNetCore.Mvc.Testing` +
  `WebApplicationFactory<Program>`, with `Program.cs` ending in
  `public partial class Program;` so WAF can find it) on a **real database**
  (**Testcontainers**, R32 — never an in-memory substitute). Repoint the whole
  host at the container by overriding the connection string, so the real
  registration wiring stays under test — **never swap an individual context onto
  a different provider**. Share the container per test assembly and give each
  test its own database by cloning a migrated template, so tests stay isolated
  without paying a container each. The generic fixture over the context lives in
  `TestSupport.Integration`, references only `Core`, and every module
  integration project closes it over its own context — reuse without any module
  referencing another (R1).
- **Web unit:** co-locate with source (`Foo.tsx` ↔ `Foo.test.tsx`, or
  `__tests__/`); reference stack: Vitest + React Testing Library + jsdom. (The
  client isn't a module, so co-location — not a per-module project — is the
  right shape here.)
- **E2e:** lives with the e2e runner (reference stack: `src/<App>.Web/e2e/`),
  organised as **one runner project per module** (`e2e/modules/<M>/`, declared
  in the runner's project list) plus the shared `e2e/support/` harness. Each
  module's specs are generated **1:1 from that module's regression runbook(s)**
  in `docs/runbooks/` (§12.9). A journey that spans modules (e.g. a domain
  action whose notification lands in the UI) belongs to the module that **owns
  the user-facing surface** where the journey starts; the other modules'
  effects are asserted as observable outcomes, not by reaching into their
  suites. One config, one harness (§12.9): the real-backend **regression
  harness** (reference stack: `playwright.config.ts` — global setup boots the
  orchestrated stack; a DB-client fixture does Lane 3 read-back). There is no
  mock-backed e2e suite. The repo's harness profile lives in
  `.claude/regression-runbooks/profile.md`.

### 12.4 Shape vs behaviour — R24

**Shape tests prove structure; only integration/e2e tests prove behaviour.** Any
change to a data layer — a persisted entity, a migration, a local read-model /
projection, or an event handler — **must** ship a real integration test that
writes then reads back **every affected field by name**
and asserts the values survive the round-trip. Don't lean on a generic suite
exercising other entities. Cover **access-boundary isolation** (a caller can't see
data outside their boundary — another user's private data, or another
workspace/tenant's data — §6.3) and event-handler **partial-failure** paths.

### 12.5 End-to-end (browser automation) — first-class, not deferred

E2e is a **required** layer, written alongside the feature (R23), not a
someday-phase. For each user-facing slice ship e2e specs (reference stack:
Playwright) that:

- **Drive real journeys** through the running app (orchestrator-launched, or
  the built client against the real API): log in, navigate, perform the
  feature's core actions, and assert the user-visible outcome — not internal
  state.
- **Cover the design handoff's states + breakpoints** (§11): empty, loading,
  error, success; key viewports the bundle specifies. Use the per-state
  screenshots as the acceptance reference; add visual-regression snapshots for
  signature surfaces where useful.
- **Exercise realtime** where the app uses it: assert a push message updates the
  UI.
- **Assert accessibility** on primary screens (roles/labels/focus order;
  optionally an axe scan) so the design's semantics survive implementation.
- **Select by user-facing locators** (`getByRole`/`getByLabel`/`getByText`),
  not brittle CSS/test-id soup; seed state through the API or a test fixture,
  not by clicking through setup every time. Each spec is independent and
  idempotent (fresh user/data per run).

Keep e2e focused on journeys and cross-cutting behaviour — don't re-test pure
logic the unit layer already covers. (The per-module organisation of these specs —
tiers, verification lanes, and the real-backend harness that boots the stack — is
§12.9.)

### 12.6 Test-cost discipline

- **Cheap, run freely:** the server build/type-check, the static gates (lint /
  duplication / dead code — §12.10), pure unit tests (no database), web unit
  tests, a single focused filter/spec.
- **Expensive — write them always, but to *run* the full suites recommend the
  exact command and stop, don't run unasked:** the whole server test suite
  (every database test is a real-DB container run — R32), full-stack runs (real
  app + DB in Docker; reference stack: `Aspire.Hosting.Testing`) and the **full
  e2e harness**. Authoring/updating these is **not** optional — only the
  *unattended full execution* is gated, because it's slow; CI runs the
  integration step last (§12.7) and the harness not at all (R34), with full
  harness runs on the user's schedule.
- **The exception — targeted per-module runs are in scope for every change**
  (R25): the modified modules' integration projects and their harness
  smoke/targeted tier are bounded by the per-module split (§12.3), so run them
  as part of validation rather than recommending them.

### 12.7 The CI pipeline — individual steps, fail fast, no harness (R34)

CI runs the same canonical commands as local validation, but its **shape** is
part of the contract:

- **One gate per step.** Every gate is its own **named workflow step** — never
  several gates lumped into one script — so a failure points at exactly one
  gate and the logs for each are separable.
- **Fail fast: cheapest first, longest last.** A step failure stops the
  pipeline; nothing later runs. The canonical order:

| # | Step | Cost |
|---|---|---|
| 1 | Server lint/static analysis · client lint (R33) | seconds |
| 2 | Duplication check · dead-code check · dependency vulnerability audit (R33) | seconds |
| 3 | Server build/type-check (release) | fast |
| 4 | Client build/type-check + bundle | fast |
| 5 | Unit tests — server + client (no database, no Docker) | fast |
| 6 | **Integration tests** — real engine in containers (R32) | the long pole — always **last** |

  Independent steps (server vs client lanes) may run as parallel jobs; the
  cheap-before-expensive ordering holds within each lane. In a stack whose
  analyzers run inside the compiler (the reference stack), step 1 is the fast
  style/format verification (e.g. `dotnet format --verify-no-changes`) and step
  3's build **is** the analyzer/warnings-as-errors gate — two steps, one lint
  contract (R25).
- **The real-backend e2e regression harness does not run in CI** (R34). It is
  too long for a per-change pipeline. Its coverage is delivered by:
  1. **Targeted runs as change validation** (R25): for each modified module,
     run its integration-test project and its e2e project's **smoke/targeted
     tier** (§12.9) — the per-module projects (§12.3) make "the modified
     modules" a mechanical filter, not a judgement call.
  2. **Full-tier runs on the user's schedule** — pre-release / pre-merge of a
     release branch, run deliberately (locally or on a dedicated runner), not
     per commit.

A change isn't done until the steps for the layers it touches are green in CI
**and** the targeted per-module runs have passed (R25). Treat a red CI as a
real failure to diagnose (§12.8), never something to retry blindly.

### 12.8 Diagnose before fixing

Classify a failing test before touching it: **test bug** (wrong
selector/assertion or un-awaited race → fix the test), **app bug** (app violates
a correct expectation → fix the app, not the test), or **flaky** (reproduce
first, then stabilise — e2e flakiness usually means a missing await/auto-wait,
not a reason to add blind sleeps or `retries`). Never rewrite a failing
assertion just to get green — that hides real bugs. When unsure which side is
right, surface it and ask.

### 12.9 Regression runbooks — the per-module E2E system (tri-purpose)

E2e coverage is organised as **one regression runbook per module**
(`docs/runbooks/<module>.md`; a module with several distinct user-facing areas
splits into `docs/runbooks/<module>/<area>.md`) — the single source of truth
for e2e-testing that module's surface, **matching 1:1 with the module's e2e
project** (§12.3): every runbook case maps to exactly one spec in that
module's e2e project, and every spec traces back to a runbook case. The
runbook is written once and used **three ways**:

1. **Manual, local (Profile A)** — a human runs it against the running app + real DB.
2. **Automated (Profile B)** — its e2e spec is generated **1:1** from the
   runbook and runs against the real stack (the real-backend harness below).
3. **Manual, second environment (Profile C)** — the same file, run on
   staging/preview with real auth.

Every case is both **human-runnable and automatable**; the runbook and its spec
stay in lockstep. A runbook has **three tiers**, run by scope of change:

- **Smoke** — the critical path only (~5–10 min); run for any change touching the module.
- **Targeted** — one case per feature (each field, validation rule, enum, filter,
  action, state transition); run when that feature changed.
- **Full** — exhaustive, pre-merge/pre-release. Carries the **every-field
  both-ends round-trip** and **per-field validation** (below).

**Derive from the source-of-truth, never hand-write.** Field lists, enum options,
required flags, and validation messages come from the canonical declaration (the
schema/DTO/constants home — §13 "single source of truth"), so a rename there is a
CI break, not a silently-stale runbook. Distinguish a **fixed canonical enum**
(assert the exact set) from **backend-seeded / provider-owned reference data**
(assert it reflects the loaded set — R28).

**Persistence is part of every mutating case — via a verification lane.** UI-only
assertions miss dropped or mis-mapped columns; each mutating case proves the write
reached the store through at least one lane:

| Lane | Proves | Available in |
|---|---|---|
| **Lane 1 — in-app** | re-open the list/detail; the re-fetch reflects the write | every profile |
| **Lane 2 — direct DB** | query the row directly (DB console / admin) — human step | manual profiles |
| **Lane 3 — automation read-back** | the harness queries the row in-process (a DB client or API read-back) | the real-backend harness |

The **Full tier's every-field round-trip** is the gold standard: fill **every**
input with a distinct value → write → assert **every** stored column equals it
(Lane 2/3; mind type mappings — enums store the *code*, dates/numbers their typed
form) → reset/reload → assert every value reads back into the form. One case
catches mis-mapped columns, enum code/label swaps, and dropped fields — exactly
what R24 proves at the integration layer, here proven through the real UI.

**One e2e harness — always the real backend.** All e2e runs on the
**regression harness**: the e2e config's global setup **boots the real stack**
(the orchestrated app — API + DB + the SPA wired to them) and exposes a
**DB-client fixture** for Lane 3 read-back, so every journey proves UI +
persistence end-to-end (§12.5's intent). Run serialised (one shared DB), with
generous timeouts. **Mock-backed e2e suites (endpoint stubs, no backend) are
not part of this blueprint** — they can't prove persistence or the real
contract, and a passing mocked journey is the same false confidence R32 bans
at the data layer; SPA rendering/wiring in isolation belongs to the unit/
component layer, not a stubbed browser suite. **The harness never runs in CI**
(R34/§12.7): its smoke/targeted tiers run per change for the modified modules
(R25), its Full tier on the user's schedule.

**Miss-nothing gate.** Discovery builds a **coverage ledger** — every route,
field, rule, branch, action, state, list feature, and persisted column — and each
item maps to ≥1 case before the module's runbook is "done". An unmapped item blocks completion
unless it genuinely doesn't exist (state the absence) or the user approves
deferring it — **never a unilateral descope**.

**Self-improving.** When a run surfaces a real defect, fix the app (or the test —
§12.8), add the regression, and record the lesson in the runbook and the repo's
harness profile (`.claude/regression-runbooks/profile.md`); fold anything
generalizable back into the tooling. Authoring and maintaining these runbooks is
what the **`regression-runbooks` skill/plugin** automates (where available; the
runbook format needs no tooling) — use it to scaffold a module's runbook, keep
the profile current, and generate the spec.

> **Sync-layer note.** In an **offline-first** app the Full tier also covers the
> sync round-trip + conflict resolution; in a plain **online-CRUD** app there is no
> sync layer, so state that absence per module and substitute the real concurrency
> behaviour (a 409 on a duplicate key, an optimistic-concurrency check).

### 12.10 Code-change validation — the static gates (R33)

Tests prove behaviour; these four **static gates** prove the code *stays
clean and safe* — they are the automated enforcement of the code-quality
rules, so the rules don't depend on reviewer discipline alone. The gates are
**stack-independent**; the tools implementing them are §3 decisions (reference
examples below). All four run on **both server and client**, headlessly, are
**blocking in CI**, and each has one canonical local command recorded in the
repo docs.

| Gate | Enforces | Reference-stack tools (server · client) | Notes |
|---|---|---|---|
| **Lint — code best practices** | idiomatic, safe code; also catches magic values (R27) where rules exist | Roslyn analyzers + `.editorconfig` with `TreatWarningsAsErrors` (+ `dotnet format` for style) · ESLint (typescript-eslint, `react-hooks`) | Strictest practical ruleset from day one — loosening later is easy, tightening is a slog. |
| **Code duplication** | R29 (reuse first) | a copy-paste detector — language-agnostic tools (e.g. jscpd-style) cover both sides with one config | Set a low tolerance threshold at project start; the threshold only ever **ratchets down**, never up to make a change pass. |
| **Dead code** | R30 (delete dead code) | unused-symbol analyzers (unused members/parameters diagnostics) + unused-dependency check · an unused files/exports/dependencies scanner (e.g. Knip-style) + the type-checker's `noUnusedLocals` | Covers unused files, exports, members, parameters, and dependencies — not just unreachable branches. |
| **Dependency vulnerabilities** | R33(d), supporting R35 | `dotnet list package --vulnerable` (or an OSV/advisory scanner) · `npm audit` | Fail on known **high/critical** advisories. Fix by upgrading or pinning a patched version; a temporary ignore carries a justification **and an expiry date**, never an open-ended mute. |

Principles that hold whatever the tools are:

- **Config lives in the repo**, versioned with the code — the gates run
  identically locally and in CI; no editor-only or machine-local rules.
- **Fix findings, don't suppress them.** A suppression requires an inline,
  justified annotation and is a review flag. Baseline files (grandfathering
  existing findings) are a *migration* device only — burn the baseline down,
  never grow it.
- **Warnings are errors** in CI. A "warning" that can be ignored will be.
- **The gates run before the build** in CI (fail fast), and per R25 before any
  change is claimed done.
- New rules/tools adopted later get wired into the same canonical commands —
  never a side channel someone has to remember to run.
