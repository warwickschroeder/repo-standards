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
| **Unit** | server: xUnit + AwesomeAssertions (§3.1) · web: Vitest + RTL | Pure logic in isolation: importers/parsers, rule engines, derivations, mappers, reducers, hooks, single components, the event bus, module discovery. Cover branches + edge cases. | Fast: run freely |
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
- Web: `npm run lint` → `npm run build` (type-check + bundle) → `npx vitest run` (one-shot; a bare `vitest` watches and never exits whenever the terminal looks interactive, which an agent's shell can).
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
- **Integration:** tests run through the real Host via the stack's in-process test factory (reference stack: `Microsoft.AspNetCore.Mvc.Testing` + `WebApplicationFactory<Program>`, with `Program.cs` ending in `public partial class Program;` so WAF can find it) on a **real database** (**Testcontainers**, R32, never an in-memory substitute), whose image is pinned to the same exact tag as dev (§8.1, R11). Repoint the whole host at the container by overriding the connection string, so the real registration wiring stays under test; **never swap an individual context onto a different provider**. Share the container per test assembly and give each test its own database by cloning a migrated template, so tests stay isolated without paying a container each. The generic fixture over the context lives in `TestSupport.Integration`, references only `Core`, and every module integration project closes it over its own context: reuse without any module referencing another (R1).
- **Optional, and faster: one container for the whole run, across test processes.** Each test assembly runs in its own process, so a container per assembly pays a container start and a template migration per assembly. Reattaching every process to one container (reference stack: Testcontainers `WithReuse`) removes both, but reuse alone lets a later run clone a template migrated from an older schema, so it ships with four companions. Name the template by a fingerprint of the module builds (reference stack: a hash of the module assemblies' MVIDs), so any rebuild gets a fresh template. Create the template under an engine-level lock (reference stack: a Postgres advisory lock), so two processes cannot both find it missing and build it. Put the owning process id in each clone's name and drop clones whose process has exited, because the container outlives every run and nothing else reclaims them. Clean up the container only by its own reuse label, because reuse turns off the resource reaper and a blanket cleanup of the engine's containers also takes the dev database's.
- **Sign in by header, and keep one suite on the real token.** The integration support project registers a test authentication scheme that builds the user, the owner (§4.4) and the roles from request headers, so a test acts as anyone without minting a token and isolation tests stay cheap. The auth module's suite still signs in through the real login and sends the real token, so the production token path stays under test. Test host settings go in as host settings (reference stack: `UseSetting`), not through `ConfigureAppConfiguration`: under minimal hosting the latter can lose to `appsettings.json`, so an empty signing key there wins and every authenticated test returns 500.
- **Budget the engine's connections.** Each clone has its own connection string and so its own client-side pool, so idle pools from finished tests pile up towards the engine's connection cap, and pooled connections left on the template block cloning it (reference stack: Postgres refuses `CREATE DATABASE ... TEMPLATE` while the template has sessions). The clone fixture clears idle pools after migrating the template and before each clone (reference stack: `NpgsqlConnection.ClearAllPools()`). Hosted services that open connections of their own (monitors, log writers, anything on a timer) are switched off in the shared test-host defaults and switched back on only in their own module's suite. Treat the cap as a budget to check whenever a background worker is added: running out shows up as random assertion failures in unrelated tests that read like application races, not as a connection error.
- **Every rebuilt host must actually subscribe.** A once-only subscription guard (R16) held in process-wide static state lets only the first test host in a process subscribe; every later host gets a fresh bus nobody listens to, and the failure reads as a missing domain effect rather than a wiring fault. R16 ties the guard to the bus instance for this reason. Where a static guard remains (an app still being aligned, say), the integration support project resets every module's guard before each host is built. It finds modules the way the Host does (never a hand list, which silently misses the next module to start subscribing), runs after the template migration (which boots the Host once and sets every guard), and fails loudly on a module whose static guard state it does not recognise, because that is what a renamed guard looks like.
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

#### Correct, not just stable

A test of a computed value (a total, a forecast, a status decision, a sign, a boundary, a double-count outcome) asserts an expected value derived independently from the requirement: worked out by hand or from a worked example, never copied from what the code emits today. A copied value only pins behaviour, so it passes just as green on a bug that was there when the test was written.

- **The fixture tells the right answer from the plausible wrong one.** Name the likely wrong implementation (a flipped sign, `<=` for `<`, the wrong one of two similar fields, a double count) and choose values under which it gives a different result. Mix positive and negative balances so a wrong signing rule changes the total; put two events on the same day so a double count inflates a bucket instead of hiding in a new one.
- **Every new test is seen failing.** Write it red first; where it pins behaviour that already exists, break that behaviour on purpose, watch the test catch it, restore it and say so. A test nobody has watched fail proves nothing.
- **Check the restore is what ran.** A file put back with an old modification time (copied from a backup, for example) can look unchanged to an incremental build, so the next run still tests the mutant. Touch the restored file or force a full rebuild (reference stack: `dotnet build --no-incremental`, then `dotnet test --no-build`).
- Persistence round-trips and wire-shape tests are exempt: they prove data survives (R24), not that a computation is right.

### 12.5 End-to-end (browser automation) — first-class, not deferred

E2e is a **required** layer, written alongside the feature (R23), not a
someday-phase. For each user-facing slice ship e2e specs (reference stack:
Playwright) that:

- **Drive real journeys** through the running app (orchestrator-launched, or
  the built client against the real API): log in, navigate, perform the
  feature's core actions, and assert the user-visible outcome — not internal
  state.
- **Cover the design handoff's states + breakpoints** (§11): empty, loading, error, success, at each width the design names. The per-state screenshots are the reference for the look, and layout is accepted by measurement (below); add visual-regression snapshots for signature surfaces where useful.
- **Every journey also fails on a console error or a new server warning.** The spec collects the browser console and the server's log for the journey's span and fails on any error in the first or any warning or error in the second, because a journey can show the right outcome while the page throws or the server logs a failure.
- **Measure layout, never judge it from a screenshot.** At each width, a sweep in a real browser reads the painted page: overflow by comparing an element's `scrollWidth` with its width, wrapping by counting the distinct line positions of a cell's text, contrast against the backdrop each text run actually sits on, all through `getBoundingClientRect()` and `getComputedStyle()`. Confident reads of screenshots get these wrong in both directions.
- **Emulate the input as well as the width.** A phone run asks for a coarse pointer and no hover (Chrome DevTools Protocol: `Emulation.setEmulatedMedia`), because touch emulation alone can leave the pointer media features on `fine` and the touch-size rules never apply. It keeps the layout viewport at the emulated width (`mobile: false` in `Emulation.setDeviceMetricsOverride`), because otherwise Chrome widens the viewport to fit overflowing content and every overflow measures zero. Skip visually hidden (`sr-only`) elements and everything inside them, which report clipping that no one can see.
- **Exercise realtime** where the app uses it: assert a push message updates the
  UI.
- **Assert accessibility** on primary screens (roles/labels/focus order;
  optionally an axe scan) so the design's semantics survive implementation.
- **State lives in ARIA, and focus comes back.** Selection, pressed, expanded and checked state is carried in ARIA (`aria-checked`, `aria-selected`, `aria-pressed`, `aria-expanded`), never only in a CSS class, and specs assert on it. A dialog opened from state rather than from a trigger button returns focus to a deliberate element when it closes, not to the page body, and specs assert where focus lands.
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
- **A coverage floor gates "maximise coverage", once, after the test steps.** Set it on each side near the coverage measured when the gate is adopted, and only ever raise it. Four rules keep the number honest:
  1. **Collect per test project, never solution-wide.** A solution-wide coverage run races the instrumentation against the parallel build and emits reports with whole assemblies missing, which reads as a sudden collapse.
  2. **Merge on resolved source paths.** Each report can carry a different source root, so keying the union on the raw filename splits one file into several and under-reports badly; resolve each root plus filename to one repo-relative path first, and leave out generated code such as migrations.
  3. **Apply the floor to the union of every shard and project, never to one.** A shard runs part of the suite and covers part of the code, so a per-shard floor fails a healthy run (reference stack: switch Vitest's own threshold off in each shard and apply it to the merged report).
  4. **Print how many reports were merged, and read it.** A shard whose reports went missing drops its lines out of the union, and the count is the plainest sign of it.
- **A skipped job is not a passed one.** Where a required check reports a lane's combined result, it counts a skipped job as passing only when the job that decided to skip it succeeded; otherwise a broken filter skips every gate and reports green.
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
| **Dependency vulnerabilities** | R33(d), supporting R35 | `dotnet restore --force -p:AuditGate=true` (§3 sets which advisories fail it; `dotnet list package --vulnerable` exits 0 even when it finds some, so it is not a gate on its own) or an OSV/advisory scanner · `npm audit` | Fail on known **high/critical** advisories. Fix by upgrading or pinning a patched version; a temporary ignore carries a justification **and an expiry date**, never an open-ended mute. |

Principles that hold whatever the tools are:

- **Config lives in the repo**, versioned with the code — the gates run
  identically locally and in CI; no editor-only or machine-local rules.
- **Fix findings, don't suppress them.** A suppression requires an inline,
  justified annotation and is a review flag. Baseline files (grandfathering
  existing findings) are a *migration* device only — burn the baseline down,
  never grow it.
- **Warnings are errors** in CI. A "warning" that can be ignored will be.
- **A gate shows what it checked, and the count is read, not just the exit code.** Where its tool can, each gate prints a count (files scanned, reports merged, tests run), and a count far from the usual one is a failure to investigate. Two ways a gate passes having checked nothing: a duplication tool that rejects one unknown config key can discard the whole config and scan everything, and a type check run on a solution-style config with only project references (reference stack: `tsc --noEmit` on the root `tsconfig.json`) checks no file and exits 0, which is why the build (`tsc -b`) is the type gate.
- **Pin gate tool versions** wherever a major version changed the config schema, and re-check the count on every bump, because the new version may silently discard the old config.
- **The gates run before the build** in CI (fail fast), and per R25 before any
  change is claimed done.
- New rules/tools adopted later get wired into the same canonical commands —
  never a side channel someone has to remember to run.
