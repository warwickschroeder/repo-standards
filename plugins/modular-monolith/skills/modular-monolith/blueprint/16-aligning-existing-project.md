> **Modular Monolith Blueprint — §16.** [Index](README.md) · [Rules Digest](01-rules-digest.md)

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

Review the codebase against the [Rules Digest](01-rules-digest.md) and
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

Then offer the two **optional practices** (§17) separately from this menu — they are not alignment areas, because an app that skips them is aligned. They belong in the same conversation because they are cheap for an existing app to add (both are pure additions, neither touches runtime behaviour) and because an existing app is exactly where the audit tends to expose that nobody can explain to a customer what the thing does.

Record the outcome in `docs/ROADMAP.md`: **adopted** areas (now binding — they
join the Definition of Done for every future change), **declined** areas (a
standing decision: future agents must not re-litigate or quietly "fix" them),
and **deferred** areas (revisit trigger noted) — plus the §17 answers, in the
same register and with the same standing force. The gap report plus this
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
