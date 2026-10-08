> **Modular Monolith Blueprint — §1.** [Index](README.md) · [Rules Digest](01-rules-digest.md)

## 1. Rules Digest (read first)

These are the rules an agent must keep loaded at all times. They override
convenience. `[STRICT]` marks a rule that is stronger than typical guidance and
is the most common source of architecture drift.

### Architecture

- **R1** `[STRICT]` A module references **only** `<App>.Core`. **Never** another
  `<App>.Modules.*`. No exceptions.
- **R2** `<App>.Core` references **nothing** in `<App>.Modules.*`.
- **R3** `[STRICT]` Cross-module communication happens **only** via events on the in-process bus. If module B needs data from module A, B subscribes to A's event and maintains its **own local read model** in B's schema. The one exception is a **read-only aggregator** (an assistant, a search or an export across the whole app): it stores nothing, never writes, reads other modules **only through the app's own HTTP API as the calling user**, and is recorded as a deliberate deviation (§7.5).
- **R4** Every module implements the shared **module contract** (reference
  stack: `IModule` — `Name`, `RegisterServices`, `MapEndpoints`) and is
  **mechanically constructible** by the composition machinery: no constructor
  arguments, no special setup (reference stack: `sealed`, parameterless ctor).
- **R5** `[STRICT]` Modules are **discovered automatically** at startup: reflection or assembly scan, a convention-based import, or a generated registry, whatever the chosen stack supports. The composition root contains **no hand-wiring** of any specific module; the only permitted exceptions are mapping the realtime hub (it needs the concrete type) and the admin CLI branch (R6). Runtime discovery does not reach the build: build files, container images and CI can still list modules by hand (reference stack: a Dockerfile restore stage that copies each project file, a CI shard list of test projects), so **every such list has a mechanical guard** that fails when a module is missing from it (§6.8).
- **R6** The Host may reference module projects/packages **only** so the build ships them alongside the host (reference stack: `<ProjectReference>` for the DLL copy). **No module imports** in Host code except the one hub line and the admin CLI branch (§5), which only parses arguments and calls the `Auth` module's own provisioning functions.

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
- **R9** Each module owns its **own migrations**; its migrations-history table/ledger lives in its **own schema** (reference stack: `__EFMigrationsHistory` per schema). Retiring a module is the one time its migrations remove its own data: a **teardown migration** that drops everything in its schema except the history ledger (the tool writes its record there after the migration runs) ships **one release before the module's code is deleted** (§6.9), so every environment has run it while the code still exists.
- **R10** Migrations from day one, applied automatically at startup (reference
  stack: `Database.Migrate()`). **No schema auto-creation shortcut** (reference
  stack: `EnsureCreated`), **no hand-written SQL fix-ups** in the composition
  root.
- **R11** `[STRICT]` **One relational engine and one data-access layer for the whole app, chosen with the user (§8)**: Postgres, SQL Server, or another the user names; never mix engines. Wire the matching driver/provider and orchestration integration. **Pin the engine's container image to an exact tag** (never a floating major or the orchestrator's default, which can move to a version that refuses the existing data directory) and **use that same image in dev, tests and deploy**. **Never change image family against an existing data volume** (for example glibc to musl): the two sort text differently, so indexes built by one are corrupt under the other; recreate the volume instead. The provider-specific snippets in this document (`UseNpgsql`, a pinned `postgres` image, `pg_trgm`, `ILIKE`) are **illustrative**; substitute your chosen engine's equivalents.

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
- **R15** A bus handler resolves scoped services via a **fresh DI/composition scope per event**; a durable handler uses the data context and service provider the outbox hands it and never opens a scope of its own (§4.8). The bus **retries** each handler a bounded number of times and then logs loudly (it **never silently swallows**), so one bad subscriber can't break the publisher; cooperative cancellation (real shutdown) is re-thrown, not retried. **An event that changes another module's stored data is saved through the transactional outbox** (§4.8) in the same transaction as the change it describes, so a persistent fault parks the delivery where someone can see and retry it instead of dropping it; a direct publish is only for traffic that is safe to lose: pushes, progress, sign-in revocations (§7.2), and replay requests and their answers (§4.2, §4.9). **Every handler is idempotent** (it upserts or overwrites by key) **or dedupes through an inbox row** written in the same transaction as its change, because a retry after a partial success otherwise applies the change twice. **Handlers never rely on the order modules run in**, which is an accident of their names: a push or step that must follow another module's write is driven by an event that module raises after its own commit.
- **R16** Subscriptions are wired **once per bus, at endpoint-mapping time** (the service provider exists by then). The once-only guard is **tied to the bus instance** (reference stack: a `ConditionalWeakTable` keyed by the bus), never a single process-wide flag: its job is to stop one bus being subscribed twice, while every new host still subscribes its own bus. A static flag lets only the first host in a process subscribe, so every later integration-test host gets a bus nobody listens to, and its event-driven tests fail as if the domain were broken.

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
- **R20** `[STRICT]` **No business service interfaces** in `Core` (no `I<Feature>Service`). `Core` may define only **infrastructure** abstractions modules need: `IEventBus`, `ICurrentUser`, the outbox's seams (§4.8: its durable subscriptions, writer, admin and inspector) and the other infrastructure of §4.7. Cross-module business needs go through events. The one kind of domain rule `Core` may hold is a **pure function over shared contract types** (no state, no I/O, no interface) that several modules must compute the same way (§4.7), because a copy per module lets the screens contradict each other.

