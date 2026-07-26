> **Modular Monolith Blueprint — §3.** [Index](README.md) · [Rules Digest](01-rules-digest.md)

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
