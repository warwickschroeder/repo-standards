> **Modular Monolith Blueprint — §13.** [Index](README.md) · [Rules Digest](01-rules-digest.md)

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
- **Update the affected `docs/modules/<module>.md`** in the same change — and, where the optional guides practice was adopted (§17.1), the affected `docs/guides/<audience>-guide.md` too if roles, workflows or screens moved.

> **On hand-run checklists.** An earlier version of this rule required a per-change `docs/smoke-tests/` manual checklist on every significant change. That is superseded: impact analysis lives in the spec doc, and the regression net is the integration + e2e suite — never a markdown checklist. A hand-run smoke test remains available as an **optional, on-request** practice for what a human on a real environment can prove and the suite structurally cannot ([§17.2](#172-manual-smoke-tests-docssmoke-tests)) — it is never implied by a change.

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