### Realtime push

- **R21** **One realtime push channel** for the whole app, a WebSocket/SSE hub in whatever transport was chosen in §3 (reference stack: SignalR), owned by the `Notifications` module (reference stack: a `Hub` subclass that joins each connection to its owner's push group and holds no business logic, §7.1). The Host maps it explicitly, the one place outside the admin CLI branch (R6) where Host references a module type.
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
- **R25** Before claiming done, run **and read the output of** the repo's canonical gates on both sides: server lint/analysis + build/type-check then tests; client lint, then build/type-check, then tests (reference stack: `dotnet build` with analyzers + warnings-as-errors / `dotnet test`; `npm run lint` / `npm run build` / `npx vitest run`, the one-shot form, because a bare `vitest` behind `npm run test` is watch mode whenever the terminal looks interactive, and never exits). Add the duplication and dead-code gates (R33/§12.10) when the change adds or removes code, and the dependency vulnerability audit when dependencies changed. The build is the project-wide type-check and **lint is a separate blocking gate on both sides** (it runs **before** build in CI); a green test run alone is not enough. For the **modules the change touched**, additionally run **their integration tests and the targeted tier of their e2e harness** (§12.9); the per-module test projects (§12.3) make this a straight project/filter selection. This targeted run is part of change validation precisely because CI excludes the harness (R34).

### Design

- **R26** The design input is a **Claude Design → Claude Code handoff bundle** (zip + copied prompt), and it is required **per surface, not per app**: **every new screen, new form factor (phone, tablet) or new interactive surface gets its own export before implementation starts**, committed under `docs/design-handoff/<date>-<surface>/` (design-first; §11). Realise each bundle faithfully, including its interaction states and breakpoints; don't reinterpret or "improve" the design while coding. Lift its tokens into the client's **single token home** (§11; reference stack: `globals.css`) **once**; every component derives from them (never hard-code a hex/size that duplicates a token). Keep the client stack the user chose (§3): translate the bundle into it, don't swap the stack to match the bundle. For a decision too small to need an export, **ask, don't invent**, and record the answer in the repo (a token in the token home, otherwise a note in that surface's handoff folder) so the next export, made with the repo imported, picks it up (§11.3). `DESIGN.md` is optional and, if kept, is a *derived* summary, never the source of truth.

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
- **R29** **Reuse first; no duplication.** Extract shared logic/data instead of copying it, *unless* reuse would violate another rule (e.g. R1/R3 module isolation, or R20's "no business interfaces / keep Core lean": don't couple Core to a tech just to DRY a few lines). Prefer the structural fix (shared helper/constant) over repetition; when a rule blocks reuse, isolate the small idiom and note why. The client keeps a "one way to do each job" register in its UI conventions document (§11.3), because a duplication gate cannot see a second component that does the same job differently.
- **R30** **Delete dead code.** No unused types/members, commented-out blocks, orphaned
  files, or unreachable branches. A deletion ships with its now-dead tests removed (R23).
  Leave the tree with less, not more.
- **R31** **Background jobs don't poll.** No background-worker busy-wait (`while + sleep(short interval)`) to find work or watch a flag. A worker waits on an in-process **queue that carries the work itself**, filled by the producer (a `Core` primitive, §4.7; reference stack: `IBackgroundWorkQueue<TWork>`, which carries the work item, closed over a module's own request type, §6.10), so "was I woken?" and "what for?" are one question and no second store can disagree with the signal. A timer only wakes a worker at a **due time already stored** (the earliest retry, the next run) or on a **genuine schedule** (a daily prune), never to go and look for work. A manual "run now" enqueues directly (persist a flag only as a restart backstop, checked once at startup). Each worker reports its state to Core's worker-status registry (§4.7), and its health is judged by **what it last reported**, never by how long ago, because a worker woken by a signal is rightly quiet for hours. In-process / single-host.
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
