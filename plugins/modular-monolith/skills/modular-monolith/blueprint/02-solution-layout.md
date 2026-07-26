> **Modular Monolith Blueprint — §2.** [Index](README.md) · [Rules Digest](01-rules-digest.md)

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
.claude/app-documentation/profile.md    # OPTIONAL (§17.1) — what a "part" is here, doc paths, the role model
.claude/smoke-tests/profile.md          # OPTIONAL (§17.2) — how the app runs, how to sign in, release tagging
docs/
  design-handoff/<date>-<surface>/  # committed Claude Design handoff bundle — the design source of truth (§11)
  ROADMAP.md                        # what's shipped / in progress / deferred (+ deliberate deviations)
  modules/<module>.md               # per-module design & reference doc, kept in step with the code
  specs/<date>-<topic>.md           # per-change design/spec + impact analysis for significant changes (§13.1)
  runbooks/<module>.md              # per-module regression runbook — tri-purpose E2E source of truth,
                                    #   1:1 with that module's e2e project (§12.9); split into
                                    #   runbooks/<module>/<area>.md when a module has several areas
  guides/<audience>-guide.md        # OPTIONAL (§17.1) — role-badged end-user / operator guides, derived
                                    #   from the module docs and verified against the real UI
  smoke-tests/<date>-<topic>.md     # OPTIONAL (§17.2) — hand-run script for one change or one release;
                                    #   written only on request, never implied by a change
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
