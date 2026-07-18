# Modular Monolith App Blueprint

> A complete, agent-ready specification for building a new application as a
> **modular monolith** — and for **selectively aligning an existing application**
> to it.
> Everything an autonomous coding agent needs to scaffold, extend, and ship the
> app is here: the architecture, the non-negotiable rules, copy-pasteable code
> skeletons, the design system contract, and the verification discipline that
> keeps every change inside the lines. For an **existing** project, the rules
> are a **menu, not a mandate**: run the alignment review, then adopt only what
> the user chooses ([§16](#16-aligning-an-existing-project-selective-adoption)).
>
> **The tech stack is NOT fixed by this blueprint.** The architecture fixes
> **seams and rules** — module isolation, events + local read models,
> schema-per-module, one push channel, one design-token home, the test pyramid —
> and every **technology** that fills those seams (server language & framework,
> data access, database engine, client framework, styling system, realtime
> transport, orchestration, test tooling, authentication) is **the user's
> decision, asked before the code that depends on it is written**
> ([§3](#3-stack-selection--decide-with-the-user-ask-first)). Never assume a
> stack.
>
> **How to read the code samples.** To keep the patterns concrete, all code in
> this document is written in one **reference stack** (C# / ASP.NET Core + EF
> Core on the server; React + TypeScript on the client — §3.1). The samples
> illustrate the *shape* the rules take — the contracts, lifetimes, guards, and
> boundaries — not a stack mandate: translate them faithfully into the stack
> the user chose. Wherever a sample names a reference-stack library, tool, or
> API, read it as "…or the chosen stack's equivalent".
>
> **How to use this document.** Replace the placeholders `<App>` (your product /
> solution name, e.g. `Acme`), `<Feature>` (a module name, e.g. `Billing`), and
> `<schema>` (the database schema/namespace a module owns, e.g. `billing`)
> consistently throughout. (Inside reference-stack code samples, `<UseProvider>`
> stands for the EF Core provider call matching the engine chosen with the user
> — §8 — e.g. `UseNpgsql` or `UseSqlServer`.) **New app:** confirm the stack
> decisions in §3 with the user, then follow the
> [Build Order](#14-build-order-phased) top to bottom. **Existing app:** start
> at [§16](#16-aligning-an-existing-project-selective-adoption) — audit first,
> change nothing until the user picks the alignment targets. The
> [Rules Digest](#1-rules-digest-read-first) is the contract — an agent must
> re-read it before every change and must not violate it (in an existing app,
> the contract is the digest **as scoped by the §16 adoption decisions**).
>
> **This blueprint expects a design-first workflow.** The visual/UX design is
> produced **upstream in Claude Design** (Anthropic's prompt-to-prototype tool)
> **before** the app is built, then **handed off** via *Export → Handoff to
> Claude Code* — which yields a **handoff bundle (zip)** plus a **copied prompt**.
> That bundle (component-structure spec, design tokens, breakpoints, interaction
> states, assets, screenshots, README, and design rationale) is the **design
> input** to construction: an agent commits it under `docs/design-handoff/`,
> lifts its tokens into the client's **single token home**, and **realises** it
> on the **chosen client stack** ([§11](#11-design-system-contract-design-first)).
> There is **no required `DESIGN.md`** — the committed bundle + the token home
> are the source of truth; a `DESIGN.md` is an optional, *derived* summary. The
> visual specifics quoted in §11 are an illustrative example only, shown to
> convey shape; **your app's tokens, type, and components come from your handoff
> bundle**, while the *structural* design rules in §11 (single token home,
> derive-don't-duplicate, realise-don't-reinterpret) hold regardless of the look.

**Contents:**
[0 North Star](#0-north-star) ·
[1 Rules Digest](#1-rules-digest-read-first) ·
[2 Solution Layout](#2-solution-layout) ·
[3 Stack Selection (ask first)](#3-stack-selection--decide-with-the-user-ask-first) ·
[4 Core Library](#4-core-library--the-framework-everyone-shares) ·
[5 Host](#5-host--the-composition-root) ·
[6 Module Template](#6-module-template) ·
[7 Standard module set](#7-the-standard-module-set) ·
[8 Persistence & Migrations](#8-persistence--migrations) ·
[9 Local-Dev Orchestration](#9-local-dev-orchestration) ·
[10 Client SPA](#10-client-spa) ·
[11 Design System Contract](#11-design-system-contract-design-first) ·
[12 Testing & Verification](#12-testing--verification-discipline) ·
[13 Cross-cutting conventions](#13-cross-cutting-conventions) ·
[14 Build Order](#14-build-order-phased) ·
[15 Definition of Done](#15-definition-of-done-per-change) ·
[16 Aligning an existing project](#16-aligning-an-existing-project-selective-adoption)

---

## 0. North Star

You are building a **modular monolith**: one host process, many isolated
feature modules, one shared relational database, and one web client.
Modules never call each other directly — they communicate **only** through
published events on an in-process bus, and each consumer keeps its **own local
read model**. This buys you the development simplicity of a monolith with the
isolation discipline of microservices, and it lets a fleet of agents work on
separate modules without stepping on each other. None of this depends on a
particular language or framework — the pillars below hold in any stack.

The four pillars, each enforced ruthlessly:

1. **Isolation** — modules reference only `Core`; cross-module data flows as
   events + local read models, never direct calls or cross-schema queries.
2. **One process, one database, schema-per-module** — physical co-location,
   logical isolation.
3. **Minimal surface** — the chosen framework's lightweight endpoint style,
   plain immutable DTOs, no heavyweight mediator / message-bus / object-mapping
   frameworks.
4. **Verifiable correctness** — every change ships tests; the build/type-check
   is a gate; integration tests prove behaviour across the event seams.

> **Every stack decision is deliberately left open and MUST be confirmed with
> the user before the code that depends on it is written — never assume a
> default.** §3 lists the full decision set and when each must be asked; the
> two with dedicated deep-dives are the **persistence backend** (ask **before
> Phase 1** — §8) and the **authentication mechanism** (ask **before Phase 3**
> — §4.6). Record every decision in `docs/ROADMAP.md`.

---

## 1. Rules Digest (read first)

These are the rules an agent must keep loaded at all times. They override
convenience. `[STRICT]` marks a rule that is stronger than typical guidance and
is the most common source of architecture drift.

### Architecture

- **R1** `[STRICT]` A module references **only** `<App>.Core`. **Never** another
  `<App>.Modules.*`. No exceptions.
- **R2** `<App>.Core` references **nothing** in `<App>.Modules.*`.
- **R3** `[STRICT]` Cross-module communication happens **only** via events on the
  in-process bus. If module B needs data from module A, B subscribes to A's
  event and maintains its **own local read model** in B's schema.
- **R4** Every module implements the shared **module contract** (reference
  stack: `IModule` — `Name`, `RegisterServices`, `MapEndpoints`) and is
  **mechanically constructible** by the composition machinery: no constructor
  arguments, no special setup (reference stack: `sealed`, parameterless ctor).
- **R5** `[STRICT]` Modules are **discovered automatically** at startup —
  reflection/assembly scan, a convention-based import, or a generated registry,
  whatever the chosen stack supports. The composition root contains **no
  hand-wiring** of any specific module — the single permitted exception is
  mapping the realtime hub (it needs the concrete type).
- **R6** The Host may reference module projects/packages **only** so the build
  ships them alongside the host (reference stack: `<ProjectReference>` for the
  DLL copy). **No module imports** in Host code except the one hub line.

### Data

- **R7** `[STRICT]` **One data-access context per module** (reference stack: a
  `DbContext`), **one shared physical database**,
  **logical-isolation-per-module** — a real schema where the engine supports it
  (`<Feature>` → `<schema>`, reference stack:
  `modelBuilder.HasDefaultSchema("<schema>")`), or the chosen engine's nearest
  equivalent. The **persistence engine is the user's choice and MUST be
  confirmed before Phase 1** (§8) — never assume one.
- **R8** `[STRICT]` A module **must not** read another module's schema — no
  cross-module entity/model mappings, no raw SQL against a foreign schema, no
  cross-schema joins.
- **R9** Each module owns its **own migrations**; its migrations-history
  table/ledger lives in its **own schema** (reference stack:
  `__EFMigrationsHistory` per schema).
- **R10** Migrations from day one, applied automatically at startup (reference
  stack: `Database.Migrate()`). **No schema auto-creation shortcut** (reference
  stack: `EnsureCreated`), **no hand-written SQL fix-ups** in the composition
  root.
- **R11** `[STRICT]` **One relational engine and one data-access layer for the
  whole app, chosen with the user (§8)** — Postgres, SQL Server, or another the
  user names; never mix engines. Wire the matching driver/provider and
  orchestration integration. The provider-specific snippets in this document
  (`UseNpgsql`, `postgres:17-alpine`, `pg_trgm`, `ILIKE`) are **illustrative**
  — substitute your chosen engine's equivalents.

### Events

- **R12** The bus is a **small hand-rolled in-process event bus** (reference
  stack: `InProcessEventBus : IEventBus`), registered as an app-lifetime
  **singleton**. **No mediator/message-bus frameworks and no external broker**,
  in any stack (reference-stack examples: MediatR, MassTransit, Wolverine,
  Rebus).
- **R13** Events are small **immutable value types** (reference stack:
  `record`s) implementing the marker `IEvent`.
- **R14** **Shared** events (consumed across modules) live in
  `Core/Events/Contracts/`. **Private** events live in
  `<App>.Modules.<Feature>/Events/`.
- **R15** Handlers resolve scoped services via a **fresh DI/composition scope
  per event**. The bus **retries** each handler a bounded number of times and
  then logs loudly (it **never silently swallows**), so one bad subscriber
  can't break the publisher; cooperative cancellation (real shutdown) is
  re-thrown, not retried. See the durability note in §4.2 for what retry does
  **not** solve.
- **R16** Subscriptions are wired **once, at endpoint-mapping time** (the
  service provider exists by then), guarded by an atomic once-only check
  (reference stack: `Interlocked.CompareExchange`) so integration-test rebuilds
  don't double-subscribe.

### API & DI

- **R17** **Lightweight endpoint routing only** — the chosen framework's
  minimal style (reference stack: ASP.NET Core Minimal APIs; e.g. FastAPI
  routers or Fastify routes elsewhere). No heavyweight MVC/controller layer, no
  attribute routing. Routes live under `/api/<feature>/...`.
- **R18** Request/response DTOs are **plain immutable record types** declared
  per module. **No object-mapping frameworks** (reference-stack example:
  AutoMapper).
- **R19** Composition lifetimes: the event bus, the current-user accessor, and
  outbound HTTP clients → **app-lifetime singletons**; data contexts, domain
  services, per-event handlers → **request-/event-scoped**; background workers
  → the stack's hosted-worker primitive (reference stack:
  `AddHostedService<T>`).
- **R20** `[STRICT]` **No business service interfaces** in `Core` (no
  `ICategoryService`, `IAccountService`). `Core` may define only **infrastructure**
  abstractions every module needs: `IEventBus`, `ICurrentUser`. Cross-module
  business needs go through events.

### Realtime push

- **R21** **One realtime push channel** for the whole app — a WebSocket/SSE hub
  in whatever transport was chosen in §3 (reference stack: SignalR) — owned by
  the `Notifications` module (reference stack: an empty `Hub` subclass). The
  Host maps it explicitly — the one place Host references a module type.
- **R22** `[STRICT]` **Only** the `Notifications` module touches the push
  transport's server API (reference stack: injecting `IHubContext<...>`). Other
  modules publish domain events; Notifications translates the push-worthy ones
  into client messages.

### Verification

- **R23** Every code change ships test changes (new code → new tests; modified →
  updated; deleted → dead tests removed). **Maximise coverage across all three
  suites** — unit, integration (real engine in a container), and **end-to-end**
  (browser automation against the real stack + real database; reference stack:
  Playwright) — per the test pyramid (§12). **Each module keeps all three
  suites in three separate per-module test projects** (§12.3), preserving
  module isolation; common fixtures live only in the **one shared test-support
  project per suite type**. Push each test as low as it can go, but **every
  user-facing journey gets an e2e test** and every cross-module/data-layer
  behaviour gets an integration test. E2e is first-class, not deferred — every
  e2e spec is generated **1:1 from a markdown regression runbook owned by the
  module** (tri-purpose: human-runnable locally, automated, human-runnable on a
  second environment), and each mutating case proves **persistence** through a
  verification lane (in-app / direct-DB / read-back), not just the UI (§12.9).
- **R24** `[STRICT]` Any change to a **data layer** (persisted entity,
  migration, local read-model/projection, or event handler) ships a real
  **integration test** through the real host (reference stack:
  `WebApplicationFactory<Program>`) that writes then reads back **every affected
  field by name** and asserts it survives the round-trip.
- **R25** Before claiming done, run **and read the output of** the repo's
  canonical gates on both sides: server lint/analysis + build/type-check then
  tests; client lint, then build/type-check, then tests (reference stack:
  `dotnet build` with analyzers + warnings-as-errors / `dotnet test`;
  `npm run lint` / `npm run build` / `npm run test`) — plus the duplication and
  dead-code gates (R33/§12.10) when the change adds or removes code, and the
  dependency vulnerability audit when dependencies changed. The build
  is the project-wide type-check and **lint is a separate blocking gate on both
  sides** (it runs **before** build in CI) — a green test run alone is not
  enough. For the **modules the change touched**, additionally run **their
  integration tests and the targeted tier of their e2e harness** (§12.9) — the
  per-module test projects (§12.3) make this a straight project/filter
  selection. This targeted run is part of change validation precisely because
  CI excludes the harness (R34).

### Design

- **R26** The design input is the **Claude Design → Claude Code handoff bundle**
  (zip + copied prompt), committed under `docs/design-handoff/` (design-first;
  §11). Realise it faithfully — including its interaction states and breakpoints
  — don't reinterpret or "improve" the design while coding. Lift its tokens into
  the client's **single token home** (§11; reference stack: `globals.css`)
  **once**; every component derives from them (never hard-code a hex/size that
  duplicates a token). Keep the client stack the user chose (§3) — translate the
  bundle into it, don't swap the stack to match the bundle. If a UI decision
  isn't covered by the bundle, **ask — don't invent.** `DESIGN.md` is optional
  and, if kept, is a *derived* summary, never the source of truth.

### Code quality

- **R27** `[STRICT]` **No magic numbers or strings — ever.** Any literal that carries
  meaning (a status, role, threshold, limit, header/claim name, event or push-message
  name, config key, schema/connection name, blob container, cache key, interval, size cap)
  **must** be a **named constant declared once** in a single authoritative place and
  referenced everywhere — on **both** server and client, in each side's constant idiom
  (reference stack: C# `const`/`static readonly`/enum; TS `const`/`as const`). **No
  duplicated literal lists** across files or across client and server. Only
  trivially-obvious, single-use values with no domain meaning may stay inline.
- **R28** `[STRICT]` **Constrained-value & reference data placement.** Decide by what the
  field *is*: **(a) behavioural state the code branches on** (statuses, roles, decision
  outcomes) → **code constants enforced by a DB CHECK constraint**, **never a lookup table**
  (adding a value always means code; a table only adds a join + seed-sync burden); **(b)
  genuine user/admin-managed reference data** the code does not branch on → **its own table
  (and module)**; **(c) data owned by an external provider** (e.g. a supported-language list)
  → **fetched from the provider at runtime behind a config-switched integration seam**
  (`Fake`/real; the general seam pattern is **§6.6**), **never hardcoded or copied into a
  table**. The provider/owner is the source of truth.
- **R29** **Reuse first; no duplication.** Extract shared logic/data instead of copying it —
  *unless* reuse would violate another rule (e.g. R1/R3 module isolation, or R20's "no
  business interfaces / keep Core lean" — don't couple Core to a tech just to DRY a few
  lines). Prefer the structural fix (shared helper/constant) over repetition; when a rule
  blocks reuse, isolate the small idiom and note why.
- **R30** **Delete dead code.** No unused types/members, commented-out blocks, orphaned
  files, or unreachable branches. A deletion ships with its now-dead tests removed (R23).
  Leave the tree with less, not more.
- **R31** **Background jobs don't poll.** No background-worker busy-wait
  (`while + sleep(short interval)`) to find work or watch a flag. Wake on an in-process signal
  (a `Core` signal primitive; reference stack: `JobSignal` +
  `PeriodicTimer`/`JobSignal.WaitAsync(timeout)`) raised by the producer; use a timer
  only for a genuine schedule or a sparse safety sweep; manual "run now" signals directly (persist a
  flag only as a restart backstop, checked once at startup). In-process / single-host.
- **R32** `[STRICT]` **Both test levels, and never a fake in-memory database substitute.**
  A change ships **unit** tests for its logic *and* **integration** tests for its wiring
  (R23/R24) — one is not a substitute for the other. **In-memory/substitute database test
  doubles are banned outright** (reference-stack example: EF InMemory; equally banned in any
  stack: SQLite standing in for another engine, mongomock, and kin): they are not the real
  engine (no CHECK constraints, no foreign keys, no unique indexes, no real transactions,
  none of the engine's dialect-specific SQL), so a test using one asserts against a provider
  production never runs on. A test that needs a database uses **the real chosen engine in a
  container** (reference stack: Testcontainers); a test that doesn't need one must not touch
  a data context at all.
- **R33** `[STRICT]` **Automated code-change validation — lint, duplication, dead code,
  vulnerabilities.** Every app wires **four static gates**, on **both** server and client,
  using the chosen stack's tools (§3/§12.10) — the gates are mandatory even though the
  tools vary: **(a) a linter enforcing code best practices**, at its strictest practical
  ruleset with warnings treated as errors; **(b) a code-duplication detector**
  (mechanically backing R29); **(c) a dead-code / unused-symbol detector** (mechanically
  backing R30 — unused files, exports, members, dependencies); **(d) a dependency
  vulnerability audit** failing on known high/critical advisories — resolve by upgrading
  or pinning a fixed version, and any temporary ignore carries a justification **and an
  expiry**. All four run headlessly, **block CI**, and are runnable locally with one
  canonical command each (recorded in the repo docs). Findings are fixed, never
  suppressed — a suppression needs an inline justification and is a code smell to
  challenge in review.

### CI

- **R34** `[STRICT]` **CI is a fail-fast pipeline of individual steps, and the
  real-backend e2e harness is not one of them.** Each gate is its **own visible
  step** (never lumped into one script), ordered **cheapest first, longest
  last**: static gates → builds → unit tests → integration tests (§12.7). A
  step failure stops the pipeline — later steps don't run. The **very long
  e2e regression harness is excluded from CI entirely**; it is covered instead
  by **targeted per-module runs as part of change validation** (R25 — the
  modified modules' integration tests + their harness's targeted tier) and by
  **full runs on the user's schedule** (pre-merge of a release / pre-release).
  There is no mock-backed e2e suite to fall back on — all e2e runs on the real
  backend (§12.9).

### Security

- **R35** `[STRICT]` **Security baseline** (§13.4). **(a) No secrets in the repo — ever:**
  no keys, credentialled connection strings, or tokens in source or committed config;
  secrets come from the environment (orchestrator-injected in dev, the platform's secret
  store in production), and a leaked secret is **rotated**, not just deleted from history.
  **(b) Endpoints are authenticated by default** — anonymous is the explicit, justified
  exception. **(c) Every request is validated server-side** at the endpoint boundary;
  client-side validation is UX, never the security boundary. **(d) Standard security
  headers** are served and CORS is locked to the known client origin(s) — production
  refuses to start on a wildcard (§5's fail-fast guards). **(e) Rate-limit**
  authentication and other abuse-prone public endpoints. Dependency vulnerabilities are
  gated by R33(d).

---

## 2. Solution Layout

> Shown in **reference-stack naming** (.NET projects + a Vite client). Keep the
> **structure** — `Core` / `Host` / one project per module / one client app /
> per-module test projects, with the same grouping folders — and adapt project,
> file, and tooling names to the chosen stack's conventions (workspace file,
> toolchain pin, and central dependency-version home in that stack's idiom).

```
<App>.slnx                          # workspace/solution file (reference stack: .NET slnx)
global.json                         # pins the toolchain version (reference stack: .NET SDK)
Directory.Packages.props            # central dependency-version home — ALL versions here
                                    #   (reference stack: Central Package Management)
DESIGN.md                           # OPTIONAL derived design summary (§11); not the source of truth
CLAUDE.md / AGENTS.md               # agent operating instructions — distilled from this blueprint,
                                    #   updated in the same change when a distilled rule changes (§13)
.claude/regression-runbooks/profile.md  # repo test-harness profile the regression runbooks read (§12.9)
docs/
  design-handoff/<date>-<surface>/  # committed Claude Design handoff bundle — the design source of truth (§11)
  ROADMAP.md                        # what's shipped / in progress / deferred (+ deliberate deviations)
  modules/<module>.md               # per-module design & reference doc, kept in step with the code
  specs/<date>-<topic>.md           # per-change design/spec + impact analysis for significant changes (§13.1)
  runbooks/<module>.md              # per-module regression runbook — tri-purpose E2E source of truth,
                                    #   1:1 with that module's e2e project (§12.9); split into
                                    #   runbooks/<module>/<area>.md when a module has several areas
src/
  aspire/                           # local-dev orchestration projects, grouped (reference stack: Aspire; §9)
    <App>.AppHost/                  # orchestrates local dev (DB + API + client in one command)
    <App>.ServiceDefaults/          # telemetry, health, resilience, service discovery
  <App>.Core/                       # module contract, event bus + IEvent, ICurrentUser,
                                    #   module discovery, auth wiring, shared Contracts
  <App>.Host/                       # the host process — composition root only
  modules/                          # one library/package per feature module, grouped
    <App>.Modules.<Feature>/
      <Feature>Module.cs            # the module-contract implementation
      Data/<Feature>DbContext.cs    # one data-access context per module + entities
      Migrations/                   # per-module migrations
      Endpoints/                    # endpoint handlers (lightweight routing, R17)
      Events/                       # module-private events
      Services/                     # module-internal services + event handlers
  <App>.Web/                        # the client SPA (reference stack: Vite + React, PWA-capable)
    e2e/                            # e2e workspace: support/ (shared harness) + modules/<Feature>/
                                    #   — one e2e project per module (§12.3/§12.9)
tests/
  <App>.Core.Tests/
  support/                          # ONE shared test-support project per suite type (§12.3):
    <App>.TestSupport.Unit/         #   builders/fakes/assertion helpers — NO database packages
    <App>.TestSupport.Integration/  #   real-DB fixtures (container + migrated-template clone)
  modules/                          # per-module test projects, mirroring src/modules/ (R23/R32/§12.3):
    <App>.Modules.<Feature>.UnitTests/         # pure logic — references NO database packages
    <App>.Modules.<Feature>.IntegrationTests/  # wiring — real engine in a container
```

> **Three suites per module, three shared homes.** Unit and integration live
> under `tests/` in the server stack; the e2e suite lives with the e2e runner
> (reference stack: Playwright under `src/<App>.Web/e2e/`, one runner project
> per module + a shared `support/` harness). The *structure* is the rule —
> per-module suite projects for isolation, at most one shared support project
> per suite type for reuse (§12.3) — the *location* follows the chosen stack's
> tooling.

> `src/aspire/` and `src/modules/` (and `tests/modules/`) are **physical folders
> that group projects on disk** — and map to matching solution folders in
> `<App>.slnx`. They are purely organisational: they **don't** change the
> dependency rules (the arrows below), namespaces (still `<App>.Modules.<Feature>`),
> or module discovery (modules are auto-discovered at runtime — §4.1, R5). Only
> the on-disk project paths change (e.g.
> `src/aspire/<App>.AppHost`, `src/modules/<App>.Modules.<Feature>`).

**Dependency direction (the only legal arrows):**

```
Modules.<Feature>  ──►  Core
Host               ──►  Core, ServiceDefaults, (every Module — ship-only reference, R6)
AppHost            ──►  Host (orchestration project ref)
ServiceDefaults    ──►  (nothing app-specific)
Core               ──►  (nothing app-specific)
```

---

## 3. Stack Selection — decide with the user (**ASK FIRST**)

> **STOP.** This blueprint ships with **no default tech stack**. The
> architecture fixes the **seams** — the module contract, the event bus, the
> current-user accessor, schema-per-module, one push channel, one design-token
> home, the test pyramid — and the **technologies** that fill them are the
> user's call. Ask **before writing the code that depends on the answer** (at
> project start for the core choices, and at latest before the phase noted
> below), and record every decision — and any later deliberate deviation — in
> `docs/ROADMAP.md`. If a later need exposes a gap in a chosen technology,
> surface it to the user; never silently switch or add a second one.

Each decision, when it must be made, and the **seam contract** the choice must
satisfy (everything else in this document holds unchanged whatever is picked):

| Decision | Ask before | The choice must provide |
|---|---|---|
| **Server language + web framework** | Phase 1 | Lightweight endpoint routing (R17); a DI/composition mechanism with app-lifetime and request/event scopes (R19); a hosted background-worker primitive (R31); an in-process host-testing facility (R24). |
| **Data access + migrations tooling** | Phase 1 | One data-access context per module; schema-per-module (or nearest equivalent); per-module migrations applied at startup (R7–R10). |
| **Database engine** | Phase 1 | Relational, one engine app-wide — full options + contracts in **§8**. |
| **Local-dev orchestration** | Phase 1 | One command boots database + API + client; exactly **one** orchestrator owns dev (§9). |
| **Test tooling (server layers)** | Phase 1 | A unit runner; integration tests against the **real chosen engine in a container** (R32); host-level test factory (R24). |
| **Static-analysis tooling (both sides)** | Phase 1 (server) / Phase 2 (client) | The four R33 gates in the chosen stack's tools: a best-practices linter (warnings as errors), a code-duplication detector, a dead-code/unused-symbol detector, and a dependency vulnerability audit — all headless, CI-blocking, one canonical command each (§12.10). |
| **CI platform** | Phase 1 (first pipeline) | Individual named steps with fail-fast ordering (R34/§12.7), Docker available for the integration-test step, and the ability to exclude the e2e harness while keeping it runnable on demand/schedule. |
| **Client framework + build tooling** | Phase 2 | A typed SPA/PWA-capable client with strict type-checking as a build gate, a separate blocking lint gate (R25), routing, forms + validation, and a server-state layer that supports push-driven cache invalidation (§10). |
| **Styling system + component library** | Phase 2 | A **single design-token home** the handoff bundle's tokens are lifted into once (§11, R26). |
| **Test tooling (client + e2e)** | Phase 2 | Unit/component tests, and browser-automation end-to-end (reference stack: Playwright) running as a real-backend regression harness — global-setup stack boot, DB read-back fixture, per-module projects with tier filters (§12.9). |
| **Authentication mechanism** | Phase 3 | Full options + contracts in **§4.6**. |
| **Realtime push transport** | Phase 4 (first push feature; the hub stub can wait until then) | Server→client push addressable to a per-user target; authenticable on the socket/connection (§4.5); owned solely by Notifications (R21/R22). |

Cross-stack rules that hold whatever is chosen:

- **Pin latest stable versions at install time**, and manage dependency
  versions **centrally** in the stack's idiom — one authoritative version home,
  and a locally-pinned version outside it is a build error where the tooling
  can enforce that (reference stack: Central Package Management —
  `Directory.Packages.props` with `ManagePackageVersionsCentrally` +
  `CentralPackageTransitivePinningEnabled`, bare `<PackageReference>`s;
  elsewhere: a single lockfile / workspace catalog).
- **The banned categories are stack-independent** (§13.2): mediator /
  message-bus frameworks and external brokers (R12), heavyweight MVC/controller
  layers (R17), object-mapping frameworks (R18), in-memory database test
  substitutes (R32), and a second dev orchestrator beside the chosen one (§9).
- **Add libraries reluctantly** — a dependency must fill a seam or earn its
  place; prefer the platform's built-ins (the reference stack uses built-in
  SignalR, not a third-party push service, and hand-rolls the event bus).

### 3.1 The reference stack (used by this document's code samples)

One concrete, known-good decision set — the stack every code sample in this
document is written in. **Offer it as a suggestion when the user has no
preference; never adopt it silently.**

- **Server (.NET):** ASP.NET Core Minimal APIs · EF Core (provider per §8) ·
  .NET Aspire for local-dev orchestration (`AppHost` + `ServiceDefaults`) ·
  built-in SignalR for push · auth per §4.6 (local-DB JWT reference: JwtBearer +
  Argon2id) · xUnit + FluentAssertions + `Microsoft.AspNetCore.Mvc.Testing` +
  **Testcontainers** for every database test (R32). Banned here: MediatR,
  MassTransit, Wolverine, Rebus, AutoMapper, ArchUnitNET, EF InMemory, Docker
  Compose (Aspire owns orchestration).
- **Client (React SPA/PWA):** React + Vite + TypeScript (strict) · Tailwind ·
  shadcn/ui + Radix + Lucide icons · React Router · TanStack Query (server
  state) · React Hook Form + Zod · ESLint as the blocking lint gate · Recharts
  via the shadcn `Chart` wrapper (only when a chart is actually needed) ·
  `vite-plugin-pwa` (later phase) · Vitest + React Testing Library, and
  **Playwright** for end-to-end journeys (§12).

---

## 4. Core Library — the framework everyone shares

`<App>.Core` is the only project modules reference. It contains the module
contract, the event bus, the auth infrastructure, and the **shared event
contracts** — and, as the app grows, the other **cross-cutting infrastructure**
every (or most) modules lean on (§4.7). It must contain **no business logic and
no business service interfaces** (R20).

> **Reference-stack code ahead.** The samples in §§4–7 and §9 are written in
> the reference stack (§3.1) so the patterns are concrete. They are the
> *pattern*, not a stack mandate: keep the contracts, lifetimes, guards, and
> the behaviour the comments encode; translate the idioms into the stack the
> user chose in §3.

### 4.1 Module contract

```csharp
// Core/Modules/IModule.cs
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace <App>.Core.Modules;

public interface IModule
{
    string Name { get; }
    void RegisterServices(IServiceCollection services);
    void MapEndpoints(IEndpointRouteBuilder app);
}
```

```csharp
// Core/Modules/ModuleDiscovery.cs
using System.Reflection;

namespace <App>.Core.Modules;

public static class ModuleDiscovery
{
    public static IReadOnlyList<IModule> DiscoverModules()
    {
        var baseDir = AppContext.BaseDirectory;
        var assemblies = Directory
            .EnumerateFiles(baseDir, "<App>.Modules.*.dll")
            .Select(Assembly.LoadFrom)
            .ToList();

        return assemblies
            .SelectMany(a => a.GetTypes())
            .Where(t => typeof(IModule).IsAssignableFrom(t) && !t.IsAbstract && !t.IsInterface)
            .Select(t => (IModule)Activator.CreateInstance(t)!)
            .OrderBy(m => m.Name)
            .ToList();
    }
}
```

### 4.2 Event bus

```csharp
// Core/Events/IEvent.cs
namespace <App>.Core.Events;
public interface IEvent { }   // marker
```

```csharp
// Core/Events/IEventBus.cs
namespace <App>.Core.Events;

public interface IEventBus
{
    Task PublishAsync<TEvent>(TEvent @event, CancellationToken ct = default) where TEvent : IEvent;
    void Subscribe<TEvent>(Func<TEvent, CancellationToken, Task> handler) where TEvent : IEvent;
}
```

```csharp
// Core/Events/InProcessEventBus.cs
using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;

namespace <App>.Core.Events;

public sealed class InProcessEventBus(ILogger<InProcessEventBus> log) : IEventBus
{
    private const int MaxHandlerAttempts = 3;                       // bounded retry, NOT fire-and-forget
    private static TimeSpan Backoff(int attempt) => TimeSpan.FromMilliseconds(100 * attempt);

    private readonly ConcurrentDictionary<Type, List<Delegate>> _subs = new();
    private readonly object _lock = new();

    public void Subscribe<TEvent>(Func<TEvent, CancellationToken, Task> handler) where TEvent : IEvent
    {
        var list = _subs.GetOrAdd(typeof(TEvent), _ => []);
        lock (_lock) { list.Add(handler); }
    }

    public async Task PublishAsync<TEvent>(TEvent @event, CancellationToken ct = default) where TEvent : IEvent
    {
        if (!_subs.TryGetValue(typeof(TEvent), out var handlers)) return;

        Delegate[] snapshot;
        lock (_lock) { snapshot = [.. handlers]; }

        // Sequential; one failing subscriber never breaks the publisher or its siblings.
        foreach (var h in snapshot.Cast<Func<TEvent, CancellationToken, Task>>())
            await InvokeWithRetryAsync(h, @event, ct);
    }

    private async Task InvokeWithRetryAsync<TEvent>(
        Func<TEvent, CancellationToken, Task> handler, TEvent @event, CancellationToken ct)
    {
        for (var attempt = 1; ; attempt++)
        {
            try { await handler(@event, ct); return; }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; } // real shutdown — don't swallow
            catch (Exception ex)
            {
                if (attempt >= MaxHandlerAttempts)
                {
                    // Give up LOUDLY — never silently. The read model this handler builds may now be
                    // stale until a reconciliation/outbox replay (see the durability note below).
                    log.LogError(ex, "Handler for {Event} failed after {Attempts} attempts; change dropped",
                        typeof(TEvent).Name, attempt);
                    return;
                }
                log.LogWarning(ex, "Handler for {Event} failed (attempt {Attempt}); retrying", typeof(TEvent).Name, attempt);
                await Task.Delay(Backoff(attempt), ct);
            }
        }
    }
}
```

> **Known limitation — read-model durability (the scaling boundary).** The bus is
> **in-process and at-most-once-with-retry**: `PublishAsync` runs *after* the
> producer has already committed its own write, so a handler that exhausts its
> retries (a **persistent** fault, not a transient one) leaves the consumer's
> local read model **permanently out of sync**, with no recovery path. Retry
> absorbs the transient case; it does **not** close the persistent one. This is
> acceptable while the app is single-host and read models are reconstructable, but
> it is the recognised boundary of this design. When you outgrow it the fix is a
> **transactional outbox** — persist events in the *producer's* transaction and
> have a background relay dispatch them with retry + dead-letter — **not** a
> cross-module reconciliation (that would need a module to read another's schema,
> breaking R3/R8). Treat "a dropped event silently desyncs a read model" as a bug
> to design against, not a surprise.

### 4.3 Shared event contract (example)

```csharp
// Core/Events/Contracts/<Thing>Created.cs
namespace <App>.Core.Events.Contracts;

public sealed record <Thing>Created(
    Guid <Thing>Id,
    Guid UserId,
    string Name,
    DateTimeOffset CreatedAt
) : IEvent;
```

### 4.4 Current-user infrastructure — the stable auth seam

`ICurrentUser` is the **only** thing modules know about authentication. It is the
stable seam that decouples every module from *how* a user is authenticated. The
authentication **mechanism is the implementor's choice** (see §4.6) — modules
never change when you swap it.

```csharp
// Core/Auth/ICurrentUser.cs
namespace <App>.Core.Auth;

// UserId is the minimum seam. If modules need a few more claims, extend THIS interface in
// Core — infrastructure, R20-permitted (§4.6) — rather than reading HttpContext from a
// module, and keep CurrentUser (below) in step. (This app adds Role and Email.)
public interface ICurrentUser { Guid? UserId { get; } }
```

```csharp
// Core/Auth/CurrentUser.cs
using System.Security.Claims;
using Microsoft.AspNetCore.Http;

namespace <App>.Core.Auth;

public sealed class CurrentUser(IHttpContextAccessor httpContextAccessor) : ICurrentUser
{
    public Guid? UserId
    {
        get
        {
            var sub = httpContextAccessor.HttpContext?.User.FindFirstValue(ClaimTypes.NameIdentifier);
            return Guid.TryParse(sub, out var id) ? id : null;
        }
    }
}
```

### 4.5 JWT validation extension (the default reference implementation)

`Core` ships **one** `AddAuth(...)`-style extension that the Host calls. The
implementor picks what goes inside it (§4.6). The reference implementation
validates a bearer JWT (issuer/audience/lifetime/signing key, key ≥ 32 chars or
throw). **Regardless of which mechanism you choose,** keep the hook that
authenticates the realtime push connection from the `access_token` query
string for `/hubs/*` paths — WebSocket connections can't send an
`Authorization` header, so this principle holds for any push transport
(reference stack: SignalR's `OnMessageReceived`):

```csharp
opts.Events = new JwtBearerEvents
{
    OnMessageReceived = context =>
    {
        if (context.HttpContext.Request.Path.StartsWithSegments("/hubs"))
        {
            var accessToken = context.Request.Query["access_token"];
            if (!string.IsNullOrEmpty(accessToken)) context.Token = accessToken;
        }
        return Task.CompletedTask;
    }
};
```

For local-DB JWT, bind options (`Issuer`, `Audience`, `SigningKey`, expiry) from
configuration section `Jwt`. For an external IdP, bind `Authority`/`Audience`
(and let the middleware fetch signing keys from the IdP's metadata) instead of a
local `SigningKey`.

### 4.6 Authentication is the implementor's choice — **ASK FIRST**

> **STOP.** This blueprint ships with **no default authentication mechanism**.
> Before Phase 3 (login wiring, protected routes, the SPA sign-in flow, and — for
> self-hosted credentials — the `Auth` module + admin CLI), the agent **MUST ask
> the user which authentication mechanism to use** and record the answer in
> `docs/ROADMAP.md`. **Never assume one** — the choice decides whether the `Auth`
> module exists at all, what `AddAuth` wires, and how the client signs in.

The architecture fixes the **seam**, not the **provider**. Whatever the user
chooses must satisfy three contracts and nothing more:

1. **`ICurrentUser.UserId`** resolves to a stable per-user `Guid` from the
   incoming request principal (e.g. the `sub`/`NameIdentifier` claim, or a claim
   you map to your user id).
2. **`RequireAuthorization()`** on endpoints rejects unauthenticated requests.
3. **The realtime push connection** can authenticate on the socket (reference
   stack: SignalR's `access_token` query-string hook, §4.5) so per-user push
   groups line up with `ICurrentUser.UserId`.

Valid implementations — pick one, keep the rest of the app unchanged:

| Option | What `AddAuth` wires | User store / provisioning | Notes |
|---|---|---|---|
| **Local-DB JWT** (reference) | `AddJwtBearer` validating a symmetric key you sign | `Auth` module + `admin add-user` CLI; Argon2id hashes | Fully self-hosted, no external dependency. **The code samples in §5/§7 illustrate this option** — treat them as illustrative, not as an assumed default. |
| **OpenID Connect (generic)** | `AddJwtBearer` with `Authority` + `Audience` (validates IdP-issued tokens via discovery) | Users live in the IdP; the app may keep a thin local profile keyed by the IdP `sub` | Auth0, Okta, Keycloak, Google, etc. SPA uses an OIDC client (PKCE). |
| **Azure Entra ID** | `Microsoft.Identity.Web` (`AddMicrosoftIdentityWebApi`) or `AddJwtBearer` against the Entra authority | Users in the tenant directory; map `oid`/`sub` to your `Guid` | Enterprise SSO, conditional access, MSAL on the client. |
| **Mixed / pluggable** | Multiple schemes + a policy selecting between them | Per scheme | E.g. local JWT for service accounts + OIDC for humans. |
| **Other — the user names it** | the matching ASP.NET Core auth handler (e.g. AWS Cognito, Firebase, a custom scheme) | per the provider | **Confirm how the principal maps to a stable `Guid` `ICurrentUser.UserId` before building**, and note it in `docs/ROADMAP.md`. |

Rules that hold across **all** options:

- The **`Auth` module is optional.** It exists only when you own the credential
  store (local-DB JWT). With an external IdP, drop the `Auth` module entirely —
  there is no `auth` schema, no login endpoint, no `add-user` CLI. The Host's
  admin-CLI branch (§5) and the `Auth` references disappear with it.
- Modules still depend on **`ICurrentUser` only** — never on the chosen scheme,
  tokens, or claims directly. If a module needs claims beyond `UserId`, extend
  `ICurrentUser` in `Core` (it's infrastructure, R20-permitted), don't reach
  into `HttpContext` from a module.
- Whatever maps an authenticated principal to your domain `UserId` lives in
  **`Core/Auth`** (the `CurrentUser` implementation), so swapping providers is a
  one-file change.
- When an external IdP owns identity but a module needs to react to user
  lifecycle (e.g. first-login provisioning of a local profile/read-model), do it
  the blueprint way: publish a `UserSignedIn`/`UserProvisioned` **shared event**
  and let interested modules build their own local read model (R3) — don't have
  modules call an IdP SDK directly.

> **Choose before Phase 3** and record it in `docs/ROADMAP.md`, alongside the
> persistence decision (§8). The auth choice shapes the `Auth` module's
> existence, the Host's admin CLI, and the SPA's login flow. If a later need
> exposes a gap in the chosen mechanism, surface it to the user — don't silently
> bolt on a second scheme (beyond a deliberate **Mixed / pluggable** choice).

### 4.7 What else legitimately lives in Core

`Core` is the shared **infrastructure** kernel, not only the four things above. As
the app grows it accretes cross-cutting homes most modules need — all still
infrastructure, so R20 (no *business* service interfaces) holds. Expect, and keep
in `Core`:

- **Shared database wiring** — the connection name, the migrations-history table
  name, and the data-source / managed-identity setup as named constants + an
  extension the Host and modules call, so the persistence engine is configured in
  **one** place.
- **CHECK-constraint helpers** — the small builder that turns a `Roles` / `Status`
  constant set into a column CHECK predicate (the mechanism behind R28(a)).
- **Cross-cutting constants & value types** — paging caps + a `PagedResult<T>`
  (§13), shared sort options, health-check tag/name constants, and the
  integration-seam keys + mode values (§6.6).
- **Read-only infrastructure seams** — e.g. an `IDocumentContentSource` that hands
  a consumer the *bytes* of a blob another module owns **without** exposing that
  module's schema (R8). This is the line R20 draws: a **read-only infrastructure**
  accessor may live in `Core`; a **business** service interface (`IOrderService`,
  `IApprovalService`) may not — those needs go through events (R3).

If several modules would otherwise duplicate the same infrastructure literal or
wiring, its home is `Core` (R29). If only one module needs it, it stays in that
module (§13 "right home").

---

## 5. Host — the composition root

`Program.cs` is the **composition root** of `<App>.Host` and carries **no business
logic**. It does exactly: *(optional admin-CLI branch, local-DB auth only)* →
build the web app → register infra singletons → discover & register modules →
migrate every module DbContext → map the hub → map module endpoints → SPA fallback
→ run. The Host may also own a **small number of cross-cutting infrastructure
endpoints** that belong to no single module (e.g. a platform health/diagnostics or
services-state panel) — keep those in their own Host files (e.g.
`Platform/PlatformEndpoints.cs`), **not** inline in `Program.cs`, and keep them
free of domain logic. Nothing else lives in the Host.

> The admin-CLI branch below exists **only for the local-DB JWT option** (it
> provisions users into the `Auth` module). If you chose an external IdP (§4.6),
> delete the entire `if (args… "admin" "add-user")` block and the `Auth`
> references with it, and replace `AddJwtAuth` with your IdP's validation
> wiring.

```csharp
using <App>.Core.Auth;
using <App>.Core.Events;
using <App>.Core.Modules;
using Microsoft.EntityFrameworkCore;

// --- Admin CLI: run a command and exit without starting the web server. ---
// Uses the generic host (not WebApplicationBuilder) so it stays lightweight.
if (args.Length >= 3 && args[0] == "admin" && args[1] == "add-user")
{
    var email = args[2];
    var password = args.Length >= 4 ? args[3]
        : throw new ArgumentException("Usage: admin add-user <email> <password>");

    var cliBuilder = Host.CreateApplicationBuilder(new HostApplicationBuilderSettings
    {
        Args = args,
        ContentRootPath = AppContext.BaseDirectory,
        EnvironmentName = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT")
            ?? Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT")
            ?? Environments.Development
    });
    var cs = cliBuilder.Configuration.GetConnectionString("<app>")
        ?? throw new InvalidOperationException("Connection string '<app>' not found.");
    cliBuilder.Services.AddDbContext<<App>.Modules.Auth.Data.AuthDbContext>(o =>
        o.<UseProvider>(cs, x => x.MigrationsHistoryTable("__EFMigrationsHistory", "auth"))); // <UseProvider> = chosen provider (§8)

    using var cliApp = cliBuilder.Build();
    await using var scope = cliApp.Services.CreateAsyncScope();
    var db = scope.ServiceProvider.GetRequiredService<<App>.Modules.Auth.Data.AuthDbContext>();
    await db.Database.MigrateAsync();
    // ... create user (Argon2id hash), save, print id ...
    return;
}

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();                                    // Aspire: OTel, health, resilience

builder.Services.AddSingleton<IEventBus, InProcessEventBus>();   // R12
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUser, CurrentUser>();
builder.Services.AddJwtAuth(builder.Configuration);
builder.Services.AddAuthorization();
builder.Services.AddSignalR();
builder.Services.AddCors(opts => opts.AddDefaultPolicy(p => p
    .WithOrigins(builder.Configuration["Cors:SpaOrigin"] ?? "http://localhost:3000")
    .AllowAnyHeader().AllowAnyMethod().AllowCredentials()));

var modules = ModuleDiscovery.DiscoverModules();                 // R5
foreach (var m in modules) m.RegisterServices(builder.Services);

var app = builder.Build();

foreach (var m in modules) app.Logger.LogInformation("Discovered module: {Name}", m.Name);

app.MapDefaultEndpoints();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

// The ONE place Host references a module type (R6/R21).
app.MapHub<<App>.Modules.Notifications.Hubs.NotificationHub>("/hubs/notifications");

// Migrate every module DbContext (R10). Always the real provider — tests run it too (R32).
using (var scope = app.Services.CreateScope())
{
    var dbContextTypes = AppDomain.CurrentDomain.GetAssemblies()
        .SelectMany(a => { try { return a.GetTypes(); } catch { return []; } })
        .Where(t => t.IsSubclassOf(typeof(DbContext)) && !t.IsAbstract
                 && t.Namespace?.StartsWith("<App>.Modules.") == true);

    foreach (var ctxType in dbContextTypes)
        if (scope.ServiceProvider.GetService(ctxType) is DbContext ctx)
            await ctx.Database.MigrateAsync();
}

foreach (var m in modules) m.MapEndpoints(app);                 // subscriptions wire here (R16)

app.MapFallbackToFile("index.html");                            // SPA fallback
app.Run();

public partial class Program;   // required for WebApplicationFactory<Program> (R24)
```

> **Production hardening lives here too.** The sample above is the dev-minimal
> shape; a real composition root also wires host-level **infrastructure** the
> blueprint doesn't spell out inline (none of it business logic): **fail-fast
> config guards** (refuse to start in Production on a wildcard `AllowedHosts`, or a
> missing/`localhost` SPA origin); a **transport size ceiling** (`Kestrel`
> `MaxRequestBodySize` + `FormOptions.MultipartBodyLengthLimit`) if you accept
> uploads; `.RequireAuthorization()` on the mapped hub; and — for a managed cloud
> database — a data source whose credential comes from the platform identity (e.g.
> an Entra-token password provider via `DefaultAzureCredential`), a no-op in dev.
> These are composition concerns, so they stay in the root.

---

## 6. Module Template

A module is a self-contained vertical slice: its own data-access context +
schema, its own migrations, its own endpoints, its own event handlers and local
read models. Use this template (reference-stack code — translate per §3) for
every new `<Feature>`.

### 6.1 `<Feature>Module.cs`

```csharp
using <App>.Core.Events;
using <App>.Core.Events.Contracts;
using <App>.Core.Modules;
using <App>.Modules.<Feature>.Data;
using <App>.Modules.<Feature>.Endpoints;
using <App>.Modules.<Feature>.Services;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace <App>.Modules.<Feature>;

public sealed class <Feature>Module : IModule          // R4: sealed, parameterless ctor
{
    public string Name => "<Feature>";
    private static int _subscribed;                    // R16: one-time subscription guard

    public void RegisterServices(IServiceCollection services)
    {
        services.AddDbContext<<Feature>DbContext>((sp, opts) =>
        {
            var cs = sp.GetRequiredService<IConfiguration>().GetConnectionString("<app>");
            opts.<UseProvider>(cs, o => o.MigrationsHistoryTable("__EFMigrationsHistory", "<schema>")); // R9; <UseProvider> = chosen provider (§8)
        });

        services.AddScoped<SomethingImportedHandler>();   // R19: handlers are Scoped
        // services.AddScoped<DomainService>();
        // services.AddHostedService<BackgroundWorker>();  // if needed
    }

    public void MapEndpoints(IEndpointRouteBuilder app)
    {
        <Feature>Endpoint.Map(app);                       // R17: Minimal APIs

        if (Interlocked.CompareExchange(ref _subscribed, 1, 0) == 0)   // R16
        {
            var bus = app.ServiceProvider.GetRequiredService<IEventBus>();

            bus.Subscribe<SomethingImported>(async (e, ct) =>          // R15: fresh scope per event
            {
                using var scope = app.ServiceProvider.CreateScope();
                var handler = scope.ServiceProvider.GetRequiredService<SomethingImportedHandler>();
                await handler.HandleAsync(e, ct);
            });
        }
    }
}
```

### 6.2 `Data/<Feature>DbContext.cs`

```csharp
using Microsoft.EntityFrameworkCore;

namespace <App>.Modules.<Feature>.Data;

public sealed class <Feature>DbContext(DbContextOptions<<Feature>DbContext> options) : DbContext(options)
{
    public DbSet<Thing> Things => Set<Thing>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("<schema>");        // R7: schema-per-module
        modelBuilder.Entity<Thing>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.UserId, x.ExternalKey }).IsUnique();
        });
    }
}

public sealed class Thing
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }                      // scope every read to its access boundary (§6.3)
    public required string ExternalKey { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
```

### 6.3 `Endpoints/<Feature>Endpoint.cs`

```csharp
using <App>.Core.Auth;
using <App>.Modules.<Feature>.Data;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace <App>.Modules.<Feature>.Endpoints;

// Request/response DTOs are records, declared per module (R18). No AutoMapper.
public sealed record CreateThingRequest(string Name);
public sealed record ThingResponse(Guid Id, string Name, DateTimeOffset UpdatedAt);

public static class <Feature>Endpoint
{
    public static void Map(IEndpointRouteBuilder app)
    {
        app.MapGet("/api/<feature>/things", async (
            ICurrentUser currentUser, <Feature>DbContext db, CancellationToken ct) =>
        {
            if (currentUser.UserId is not { } userId) return Results.Unauthorized();

            var things = await db.Things
                .Where(t => t.UserId == userId)            // scope to the access boundary — per-user here (see note)
                .OrderBy(t => t.UpdatedAt)
                .Select(t => new ThingResponse(t.Id, t.ExternalKey, t.UpdatedAt))
                .ToListAsync(ct);

            return Results.Ok(things);
        }).RequireAuthorization();
    }
}
```

> **Scope to the access boundary — not always to the individual user.** Per-user
> filtering (`WHERE UserId = @me`) is the **default** and the right call for
> personal data (a user's notifications, settings, private drafts). But many
> domains are **workspace/tenant-shared**: every member sees the same records,
> subject to role (e.g. *reviewer+ sees all; others see published + their own*).
> There the boundary is the workspace (plus a role gate), not the individual. Pick
> the boundary the requirements dictate, apply it **consistently** on every read
> through a shared query helper (e.g. `.VisibleTo(currentUser)`) rather than
> hand-written `Where` clauses that drift, and **record any workspace-shared
> decision in `docs/ROADMAP.md`**. The rule that never bends: **every query is
> scoped to *some* boundary — never return the whole table.**

### 6.4 Event handler (local read model)

```csharp
using <App>.Core.Events.Contracts;
using <App>.Modules.<Feature>.Data;

namespace <App>.Modules.<Feature>.Services;

// Consumes another module's event and maintains THIS module's local read model (R3/R8).
public sealed class SomethingImportedHandler(<Feature>DbContext db)
{
    public async Task HandleAsync(SomethingImported e, CancellationToken ct)
    {
        var existing = await db.Things.FindAsync([e.ThingId], ct);
        if (existing is null)
            db.Things.Add(new Thing { Id = e.ThingId, UserId = e.UserId,
                ExternalKey = e.Key, UpdatedAt = e.OccurredAt });
        else
            existing.UpdatedAt = e.OccurredAt;
        await db.SaveChangesAsync(ct);
    }
}
```

### 6.5 Publishing an event

A producer endpoint/service injects `IEventBus` and publishes after committing
its own write:

```csharp
await db.SaveChangesAsync(ct);
await bus.PublishAsync(new <Thing>Created(thing.Id, userId, thing.Name, DateTimeOffset.UtcNow), ct);
```

### 6.6 Config-switched external-service seams

Any dependency the app **doesn't own** — cloud storage, a translation/AI provider,
an email sender, a managed search index, a provider-owned reference list — sits
behind a **config-switched seam**, never called directly. This is R28(c) (provider
data) generalised to *every* external service, and in practice it's one of the
most-used patterns in a real app, so treat it as first-class:

- **An interface in the owning module** (or in `Core` only if genuinely shared —
  e.g. a read-only content source, §4.7): `IBlobStore`, `ITranslator`,
  `IEmailSender`, `ISearchIndex`, `ILanguageCatalog`, …
- **A `Fake` (or emulator) implementation that is the default**, so the whole app
  boots and every test runs **offline** with no cloud credentials.
- **A real adapter** behind the same interface for deployed environments; it picks
  its own auth (dev shared-key/emulator vs. managed identity in prod) *inside* the
  seam, so nothing above it knows or cares.
- **One switch per seam**, read from config under a single `Integrations:*`
  namespace, with **named constants** (R27) for both the keys and the mode values
  — never scattered strings. A seam may have more than two modes (e.g.
  `Fake | Postgres | Azure`).
- **Reflected in health** — a Fake seam registers a no-op check; a real one
  registers a live probe, so a services-state view shows what's actually wired.

```csharp
// In <Feature>Module.RegisterServices — one switch, named constants, Fake default.
var mode = config[IntegrationKeys.Translator] ?? IntegrationModes.Fake;      // R27: no bare strings
if (mode == IntegrationModes.Azure) services.AddSingleton<ITranslator, AzureTranslator>();
else                                services.AddSingleton<ITranslator, FakeTranslator>();
```

The **AppHost** resolves each seam's mode once (explicit config wins; else the
provider when its settings are present; else the Fake/local fallback) and injects
it — plus any endpoints/keys — as environment variables, so a single dev config
point drives the whole stack (§9). Keep the seam list, its keys, and its mode
values in **one** constants home in `Core` — don't re-list them per module (R29).

---

## 7. The standard module set

Every app on this blueprint starts with these foundational modules (the `Auth`
module is included **only** if you own the credential store — §4.6). Add domain
modules beyond them.

1. **`Auth`** (`auth` schema) — **optional; present only if you own the
   credential store** (local-DB JWT, §4.6). When present: `POST /api/auth/login`
   → signed JWT (`sub` = user id, e.g. 7-day expiry); Argon2id password hashing;
   **no public registration endpoint** — users are provisioned via the admin CLI
   (`<App>.Host admin add-user <email> <password>`). Publishes no events by
   default. **With an external IdP (OpenID Connect / Azure Entra ID), omit this
   module entirely** — identity lives in the IdP and the only auth code is the
   validation wiring in `Core` (§4.5/4.6).

2. **`Notifications`** (stateless, no DB) — the bus→push translator for the
   transport chosen in §3 (reference stack: SignalR). Owns
   `Hubs/NotificationHub.cs` (empty hub subclass) and the per-user connection
   mapping (reference stack: a custom `IUserIdProvider` reading the JWT `sub`)
   so push user groups match `ICurrentUser.UserId`. Subscribes to push-worthy
   events and fans them out: domain event → subscriber (fresh scope) → scoped
   relay holding the push API (reference stack: `IHubContext<NotificationHub>`)
   → `Clients.User(userId.ToString()).SendAsync("<message>", payload, ct)`. Adding
   a new push is a ~10-line subscriber. **No other module touches the push
   transport (R22).**

3. **At least one read-model consumer** — the canonical embodiment of R3: holds
   **local mirrors** of data owned elsewhere, built purely from subscribed events,
   and **never** queries the producer's schema. This can be a dedicated module
   (e.g. a `Dashboard` serving read-only aggregates) **or** — more often in
   practice — the read-model living *inside* whichever module needs it (a search
   index fed by translation events, a roles mirror a notifier uses to resolve
   recipients, a usage ledger fed by consumption events). The pattern is "mirror
   via events + local read model", not "one folder called read-model".

Add domain modules (`Transactions`, `Billing`, `Catalog`, …) as independent
vertical slices following §6.

### 7.1 Notifications relay skeleton

```csharp
// Modules.Notifications/Services/SomethingHappenedHubRelay.cs
using <App>.Core.Events.Contracts;
using <App>.Modules.Notifications.Hubs;
using Microsoft.AspNetCore.SignalR;

namespace <App>.Modules.Notifications.Services;

public sealed class SomethingHappenedHubRelay(IHubContext<NotificationHub> hub)   // ONLY here (R22)
{
    public async Task HandleAsync(SomethingHappened e, CancellationToken ct) =>
        await hub.Clients.User(e.UserId.ToString())
            .SendAsync("<message-name>", new { e.ThingId, e.Status }, ct);
}
```

```csharp
// Modules.Notifications/Hubs/NotificationHub.cs
using Microsoft.AspNetCore.SignalR;
namespace <App>.Modules.Notifications.Hubs;
public sealed class NotificationHub : Hub { }   // empty by design
```

---

## 8. Persistence & Migrations

### 8.1 The persistence backend is the implementor's choice — **ASK FIRST**

> **STOP.** This blueprint ships with **no default database engine**. Before
> Phase 1 (the server skeleton stands up data contexts and writes the first
> migrations), the agent **MUST ask the user which persistence backend to use**
> and record the answer in `docs/ROADMAP.md`. **Never assume one** — the choice
> determines the driver/provider package (reference stack: the EF Core provider
> and its `<UseProvider>` calls), the orchestration provisioning integration,
> and which engine-specific features are available.

The architecture fixes the **persistence seam**, not the **engine**. Whatever the
user picks must satisfy these contracts; everything else in the document holds
unchanged:

1. **Relational, accessed through the chosen data-access layer** (§3; reference
   stack: EF Core), with **one engine + one provider for the whole app** —
   never mix engines.
2. **One physical database**; every module's data context uses the **same
   connection string** (the orchestrator injects it — reference stack: Aspire's
   `WithReference(db)` as `<app>`).
3. **Logical isolation per module** — a real schema where the provider supports
   it (`modelBuilder.HasDefaultSchema("<schema>")`, R7), or the provider's
   nearest equivalent (see the options table).
4. **Per-module migrations**, each module's migrations-history table in
   its own schema/namespace (R9).
5. **Migrations applied at startup; no schema auto-creation shortcut** (R10;
   reference stack: `Database.Migrate()`, never `EnsureCreated`).

Options — pick one **with the user**; the rest of the app is unchanged. (The
provider/integration columns name the reference stack's packages — a non-.NET
stack uses its own driver + migrations tool for the same engine.)

| Option | EF Core provider | Aspire integration | Module isolation | Notes |
|---|---|---|---|---|
| **PostgreSQL** | `Npgsql.EntityFrameworkCore.PostgreSQL` (`UseNpgsql`) | `AddPostgres` (`postgres:17-alpine`) + `WithPgAdmin` | real schema per module (`HasDefaultSchema`) | Trigram search (`pg_trgm`), `ILIKE`, Row-Level Security available. **The worked examples and code samples in this document are written for Postgres** — treat `UseNpgsql` / `postgres:17-alpine` / `pg_trgm` as illustrative and substitute your provider's equivalents. |
| **SQL Server** | `Microsoft.EntityFrameworkCore.SqlServer` (`UseSqlServer`) | `AddSqlServer` | real schema per module (`HasDefaultSchema`) | Azure SQL / on-prem SQL Server. Map Postgres-specific features (`ILIKE` → `LIKE` + case-insensitive collation, RLS → SQL Server Row-Level Security, `pg_trgm` → full-text search / `LIKE`). |
| **Other — the user names it** | the matching EF Core provider (e.g. Pomelo MySQL, SQLite) | the matching Aspire integration if one exists | a real schema, or the provider's nearest equivalent | **Confirm how module isolation maps before building.** E.g. MySQL/MariaDB treat a "schema" as a database; SQLite (single-file, single-user) has no schemas, so isolate by table-name prefix and weigh it only for small/single-user deployments. Agree the mapping with the user and note it in `docs/ROADMAP.md`. |

> **Choose before Phase 1** and record it in `docs/ROADMAP.md`, alongside the
> auth decision (§4.6). If a later need exposes a gap in the chosen engine (e.g.
> a feature only Postgres offers), surface it to the user — don't silently switch
> engines or add a second one.

### 8.2 Migrations

Per-module migrations (R9), each owning its own history table (reference-stack
command shown; use the chosen migrations tool's equivalent):

```bash
dotnet ef migrations add Initial \
  --project src/modules/<App>.Modules.<Feature> \
  --context <Feature>DbContext
```

- Migrations run at Host startup for every module data context (R10).
- Rows carry the key(s) their **access boundary** needs (`UserId` for per-user
  data; a workspace/tenant id for shared data); **every query filters by that
  boundary** — never returns the whole table (§6.3).
- **Phase-2 hardening (not v1):** enable provider-level row security where the
  engine supports it (e.g. Postgres Row-Level Security) on per-user tables and
  set `app.user_id` from middleware so the DB refuses queries that forget
  `WHERE UserId = @me`.

### 8.3 Dev data seeding

Migrations create **schema**; how a fresh dev environment gets **usable data**
is a deliberate, explicit mechanism — never ad-hoc inserts nobody can
reproduce:

- **A dev-only, idempotent seeder** — an explicit entry point (a `seed` CLI
  command beside the admin CLI in §5, or an orchestrator-triggered dev step),
  safe to re-run, and **impossible to run in production** (environment-guarded,
  fail-fast). It seeds through the modules' normal write paths where practical,
  so constraints, events, and read models behave as in real use.
- **Module-scoped, like everything else.** Each module seeds only its **own
  schema** (R8 applies to seeding too); cross-module effects arrive the normal
  way — published events building the consumers' read models.
- **Baseline reference data a module owns** (R28(b)) may ship in a migration
  when the schema is genuinely unusable without it — sparingly, and never for
  R28(a) behavioural values (constants + CHECK, no rows) or R28(c)
  provider-owned lists (the `Fake` seam supplies those offline, §6.6).
- **Tests never depend on the dev seed.** Integration tests get a clean
  template-cloned database and create their own rows; the e2e harness seeds
  per-spec through the API/fixtures (§12.5). The dev seed exists for humans
  exploring the running app, not as shared test state.

---

## 9. Local-Dev Orchestration

The orchestrator is a §3 stack decision, but the contract is fixed: **one
command boots the whole stack** — database, API, and client — with the
connection string injected (never hand-copied), and **exactly one orchestrator
owns dev**. The reference stack uses **.NET Aspire** (and therefore bans Docker
Compose beside it); a non-.NET stack uses its own equivalent (e.g. a compose
profile, Tilt, or a process manager) — chosen with the user, and still only one.
The sections below show the Aspire reference implementation.

### 9.1 AppHost

> The AppHost provisions **the database engine you chose with the user (§8)**.
> The example below uses Postgres (`AddPostgres` + `WithPgAdmin` +
> `postgres:17-alpine`); for SQL Server swap in `AddSqlServer`, etc. The rest of
> the wiring — `AddDatabase`, `WithReference(db)`, `WaitFor(db)`, and the `api` /
> `web` projects — is identical regardless of engine.
>
> **Let Aspire proxy the API.** Do **not** pin `IsProxied = false` (or a fixed
> port) on the `api` project — that breaks it behind Aspire's dev proxy. A fixed,
> unproxied port is only needed for the **Vite** dev server, which the SPA and
> CORS/redirects must reach at a stable origin.

```csharp
var builder = DistributedApplication.CreateBuilder(args);

var pgPassword = builder.AddParameter("pg-password", secret: true);

var postgres = builder
    .AddPostgres("<app>-db", password: pgPassword, port: 5432)
    .WithDataVolume("<app>-pgdata")
    .WithPgAdmin();

var db = postgres.AddDatabase("<app>");

var api = builder
    .AddProject<Projects.<App>_Host>("api")     // API endpoint is Aspire-managed (proxied) —
    .WithReference(db)                           //   do NOT force a fixed port / IsProxied=false here
    .WaitFor(db);

builder.AddViteApp("web", "../<App>.Web")
    .WithEndpoint("http", e => { e.Port = 3000; e.IsProxied = false; })
    .WithReference(api)
    .WaitFor(api);

builder.Build().Run();
```

### 9.2 ServiceDefaults

Provides `AddServiceDefaults()` (OpenTelemetry traces/metrics/logs, service
discovery, standard HTTP resilience) and `MapDefaultEndpoints()` (`/health` +
`/alive`, dev-only). Modules stay **Aspire-agnostic** — they read the connection
string from `IConfiguration.GetConnectionString("<app>")`; only the Host calls
`AddServiceDefaults()`.

**Dev entry point:** `dotnet run --project src/aspire/<App>.AppHost` launches the chosen
database + API + Vite web in one terminal and opens the Aspire dashboard.

---

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

---

## 11. Design System Contract (design-first)

**The design comes first, in Claude Design.** Before any UI is built, the
visual/interaction design is produced **upstream in Claude Design** (Anthropic's
prompt-to-prototype tool). When it's ready you **hand it off**: in Claude Design,
*Export → Handoff to Claude Code* gives you (a) a **copied prompt/command** and
(b) a downloadable **handoff bundle (zip)**. That bundle — not a hand-written
spec — is the **design input** to this app. The build does **not** invent a
look; it **realises** the handed-off design from the bundle's structured
metadata (it is *not* reverse-engineering a screenshot).

### 11.1 What the handoff bundle contains

A Claude Design → Claude Code handoff bundle is **machine-readable**, not just
pictures. Expect:

- **Component structure spec** — the components and their hierarchy as a
  structured spec (not pixels).
- **Design tokens actually used on the canvas** — colors, type, spacing, radii,
  elevation as token values.
- **Layout hierarchy + responsive breakpoints + interaction states** (hover,
  focus, active, disabled, empty, loading, error).
- **Referenced assets** — logos, icons, images.
- **Design files** — HTML/CSS/JS the tool produced.
- **Per-state screenshots** — the visual ground truth for each state.
- **A README** — naming the target stack and conventions to follow.
- **Design conversation history / rationale** — *why* decisions were made, so
  intent (not just appearance) carries through.

> Claude Design can also **import this repo** (GitHub or local dir) so it applies
> the app's existing design system and you can reference components by name. Once
> the app exists, prefer this loop: design *with* the codebase's tokens so the
> next handoff stays consistent rather than divergent.

### 11.2 The pipeline (ingest the bundle → build)

```
Claude Design (upstream)  ──Export→Handoff──►  bundle.zip + copied prompt  ──ingest──►  token-home tokens  ──build──►  UI on the chosen client stack
  (prototype: screens,        (component spec, tokens,                       (single token home;             (components derive
   states, tokens,             breakpoints, states, assets,                   stack reconciled)               strictly from tokens)
   rationale)                  screenshots, README, rationale)
```

1. **Receive & commit the bundle.** Unzip the handoff under
   `docs/design-handoff/<date>-<surface>/` and commit it — bundle + the copied
   prompt + screenshots are the traceable design source of record.
2. **Reconcile the target stack.** The bundle's README/design files may target a
   different stack (often plain HTML/CSS or Next.js). **The app's client stack
   is the one decided with the user (§3)** — the bundle does not get to change
   it. Translate, don't adopt — map the bundle into the chosen stack; never
   swap the stack to match the bundle (a stack change is a user decision, not a
   design-handoff side effect). State the mapping you used in the
   design-handoff folder's notes.
3. **Tokenise → the single token home.** Lift the bundle's **design tokens**
   into the client's one token home **once** (reference stack:
   `src/<App>.Web/src/styles/globals.css` via Tailwind `@theme inline`,
   hex/size direct) and map the component library's variables (reference stack:
   shadcn's `--color-*` / `--radius`) onto them. The token home is the
   canonical machine-readable encoding — **never re-list hexes in component
   code or in this blueprint.**
4. **Build from tokens + spec.** Realise the component-structure spec on the
   chosen component library's primitives (reference stack: shadcn/Radix),
   deriving every value from the tokens, and implement **every interaction
   state and breakpoint** the bundle specifies. Use the per-state screenshots
   as the acceptance reference and the rationale to resolve judgement calls.
5. **(Optional) `DESIGN.md` as a distilled human contract.** You *may* distill
   the bundle into a short `DESIGN.md` (north star + token map + component
   recipes + Do/Don't) as a readable in-repo summary. It is **not required** and
   it is **not** the source of truth — the committed bundle + `globals.css` are.
   If you keep one, it must be *derived from* the bundle, never a parallel
   hand-maintained truth that can drift.

### 11.3 Structural rules (hold regardless of the visual design)

These are **mechanism**, not aesthetics — they apply to *any* design the
upstream step produces:

- **Single token home.** Tokens live **once** in the client's token home
  (reference stack: `globals.css`). A rename/retune happens in one place and
  propagates. The committed handoff bundle is the upstream source; the token
  home is the in-app canonical encoding.
- **Derive, don't duplicate.** Components, the shadcn variable map, any optional
  `DESIGN.md`, and client TS types all derive from the canonical token/spec — no
  parallel hand-kept copies.
- **Realise, don't reinterpret.** Build the handed-off design faithfully,
  including its interaction states and breakpoints. If a state or edge case
  isn't in the bundle (spec, screenshots, or rationale), **ask — don't invent**
  a look (R26).
- **Respect the chosen primitives.** The component library chosen in §3
  (reference stack: shadcn/ui + Radix) is the substrate; retune it to the
  tokens rather than fighting it or hand-rolling parallel widgets. Where a
  treatment isn't a stock variant (e.g. a signature CTA), add a **named custom
  variant** wired to a token, not one-off inline styles.
- **Theme policy comes from the bundle.** Dark-only, light-only, or themeable —
  and whether there's a switcher — is whatever the handoff specifies; structure
  the token layer to match (single theme vs. light/dark token sets).

### 11.4 Worked example — an illustrative token system

> Illustrative only — one possible resolved design system, to show the *shape* a
> distilled token system takes. **Your tokens come from your Claude Design
> handoff bundle, not from here.**

- **Dark-only, "blueprint at midnight":** deep cool navy, **never pure black or
  pure grey** — cool-tinted surface tokens; no theme switcher.
- **No-Line Rule:** never use 1px solid borders for sectioning;
  `--color-border` is `transparent`. Define boundaries with **surface tonal
  shifts** (higher tone = closer to viewer). Dashed affordances on genuine drop
  targets are the only sanctioned exception.
- **No dividers** in cards/lists — separate with vertical whitespace and tonal
  hover.
- **Surface hierarchy:** overlay base `surface-container-lowest` → `surface`
  (app bg) → `surface-container-low` → `surface-container` (cards) →
  `surface-container-high` (overlays/inputs) → `surface-container-highest`.
- **Radius hierarchy:** `sm` (0.125rem) for data cells; `xl` (0.75rem) for
  dashboard containers. Don't default everything to 0.25rem.
- **Typography:** a display/headline family (Manrope) + a body/label family
  (Inter) + a mono family (JetBrains Mono) for identifiers/numbers/`kbd` hints.
  **Tabular lining for all numbers.**
- **Primary CTAs:** a signature 135° gradient as a custom `variant="gradient"`
  (shadcn's default solid fill doesn't cover it). Cards are transparent-bordered
  surfaces that lift via background color only. Overlays sit on
  `--color-popover` with a deep diffuse shadow.
- **shadcn ↔ tokens:** `background`=surface, `card`=surface-container,
  `popover`=surface-container-high, `primary`=accent,
  `secondary`=surface-container-highest, `muted`=surface-container-low.

---

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

---

## 13. Cross-cutting conventions

- **Errors:** return one consistent JSON envelope (e.g. an `ErrorResponse`
  record → `{ "error": "..." }`) with the right status code (reference stack:
  `Results.BadRequest/NotFound/Conflict/Json`). Don't invent a new error shape
  per endpoint.
- **Logging:** use the framework's structured logger (reference stack:
  `ILogger<T>`); **never** raw stdout prints (`Console.WriteLine` & kin) —
  telemetry and the dev dashboard depend on structured logs.
- **Single source of truth:** derive shared definitions from one canonical home;
  a rename there should be a compile/CI break, never a silent runtime drop.
  Never hand-maintain a parallel list that duplicates the canonical.
- **Coupled releases:** when a change alters a contract shared by producer and
  consumer (a `Contracts/` event between modules, or an API response the SPA
  reads), change **both sides together** — don't add a back-compat shim for a
  wire change you control on both ends.
- **Single concern:** every file/class/method does one thing; a module owns one
  feature; a DbContext owns one schema; an endpoint maps request→result and
  delegates the work. Split "manager/helper/utils" grab-bags.
- **Reuse before rewrite — but isolation wins:** extract a shared helper the
  second time logic appears; shared **code** belongs in `Core` only when it's
  genuine infrastructure. When tempted to reuse another module's type directly,
  **subscribe to its events and keep a local read model instead.**
- **Right home:** new code goes in the smallest scope that owns the concern —
  module-internal first, `Core` only when every module truly needs it.
- **Bounded results:** list/search endpoints return a **paged** result with a
  single named default + max page size (a `PagedResult<T>` + a `MaxPageSize`
  constant in `Core`, §4.7) — never an unbounded `ToListAsync()` over a table that
  grows. Cap it from the start; an unbounded query is a latent scalability bug.
- **Agent instructions derive from this blueprint:** `CLAUDE.md` / `AGENTS.md`
  (§2) is the distilled operating contract for agents. When a change to this
  blueprint — or a §16 adoption decision — alters a rule the distillation
  states, update the distillation **in the same change**; a stale
  agent-instruction file misleads every future session. The blueprint is the
  source of truth; the distillation never invents rules of its own.
- **Keep it lean:** delete dead code, unused params, speculative abstractions.

### 13.1 Significant-change protocol

A change is **significant** if it touches: a shared event contract, a
schema/migration, auth or the query **access boundary** (§6.3), a new/removed
endpoint, the event-subscription wiring, or anything another module's read model
observes. For a significant change:

- **Capture the impact analysis in the change's design/spec doc** — a short
  `docs/specs/<YYYY-MM-DD>-<topic>.md` committed with the implementation: a risk
  rating (`low`/`medium`/`high`/`critical`) + one-line why, surface area, data /
  migration / sync impact, backwards compatibility, regression risk, and a
  rollback plan. Focus on cross-module event flows and anything a user would
  notice breaking; don't duplicate unit-test coverage.
- **Prove the behaviour with the tests the change already owes** (R23/R24): the
  integration round-trip over the affected event seam / read model, and the
  e2e journey for any user-facing slice. Those executable checks are the
  regression net — not a hand-run markdown checklist.
- **Update the affected `docs/modules/<module>.md`** in the same change.

> (This supersedes an earlier per-change `docs/smoke-tests/` manual-checklist
> rule that was never adopted: impact analysis now lives in the spec doc, and the
> regression net is the integration + e2e suite.)

### 13.2 Anti-patterns to reject on sight

(Reference-stack names in parentheses — the *category* is banned in every stack.)

- Mediator / message-bus frameworks or any external broker (MediatR /
  MassTransit / Wolverine / Rebus & kin).
- Heavyweight MVC/controller layers and attribute routing.
- Object-mapping frameworks (AutoMapper & kin).
- Module → module project references. Ever.
- A shared data-access context; cross-module or cross-schema SQL/joins.
- Business service interfaces in `Core/Services`.
- Business logic in the composition root beyond discovery, hub mapping, CORS,
  health, SPA fallback, and startup migrations.
- Static state in modules (except the atomic one-time-subscription guard, R16).
- The push transport's server API touched outside the Notifications module
  (`IHubContext<...>`).
- Schema auto-creation instead of migrations (`EnsureCreated`); missing
  migrations.
- Mixing more than one persistence engine in a single app, or standing up a
  data context before the backend was confirmed with the user (§8).
- A dependency version pinned outside the central version home (a `Version` on
  a `PackageReference` under CPM).
- **Assuming any §3 stack decision instead of asking the user.**

### 13.3 Git / PR safety

- Develop on the designated feature branch; branch off `main` before committing
  if you're on it.
- **Don't push or open a PR without an explicit ask.** "Do X in a PR" describes
  the shape of the work, not authorisation to publish — stop after the commit
  and wait.

### 13.4 Security & secrets baseline (R35)

The R35 rules, with their reference-stack realisations — each is
stack-agnostic; substitute the chosen stack's equivalents:

- **Secrets never touch the repo.** Dev secrets come from the orchestrator /
  local secret store (reference stack: Aspire secret parameters +
  `dotnet user-secrets`; `.env` files are git-ignored); production secrets come
  from the platform's secret store or, better, are **eliminated** by managed
  identity (the §5 hardening note's token-based DB credential, and the §6.6
  seams picking managed identity inside the real adapter). If a secret leaks
  into history, **rotate it** — deleting the commit is not remediation. Config
  committed to the repo holds shapes and non-secret defaults only.
- **Authenticated by default.** Every endpoint gets the framework's
  require-authorization gate as the baseline (reference stack:
  `RequireAuthorization()`, including the mapped hub); a public endpoint is an
  explicit decision with a stated reason. Authorization beyond authentication
  (roles/policies) lives in named policy constants (R27), not inline strings.
- **Server-side validation at the boundary.** Every request DTO is validated in
  the endpoint before the handler runs — type-safe binding plus explicit domain
  checks (lengths, ranges, allowed values from the constants home). Client
  validation (§10's schema layer) improves UX; it is never the enforcement
  point. Invalid input returns the standard error envelope (§13), leaking no
  internals.
- **Headers + CORS.** Serve the standard security headers (HSTS behind TLS,
  `X-Content-Type-Options: nosniff`, a frame-ancestors/CSP appropriate to the
  SPA); CORS allows exactly the known client origin(s). Production **fails
  fast** on a wildcard origin or host (§5).
- **Rate limiting.** Abuse-prone public endpoints — login above all — get the
  framework's rate limiter (reference stack: ASP.NET Core `AddRateLimiter`)
  with named-constant limits (R27).
- **Dependencies.** The R33(d) vulnerability audit is the standing gate; treat
  a new dependency as an attack-surface decision (§3's "add libraries
  reluctantly").

---

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
persistence via a DB read-back.

**Phase 5+ — Widen.**
More domain modules, background jobs (the stack's hosted-worker primitive + a
job runner with bounded parallelism), richer Notifications relays, analytics —
each shipping its own unit + integration + e2e coverage.

**Later phases (scope when needed).**
Installable PWA (manifest); engine-level row-security hardening (e.g. Postgres
RLS, §8); any LLM/AI features behind an
interface (e.g. `ISuggester`) so implementations slot into a chain. *(E2e is
not here — it's established in Phase 2 and extended every phase, §12.)*

---

## 15. Definition of Done (per change)

> In an existing app being aligned (§16), "applicable" below means: within the
> **adopted** areas recorded in `docs/ROADMAP.md` — a declined area's rules do
> not bind, and its deviations are not findings.

- [ ] Obeys every applicable rule in the [Rules Digest](#1-rules-digest-read-first).
- [ ] No module→module reference; no cross-schema access; events + local read
      models for any cross-module data.
- [ ] DTOs are plain immutable records; endpoints use the framework's
      lightweight routing under `/api/<feature>/...`; every query is scoped to
      its access boundary (per-user, or per-workspace/tenant/role where the
      domain requires it — §6.3), never the whole table.
- [ ] Coverage extended across the layers the change touches (R23, §12): unit
      for logic, integration for data-layer/event seams, **e2e for any
      user-facing journey** — via the owning module's regression runbook, each mutating case
      verifying persistence through a lane (§12.9) — failure/edge/isolation paths
      included, not just the happy path.
- [ ] Data-layer changes ship a round-trip integration test asserting every
      affected field by name (R24), plus access-boundary isolation where relevant.
- [ ] The repo's canonical gates are green — server lint/analysis +
      build/type-check + tests; client lint + build + tests; the **duplication
      and dead-code gates** where code was added or removed, and the
      **dependency vulnerability audit** where dependencies changed
      (R33/§12.10); the
      **targeted per-module runs for every modified module** — its integration
      project + its e2e harness smoke/targeted tier (R25/R34) — with the full
      harness left to the user's schedule (§12.6); output **read**, not
      assumed (R25). The CI pipeline steps for the touched layers are green
      (§12.7).
- [ ] UI faithfully realises the committed Claude Design handoff bundle
      (component spec, interaction states, breakpoints, screenshots); styles
      derive from the single token home (no duplicated hexes/sizes); the client
      stack chosen with the user (§3) was kept; unspecified states were asked
      about, not invented (R26).
- [ ] Every §3 stack decision the change depended on — including the
      persistence backend (§8) and auth mechanism (§4.6) — was **confirmed
      with the user**, not assumed, and recorded in `docs/ROADMAP.md`.
- [ ] Significant change → impact analysis captured in the change's
      `docs/specs/<date>-<topic>.md` (§13.1); the affected
      `docs/modules/<module>.md` and `docs/ROADMAP.md` updated.
- [ ] No push / PR unless explicitly asked.

---

## 16. Aligning an existing project (selective adoption)

An existing application does **not** need to align to everything in this
blueprint. For an existing codebase the blueprint is a **menu**: the value of
some parts (the testing strategy, the static gates) can be had without touching
the app's architecture at all; other parts (module isolation, events + read
models) are multi-week re-architecture projects. Which parts are worth it is
**the user's decision, made per part** — never the agent's.

Three hard rules govern the whole process:

- **Audit first, change nothing.** The first deliverable is a gap report, not a
  refactor. Do not "fix" deviations found along the way while auditing.
- **Adopt only what the user picked.** A deviation from an un-adopted part is
  **not a defect** — don't flag it in reviews, don't drift-fix it in passing.
- **The stack is never an alignment target.** This blueprint is stack-agnostic
  (§3); "align" never means migrating the app to the reference stack. The
  existing stack fills the seams; the audit maps blueprint concepts onto its
  idioms (its module notion, its migrations tool, its test runner).

### 16.1 Step 1 — the alignment review (audit)

Review the codebase against the [Rules Digest](#1-rules-digest-read-first) and
the structural expectations (§2 layout shape, §12 test structure, §12.10 gates,
§13 conventions). Produce a **gap report** committed as
`docs/specs/<date>-blueprint-alignment.md` (the existing spec-doc home, §13.1),
with one row per adoption area:

| Area (rules) | Current state | Gap | Blast radius | Effort | Depends on |
|---|---|---|---|---|---|

- **Record, don't judge.** "No integration tests; unit tests use an in-memory
  DB substitute (R32 gap)" — not "the tests are bad".
- **Blast radius** is the key column: *standalone* (touches no runtime
  behaviour), *contained* (touches code but not architecture), or
  *architectural* (changes how the app is put together). It drives the
  conversation in Step 2.
- Note **existing strengths** that already align — adopted-by-accident areas
  cost nothing to formalise and anchor the rest.

### 16.2 Step 2 — the user picks the targets

Present the gap report grouped by blast radius and **ask the user what to align
to** — as a per-area choice, with a recommendation, never as a bundle. The
typical menu, cheapest first:

| Tier | Adoption areas | Why this tier |
|---|---|---|
| **Standalone** — adoptable without affecting the app's architecture | **Verification & testing strategy** (§12: three suites per module, real engine in containers, runbook-driven e2e — R23/R24/R32); **code-change validation gates** (R33/§12.10: lint, duplication, dead code, dependency vulnerabilities); **CI pipeline shape** (R34/§12.7: individual fail-fast steps, harness out of CI, targeted per-module validation); **code-quality rules** (R27 magic values, R29 reuse, R30 dead code); **docs discipline** (module docs, ROADMAP, spec docs, agent-instructions sync §13); **central dependency-version management** (§3). | Pure additions or local cleanups. The testing strategy in particular is the highest-value first pick: it builds the safety net every later adoption needs. |
| **Contained** — real code changes, architecture untouched | **Security baseline** (R35/§13.4: secrets out of the repo, auth-by-default, server-side validation, headers/CORS, rate limiting); **constrained-value placement** (R28); **config-switched external-service seams** (§6.6); **bounded/paged queries + one error envelope** (§13); **no-poll rules** (R31 server, §10 client — needs a push channel to exist or be added); **single design-token home** (§11 structural rules). | Refactors with local blast radius; each is a normal change shipping its own tests (per whatever of §12 was adopted). The security baseline is usually the highest-priority pick in this tier. |
| **Architectural** — re-architecture projects, individually scoped | **Module isolation** (R1–R6); **schema-per-module + per-module migrations** (R7–R11); **events + local read models** replacing direct cross-module calls (R3, R12–R16); **lightweight endpoints** replacing a heavyweight MVC layer (R17); **single push channel owned by Notifications** (R21/R22). | Each is a project with its own plan, sequencing, and data-migration story — never a drive-by. Adopt standalone-tier items first so these land on a safety net. |

Record the outcome in `docs/ROADMAP.md`: **adopted** areas (now binding — they
join the Definition of Done for every future change), **declined** areas (a
standing decision: future agents must not re-litigate or quietly "fix" them),
and **deferred** areas (revisit trigger noted). The gap report plus this
register replaces Phase-by-Phase build order as the existing app's roadmap.

### 16.3 Step 3 — align incrementally

- **One area at a time**, in dependency order (the *Depends on* column): the
  testing strategy before anything that needs its safety net; static gates
  early (with a baseline that only burns down, §12.10); architectural areas
  last, one module/seam at a time (strangler-style: build the new seam, move
  one consumer, verify, repeat — never a big-bang rewrite).
- **Every alignment change is a normal change**: it ships the tests, docs, and
  gate-green proof the *adopted* rules require (R23–R25, §13.1 for anything
  significant), and lands as reviewable increments.
- **Transitional states are allowed but tracked.** Mid-adoption, an old and a
  new pattern may coexist (e.g. one module extracted, five still coupled) —
  record the transition and its end state in `docs/ROADMAP.md`, and never let a
  *new* feature use the old pattern once its replacement is adopted.
- **Partial alignment is a stable end state, not a failure.** An app that
  adopts only the testing strategy and the static gates is aligned — to
  exactly what its user chose.

---

*This blueprint is the architecture contract; the committed Claude Design
handoff bundle (§11) is the design contract. When a decision isn't covered by
either, ask before inventing — and when you extend the architecture, update this
document so it stays the single source of truth.*
