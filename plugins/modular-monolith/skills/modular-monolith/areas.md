# The adoption areas

The blueprint's rules are R1–R35, but a repo never adopts a *rule* — it adopts an **area**: a cluster of rules that stand or fall together because they share a safety net, a toolchain, or a re-architecture project. Adopting R24 (data-layer round-trip tests) without R32 (real engine, no in-memory substitute) buys nothing; adopting R3 (events) without R7 (schema-per-module) is incoherent. The areas below are the units the register records and the units the user picks from.

Every rule R1–R35 belongs to exactly one area, so "which rules bind here?" always has an answer. The three tiers are the blueprint's own (§16.2), ordered by **blast radius** — that is the column that drives the conversation, not effort.

## Summary

| Area | Tier | Rules | Blueprint § | Depends on |
| --- | --- | --- | --- | --- |
| [`testing`](#testing) | Standalone | R23, R24, R25, R32 | §12.1–12.6, 12.8, 12.9 | — |
| [`static-gates`](#static-gates) | Standalone | R33 | §12.10 | — |
| [`ci-shape`](#ci-shape) | Standalone | R34 | §12.7 | `static-gates`, `testing` |
| [`code-quality`](#code-quality) | Standalone | R27, R29, R30 | §1 Code quality | `static-gates` (to mechanise) |
| [`docs`](#docs) | Standalone | — | §2, §13.1 | — |
| [`deps`](#deps) | Standalone | — | §3 | — |
| [`security`](#security) | Contained | R35 | §13.4 | — |
| [`constrained-values`](#constrained-values) | Contained | R28 | §1 Code quality | `code-quality` |
| [`seams`](#seams) | Contained | — | §6.6 | — |
| [`queries-errors`](#queries-errors) | Contained | — | §13 | — |
| [`no-poll`](#no-poll) | Contained | R31 | §4.7, §6.10, §10.2, §13 | `push-channel` (client half only) |
| [`design-tokens`](#design-tokens) | Contained | R26 | §11.2, §11.3 | None |
| [`module-isolation`](#module-isolation) | Architectural | R1, R2, R4, R5, R6, R20 | §2, §4.1, §5, §6.1, §6.8 | `testing` (safety net) |
| [`data-isolation`](#data-isolation) | Architectural | R7, R8, R9, R10, R11 | §8, §6.9 | `module-isolation` |
| [`events`](#events) | Architectural | R3, R12, R13, R14, R16 | §4.2, §4.3, §6.4, §6.5 | `module-isolation`, `data-isolation` |
| [`event-durability`](#event-durability) | Architectural | R15 | §4.2, §4.8, §4.9 | `events`, `data-isolation` |
| [`api-shape`](#api-shape) | Architectural | R17, R18, R19 | §6.3, §13 | — |
| [`push-channel`](#push-channel) | Architectural | R21, R22 | §7.1, §5 | `module-isolation`, `events` |

The two **optional practices** (§17) — end-user guides and hand-run smoke tests — are *not* areas. An app that declines both is fully aligned. Record them in the same register for the same standing force, but never present them inside the alignment menu.

---

## Standalone tier

Adoptable without touching the app's architecture. Pure additions or local cleanups.

### testing

**Verification & testing strategy** — the test pyramid, real-engine integration tests, and runbook-driven e2e.

**Rules:** R23 (every change ships tests, three suites), R24 (data-layer changes ship a round-trip integration test naming every field), R25 (run and read the gates before claiming done), R32 (both levels; in-memory database substitutes banned outright).

**Adopted means:** tests are part of done, not a follow-up. Three suites per module in three separate per-module projects (§12.3); anything needing a database uses the **real engine in a container**, never an in-memory stand-in; every user-facing journey has an e2e test generated 1:1 from a markdown regression runbook (§12.9); every data-layer change proves persistence by reading back each affected field by name.

**Audit by:** find the test projects and their layout — are suites separated per module, or is there one big test project? Grep for banned substitutes (EF InMemory, SQLite standing in for another engine, mongomock, and kin). Check whether any test touches a database at all. Look for an e2e directory and whether specs trace to runbooks. Check whether recent data-layer commits shipped integration tests.

> **Open the file before calling an R32 hit a gap.** "InMemory" appears in plenty of names that have nothing to do with a database — `AddInMemoryCollection` is ASP.NET *configuration*, an in-memory cache is not a database double, and a comment or a test name may be describing an in-memory substitute that was already **removed**. A repo that has done the R32 migration is exactly the repo whose files still say the word most often, so a naive grep reports its loudest false positive against the team that already did the work. Confirm the call site binds a data context to a substitute provider; if it doesn't, it isn't a finding.

**Why it is the usual first pick:** it builds the safety net every later adoption needs. Architectural areas without it are refactors performed blind.

### static-gates

**Code-change validation gates** — the four automated checks every change clears before CI goes green.

**Rules:** R33 — four gates on **both** server and client: (a) a linter at its strictest practical ruleset with warnings as errors, (b) a duplication detector, (c) a dead-code / unused-symbol detector, (d) a dependency vulnerability audit failing on high/critical.

**Adopted means:** all four run headlessly, block CI, and each has one canonical local command recorded in the repo docs. Findings are fixed, not suppressed — a suppression carries an inline justification and an expiry. Thresholds **ratchet in the improving direction only** (duplication down, coverage up).

**Audit by:** for each of the four, on each side: does a tool exist, is it wired to CI, does it actually fail the build? A linter present but non-blocking is a gap, not a pass. Check for a suppression pile — a long ignore list is the finding.

### ci-shape

**CI pipeline shape** — how the pipeline is arranged, and what deliberately stays out of it.

**Rules:** R34 — each gate is its **own visible step**, ordered cheapest first: static gates → builds → unit tests → integration tests. A failure stops the pipeline. The long e2e harness is **excluded from CI entirely**, covered instead by targeted per-module runs during change validation (R25) and full runs on the user's schedule.

**Adopted means:** no lumping several gates into one script step, because a lumped step hides which gate failed and pays for the expensive ones before the cheap ones have spoken.

**Audit by:** read the workflow files. Count steps. Is there one `./build.sh` doing everything? Is an e2e harness running on every PR (a gap in the other direction — it belongs out of CI)?

### code-quality

**Code-quality rules** — named constants, no duplication, no dead code.

**Rules:** R27 (no magic numbers or strings — named constants declared once, on both server and client), R29 (reuse first, no duplication, unless a rule blocks it), R30 (delete dead code).

**Adopted means:** any literal carrying meaning — a status, role, threshold, limit, header or claim name, event name, config key, schema name, cache key, size cap — is a named constant in one authoritative place. Cross-boundary values deliberately duplicated between client and server get a **mechanical sync check**, not a comment asking people to remember.

**Audit by:** grep for repeated string literals and numeric thresholds across files, especially any list of statuses or roles appearing in both client and server. This area is cheap to adopt in principle and expensive in practice — scope it honestly.

### docs

**Docs discipline** — which documents exist, and the rule that keeps them true.

**Rules:** none numbered; §2 and §13.1.

**Adopted means:** a doc per module explaining how it works, kept current **in the same commit** as the code it describes; `docs/ROADMAP.md` as the standing decision register; spec docs for significant changes under `docs/specs/`; and the agent-instructions file (CLAUDE.md) kept in sync with what the repo actually enforces.

**Audit by:** do module docs exist, and does their content match the code? Is there a ROADMAP? Does CLAUDE.md claim rules the repo does not actually enforce — a stale distillation is worse than none, because agents trust it.

### deps

**Central dependency-version management** — one place that decides every dependency's version.

**Rules:** none numbered; §3.

**Adopted means:** dependency versions are declared centrally rather than scattered per project, so an upgrade is one edit. Every dependency's licence has been read and allows how the app is used, including commercially if it is sold. A newly published advisory warns in the normal build and fails only the separate audit step (§3). An update bot keeps versions current: related packages grouped into one pull request, minor and patch updates merged automatically once CI is green, and major updates waiting for a person.

**Audit by:** are versions pinned in one place (a central props/lockfile/workspace catalogue), or repeated across every project file? List every direct dependency's licence and flag any that is not free for the app's use, including one whose newer major version changed its licence. Check whether the restore audit's level is set explicitly and whether an advisory can turn the normal build red. If an update bot runs, read its open pull requests and its dashboard for updates it found but could not open (a rate-limited or pull-request-limited queue): a queue full of pull requests stalled on red CI means the fix for that red is waiting behind them.

---

## Contained tier

Real code changes, architecture untouched. Each is a normal change shipping its own tests.

### security

**Security baseline** — the five controls every deployed app owes its users.

**Rules:** R35 — (a) no secrets in the repo ever, and a leaked secret is **rotated**, not just deleted from history; (b) endpoints authenticated by default, anonymous is the justified exception; (c) every request validated server-side at the endpoint boundary; (d) standard security headers served and CORS locked to known origins, with production refusing to start on a wildcard; (e) rate limiting on auth and abuse-prone public endpoints.

**Adopted means:** all five hold, and the fail-fast startup guards exist so a misconfigured production deployment does not boot.

**Audit by:** scan committed config and source for credentials. Check the default auth posture — is `[Authorize]`-equivalent the default with explicit opt-out, or is it opt-in? Look for a validation layer at the boundary. Check CORS and header middleware and whether production has a wildcard escape.

**Usually the highest-priority pick in this tier** — a leaked credential outranks a tidier codebase every time.

### constrained-values

**Constrained-value & reference-data placement** — where a status, a role, or a provider's list is allowed to live.

**Rules:** R28 — decide by what the field *is*: (a) behavioural state the code branches on → **code constants + a DB CHECK constraint, never a lookup table**; (b) genuine user/admin-managed reference data → its own table; (c) data owned by an external provider → fetched at runtime behind a config-switched seam, never copied into a table.

**Adopted means:** no status/role lookup tables that exist purely to be joined against and kept in sync with an enum.

**Audit by:** list the lookup tables. For each, ask whether the code branches on its values — if it does, it is case (a) in the wrong shape.

### seams

**Config-switched external-service seams** — external services behind an interface, so the app runs without them.

**Rules:** none numbered; §6.6.

**Adopted means:** every external service sits behind an interface with a config-switched implementation (`Off` / `Fake` / real), so the app runs locally and in tests without the real dependency; `Fake` is selected explicitly, never a fallback.

**Audit by:** find the external calls. Are any constructed directly in business code with no seam?

### queries-errors

**Bounded queries & one error envelope** — no unbounded list query, and one error shape across the API.

**Rules:** none numbered; §13.

**Adopted means:** list endpoints are paged or bounded — no unbounded "return everything" query — and failures come back in one consistent error shape rather than each endpoint inventing its own.

**Audit by:** find list endpoints without paging. Compare error responses across a few endpoints for shape drift.

### no-poll

**No-poll background work** — work starts because something signalled it, not because a loop woke up.

**Rules:** R31: no background-worker busy-wait to find work or watch a flag. A worker waits on an in-process queue that carries the work, filled by the producer; a timer only wakes it at a stored due time or on a genuine schedule; health comes from what a worker last reported. The client half (§10.2) is the same rule for UI polling.

**Adopted means:** `while (true) { sleep(short); check(); }` does not appear. Manual "run now" enqueues directly; a persisted flag is a restart backstop checked once at startup, not a polled inbox.

**Audit by:** grep background services for sleep-in-loop, and the client for interval-based refetching that a push channel should serve.

**Note:** the client half needs a push channel to exist or be added — that is `push-channel`, an architectural area. The server half stands alone.

### design-tokens

**Single design-token home** — one home for the palette and the scale; everything else derives from it.

**Rules:** R26: realise each design handoff bundle faithfully, with a new export for every new screen, form factor or interactive surface; lift its tokens into the client's single token home **once**; every component derives from them.

**Adopted means:** no hard-coded hex or size that duplicates a token. The structural half (single token home, derive-don't-duplicate, realise-don't-reinterpret) holds regardless of what the design looks like — that is what makes this adoptable without a design handoff bundle.

**Audit by:** grep components for raw colour and spacing literals. Count how many places define the palette.

---

## Architectural tier

Re-architecture projects, each individually scoped, sequenced, and given its own data-migration story. Never a drive-by. Adopt the standalone tier first so these land on a safety net.

### module-isolation

**Module isolation** — the dependency graph is a star — modules know Core and nothing else.

**Rules:** R1 (a module references only Core), R2 (Core references no module), R4 (every module implements the module contract and is mechanically constructible), R5 (modules discovered automatically — no hand-wiring in the composition root), R6 (the Host references module projects only so the build ships them), R20 (no business service interfaces in Core — only `IEventBus`, `ICurrentUser` and kin).

**Adopted means:** the dependency graph is a star, not a mesh. A new module is picked up by the composition root without anyone editing it.

**Audit by:** build the actual reference graph between modules; this is the single most informative artifact of the whole audit. Then read the composition root: how much of it is hand-wiring? Then find the places the build still lists modules by hand (container image restore stage, CI test shards, solution file) and whether a guard fails when one is missing (R5). Then check Core for business interfaces that couple it to a feature.

**Strangler-style, always:** build the new seam, move one consumer, verify, repeat. Never a big-bang rewrite.

### data-isolation

**Schema-per-module & per-module migrations** — the database enforces the boundary the code claims.

**Rules:** R7 (one data context per module, one physical database, logical isolation per module), R8 (a module must not read another module's schema — no cross-schema joins), R9 (each module owns its migrations, history ledger in its own schema), R10 (migrations from day one, applied automatically, no schema auto-creation shortcut and no hand-written SQL fix-ups), R11 (one engine and one data-access layer for the whole app).

**Adopted means:** the database enforces the module boundary the code claims. This is usually the hardest area because it carries a real data-migration story.

**Audit by:** how many data contexts are there? Do queries or views cross schema boundaries? Is there a single migrations history for everything? Are there hand-written SQL fix-ups at startup? Is the database image pinned to an exact tag, the same in dev, tests and deploy (R11)? Does a schema from a retired module still hold tables other than its migrations history (R9)?

### events

**Events & local read models** — modules talk by publishing, and each consumer keeps its own copy.

**Rules:** R3 (cross-module communication only via events; the consumer keeps its own local read model), R12 (a small hand-rolled in-process bus; no mediator framework, no external broker), R13 (events are small immutable value types), R14 (shared events in Core, private events in the module), R16 (subscriptions wired once per bus at mapping time, with the guard tied to the bus instance rather than a static flag).

**Adopted means:** module B never calls into module A. It subscribes and keeps its own copy of what it needs.

**Audit by:** find every direct cross-module call; each is a candidate event. Check the R16 guard's shape: a static once-only flag means every integration-test host after the first in a process has no subscribers. Whether those events survive a failure is `event-durability`, audited separately.

### event-durability

**Event durability**: a change another module copies is saved with its event, delivered until it lands, applied once, and applied in order.

**Rules:** R15 (fresh scope per event and bounded, loud retries; an event that changes another module's stored data goes through the transactional outbox, with a direct publish kept for pushes, progress and replay traffic; every handler idempotent or deduped by an inbox row; no reliance on the order modules' handlers run in).

**Adopted means:** a data-changing event commits in the same transaction as its change (§4.8); a failed delivery is retried and finally parks where a person can see, retry or skip it; a repeated delivery changes nothing; each owner's events apply in commit order; a whole-owner clear supersedes the deliveries queued before it; and any read model that can miss history has a replay-and-receipt rebuild (§4.9).

**Audit by:** for every handler that writes data, find how its event is published: a direct publish after the producer's save is at-most-once, and a persistent fault silently leaves that read model wrong. Read handlers for counters and appends (`count++`, an insert with no key check) that a retry doubles. List read models added after their data existed and how they were filled. Look for repair machinery (rescans, boot snapshots, resync buttons) and the defects filed against it: a cluster there is the symptom of this gap, not a run of bad luck.

**Not a scaling decision:** the at-most-once bus fails on one host, the first time a handler hits a persistent fault. Defer this area only with a revisit trigger that names the repair machinery, and treat a run of defects in it as that trigger firing (`alignment.md`, re-reviews).

### api-shape

**Lightweight endpoints & DI shape** — a thin endpoint layer, plain DTOs, consistent lifetimes.

**Rules:** R17 (lightweight endpoint routing only — no heavyweight MVC/controller layer, no attribute routing; routes under `/api/<feature>/...`), R18 (plain immutable DTOs per module, no object-mapping frameworks), R19 (composition lifetimes: bus/current-user/HTTP clients singleton; data contexts, domain services, handlers scoped; background workers on the stack's hosted-worker primitive).

**Adopted means:** the endpoint layer is thin and the DTOs are declared where they are used.

**Audit by:** is there a controller hierarchy with base classes and filters? Is an object mapper in the dependency list? Are lifetimes registered consistently?

**Listed architectural because replacing an MVC layer is a project** — but if the repo is already close, this behaves like a contained change. Judge it per repo rather than by the tier label.

### push-channel

**Single push channel owned by Notifications** — one realtime transport, and one module allowed to touch it.

**Rules:** R21 (one realtime push channel for the whole app, owned by the Notifications module; the Host maps it, the one place outside the admin CLI branch (R6) where Host references a module type), R22 (only Notifications touches the push transport's server API; other modules publish domain events and Notifications translates the push-worthy ones).

**Adopted means:** one hub, one owner. Feature modules never reach for the transport directly.

**Audit by:** count push transports. Find every injection of the hub context outside Notifications.
