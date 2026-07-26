# Modular Monolith App Blueprint

> A complete, agent-ready specification for building a new application as a
> **modular monolith** — and for **selectively aligning an existing application**
> to it.
> Everything an autonomous coding agent needs to scaffold, extend, and ship the
> app is here: the architecture, the non-negotiable rules, copy-pasteable code
> skeletons, the design system contract, and the verification discipline that
> keeps every change inside the lines. For an **existing** project, the rules
> are a **menu, not a mandate**: run the alignment review, then adopt only what
> the user chooses ([§16](16-aligning-existing-project.md)).
>
> **The tech stack is NOT fixed by this blueprint.** The architecture fixes
> **seams and rules** — module isolation, events + local read models,
> schema-per-module, one push channel, one design-token home, the test pyramid —
> and every **technology** that fills those seams (server language & framework,
> data access, database engine, client framework, styling system, realtime
> transport, orchestration, test tooling, authentication) is **the user's
> decision, asked before the code that depends on it is written**
> ([§3](03-stack-selection.md)). Never assume a
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
> [Build Order](14-build-order.md) top to bottom. **Existing app:** start
> at [§16](16-aligning-existing-project.md) — audit first,
> change nothing until the user picks the alignment targets. The
> [Rules Digest](01-rules-digest.md) is the contract — an agent must
> re-read it before every change and must not violate it (in an existing app,
> the contract is the digest **as scoped by the §16 adoption decisions**).
> **Two practices are deliberately optional** — end-user guides and hand-run smoke tests ([§17](17-optional-practices.md)): offer each at the point noted, record the answer, and never produce their artifacts unasked.
>
> **This blueprint expects a design-first workflow.** The visual/UX design is
> produced **upstream in Claude Design** (Anthropic's prompt-to-prototype tool)
> **before** the app is built, then **handed off** via *Export → Handoff to
> Claude Code* — which yields a **handoff bundle (zip)** plus a **copied prompt**.
> That bundle (component-structure spec, design tokens, breakpoints, interaction
> states, assets, screenshots, README, and design rationale) is the **design
> input** to construction: an agent commits it under `docs/design-handoff/`,
> lifts its tokens into the client's **single token home**, and **realises** it
> on the **chosen client stack** ([§11](11-design-system.md)).
> There is **no required `DESIGN.md`** — the committed bundle + the token home
> are the source of truth; a `DESIGN.md` is an optional, *derived* summary. The
> visual specifics quoted in §11 are an illustrative example only, shown to
> convey shape; **your app's tokens, type, and components come from your handoff
> bundle**, while the *structural* design rules in §11 (single token home,
> derive-don't-duplicate, realise-don't-reinterpret) hold regardless of the look.

## Sections

Each section is its own file so you load only what the work needs. **§1 is the contract** — read it before every change. Everything else is read on demand.

| Section | Read it when |
| --- | --- |
| [§0 North Star](00-north-star.md) | You need the four pillars and why they exist — the one-page orientation. |
| [§1 Rules Digest](01-rules-digest.md) | **Always.** R1–R35, the rules an agent keeps loaded. In an existing app, scoped by the adoption register. |
| [§2 Solution Layout](02-solution-layout.md) | Judging whether a repo's project/folder shape matches, or laying out a new one. |
| [§3 Stack Selection](03-stack-selection.md) | Before writing code that depends on a stack decision. Lists every decision and when to ask it. |
| [§4 Core Library](04-core-library.md) | Working on the shared kernel: module contract, event bus, current-user seam, auth. |
| [§5 Host](05-host.md) | Working on the composition root, startup guards, or module discovery. |
| [§6 Module Template](06-module-template.md) | Adding or restructuring a module; wiring a config-switched external seam (§6.6). |
| [§7 Standard module set](07-standard-modules.md) | Deciding which modules an app should have; the Notifications relay skeleton. |
| [§8 Persistence & Migrations](08-persistence-migrations.md) | Anything touching the database engine, schemas, migrations, or seeding. |
| [§9 Local-Dev Orchestration](09-local-dev-orchestration.md) | Working on the dev orchestrator or service defaults. |
| [§10 Client SPA](10-client-spa.md) | Working on client structure, its rules, or its commands. |
| [§11 Design System](11-design-system.md) | Ingesting a design handoff bundle, or touching tokens and component styling. |
| [§12 Testing & Verification](12-testing-verification.md) | Anything about tests, CI shape, static gates, or regression runbooks. The largest and most-adopted section. |
| [§13 Cross-cutting conventions](13-cross-cutting-conventions.md) | Error envelopes, paging, the significant-change protocol, anti-patterns, the security baseline. |
| [§14 Build Order](14-build-order.md) | Building a new app from scratch, phase by phase. |
| [§15 Definition of Done](15-definition-of-done.md) | Checking whether a change is finished. |
| [§16 Aligning an existing project](16-aligning-existing-project.md) | **The entry point for an existing repo.** Audit → the user picks → align incrementally. |
| [§17 Optional practices](17-optional-practices.md) | Offering end-user guides or hand-run smoke tests. Neither is required for alignment. |
