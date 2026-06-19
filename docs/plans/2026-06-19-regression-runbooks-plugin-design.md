# Regression Runbooks — generic plugin design

**Date:** 2026-06-19
**Status:** Approved (design) → ready for implementation plan
**Author:** Warwick Schroeder (with Claude)

## 1. Goal

Generalise the DrillLogify-specific `regression-runbooks` skill into a
**repo-agnostic, distributable Claude Code plugin** usable in any web-app repo.

The plugin must do what the original does, for any repo:

1. **Explore an area in extreme detail** to find **all** functionality — every
   route, field, validation rule, conditional branch, action, enum, state, and
   list feature.
2. **Write tiered regression runbooks** from that exploration. No functionality
   missed, every path covered, every scenario and as many edge cases as possible.
3. **Self-improve after every run** — each run feeds learnings back so the next
   area (and the next repo) is cheaper.

The original skill stays as the proof: it is a fully-populated, hand-tuned
example of the per-repo knowledge the generic plugin discovers and persists.

## 2. Decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Packaging / distribution | **Distributable plugin** (versioned, shareable), hosted as a **marketplace inside `warwickschroeder/repo-standards`** (`C:\W\repo-standards`, public). |
| 2 | Target scope | **Web apps, any FE stack.** Opinionated toward web-app e2e (drive a UI + verify persistence), but discover the actual stack per repo. Not API-only / CLI / desktop. |
| 3 | Self-improvement target | **Both:** always append generalizable lessons to a global sidecar; also edit+commit the plugin's git source when reachable. Never lose a lesson. |
| 4 | Coverage guarantee | **Coverage ledger + parallel discovery agents.** Discovery is a first-class phase producing an explicit ledger; every ledger item must map to ≥1 test case before a runbook is "done" (the "miss nothing" gate). |
| A | Existing DrillLogify skill | **Left untouched.** The new plugin is a fresh generalization; DrillLogify can adopt the plugin + a profile later as a separate follow-up. |
| B | `.claude/` machinery naming | **Unified** under `regression-runbooks/` in both the per-repo and global `.claude` roots. Runbook *deliverables* stay in `docs/runbooks/` (documentation, not machinery). |

## 3. Artifacts & locations

Three classes of artifact, each in the right home.

### 3a. The plugin (versioned, shared) — in `repo-standards`

```
C:\W\repo-standards\
  .claude-plugin\
    marketplace.json                    # declares the marketplace + its plugins
  plugins\
    regression-runbooks\
      .claude-plugin\plugin.json        # plugin manifest (name, version, desc)
      skills\regression-runbooks\
        SKILL.md            # lean: workflow, non-negotiables, pointers
        discovery.md        # exhaustive discovery procedure + ledger schema
        reference.md        # generic mechanics + generalizable gotcha catalogue
        template-runbook.md # per-area runbook template (framework-neutral)
        template-profile.md # per-repo profile skeleton
  default.json   Blueprints\   README.md # existing — untouched
```

Install in any repo:

```
/plugin marketplace add warwickschroeder/repo-standards
/plugin install regression-runbooks
```

### 3b. Per-repo artifacts (committed in the target repo)

```
<repo>/.claude/regression-runbooks/
  profile.md            # discovered-once repo facts (stack, lanes, conventions, repo gotchas)
  ledgers/<area>.md     # (optional) verbose discovery dump; the compact coverage map rides in the runbook
<repo>/docs/runbooks/   # path configurable via profile; default docs/runbooks
  <area>.md             # the runbooks (deliverables humans browse)
  README.md             # index
<repo>/<e2e-dir>/...    # generated specs, if the repo has/wants an e2e harness
```

### 3c. Global (per machine)

```
~/.claude/regression-runbooks/lessons.md   # cross-repo generalizable-lesson sidecar
```

The two `.claude/regression-runbooks/` folders (per-repo + global) share one
name. `docs/runbooks/` is deliberately separate — it is the human-readable
deliverable, not skill machinery.

## 4. The core loop — 6-phase workflow

Each area runs through these phases. This is the generalization of what the
DrillLogify skill does today.

### Phase 0 — Profile (once per repo, then reused)

Detect and record into `.claude/regression-runbooks/profile.md`:

- **FE framework + component library** (React/Vue/Svelte; MUI/Tailwind/shadcn/…).
- **e2e runner** (Playwright/Cypress/…), or "none yet" (then runbooks are
  manual-only until a harness exists).
- **Source-of-truth for fields/enums** — a schema package, TS types, an OpenAPI
  doc, a Zod/validation module, else the form components themselves. This is the
  generalization of DrillLogify's `@forgesoftwareau/schema-contract`. Everything
  derives from here; nothing is hand-written.
- **Persistence + how to verify it** — the "verification lanes": DB query / API
  read-back / browser storage. At least one lane must be usable by automation.
- **How to drive auth/login** and **how to reset state** (clean slate).
- **Area inventory** — all routes/nav grouped into areas (the §2 table,
  discovered).
- **Selector conventions** — role+name preferred; flag missing accessible names.

If a profile already exists, read it and lightly re-validate (stacks drift).

### Phase 1 — Discover (exhaustive, parallel)

For the target area, fan out parallel `Explore` agents (and codebase
graph/search tools where available) to build the **coverage ledger**:

- routes, fields (+control type, required?, bounds, enum/code-list source),
- validation rules (+ message + where it surfaces),
- conditional branches / variant forms,
- actions/buttons, state/lifecycle transitions (create/edit/delete/restore/
  workflow),
- list features (filter/sort/search/pagination),
- persisted columns.

Cross-check against the **source-of-truth** AND any **legacy/manual test docs**
(the "diff against the legacy runbook" rule, generalized — a green new suite is
not proof of parity with what an older doc guaranteed).

### Phase 2 — Write the runbook

From `template-runbook.md`: cases in **three tiers** — Smoke (critical path),
Targeted (per-feature), Full (exhaustive). Fields **derived from the
source-of-truth, never hand-written**. Every mutating case **proves + verifies
persistence**. The Full tier must carry:

- the **every-field both-ends round-trip** (fill every field → verify each in
  persistence after write → verify each back in the form after a reset+reload),
- **per-field validation** (each required field + each validator rule blocks with
  its message),
- enums/code-lists, special characters, boundary values, and conflict +
  soft-delete propagation **where they exist**.

### Phase 3 — Reconcile (the "miss nothing" gate)

Map **every ledger item → ≥1 test case**. Any unmapped item **blocks
completion**, unless it is:

- genuinely non-existent in the app (record a **stated absence**), or
- a **user-approved** defer (never a unilateral descope — see non-negotiables).

The compact coverage map (ledger item → TC IDs) is written as a section inside
the runbook so the proof travels with the deliverable.

### Phase 4 — Automate (if the repo has/wants e2e)

Generate the spec 1:1 from the runbook against the repo's harness, run it, and
triage every failure as **test-bug / app-bug / flake** (carry over that
discipline — never rewrite an assertion just to go green). Fix the root cause.
If the repo has no harness, stop at a manual-runnable runbook and flag the gap.

### Phase 5 — Self-improve (last step, always)

- **Repo-specific** lesson → the profile + the runbook's self-improving log.
- **Generalizable** lesson → the **global sidecar** (always) **and** the
  **plugin git source** (when reachable: edit the skill files, commit, bump
  `plugin.json`).
- If nothing generalizes, record "skill reviewed, no change."

## 5. What carries over vs. what is generalized

**Carries over verbatim (framework-neutral principles):**

- tiered cases; derive-from-source-of-truth; both-ends round-trip; per-field
  validation; tri-purpose runs (manual / automated / manual on a 2nd env);
- the test-failure **triage** rule;
- the **non-negotiables**, especially **never defer/descope unilaterally — ask
  first**;
- stable `TC-<AREA>-<TIER><n>` IDs (never renumber, only append);
- flag testability gaps instead of writing brittle selectors.

**Generalized (was hard-coded to DrillLogify):**

- area inventory → **discovered**;
- `schema-contract` canonical → **"the repo's source-of-truth"**;
- sync round-trip → **"the repo's persistence verification"**;
- SQL Server lanes → **"verification lanes (DB / API / storage)"**;
- `npm run test:e2e:harness` → **discovered** harness command.

**The gotcha catalogue (80+ entries):** split by generality.

- **Generic** MUI/Playwright/React patterns (substring strict-mode collisions,
  unnamed `<Select>`/`<Switch>`, date-picker roles, transient-toast →
  assert-durable-state, unbounded action-timeout hangs, native HTML5 validation
  needing `noValidate`, image upload via `setInputFiles`, etc.) → seed the
  plugin's `reference.md`.
- **DrillLogify-specific** entries → not carried (they would live in a profile
  if/when DrillLogify adopts the plugin).

## 6. Coverage ledger schema (Phase 1 output)

A ledger is a structured list; each item has a stable key and a coverage status.
Minimum item types:

| Type | Captures | Example key |
|---|---|---|
| `route` | a navigable URL/state | `route:/projects/:id/edit` |
| `field` | one form input | `field:project.name` |
| `rule` | one validation rule + message | `rule:project.name.minLength` |
| `branch` | a conditional render / variant form | `branch:hole.type=RC` |
| `action` | a button/menu action | `action:project.archive` |
| `state` | a lifecycle/workflow transition | `state:batch.DRAFT→SUBMITTED` |
| `list` | a filter/sort/search/pagination feature | `list:projects.filterByStatus` |
| `column` | a persisted column to verify | `column:Projects.ProjectName` |

Reconciliation (Phase 3) marks each item `covered:[TC-…]`, `absent:<reason>`, or
`deferred:<user-approval-ref>`. Anything left `uncovered` blocks completion.

## 7. Non-negotiables (carried from the original)

- **Tri-purpose:** a case must be both human-runnable and automatable.
- **Persistence is part of every mutation case**, not an afterthought.
- The **Full tier** carries the every-field both-ends round-trip + per-field
  validation.
- **Verification is required** via at least one lane.
- **Derive from the source-of-truth**, never hand-write field/enum lists.
- **Stable IDs**; never renumber.
- **Never defer/descope unilaterally — ask the user.** Only a genuinely
  non-existent sub-part may be recorded as a stated absence without asking.
- **Every run is a maintenance pass** — fix the app or the runbook, never
  rubber-stamp broken behaviour; feed generalizable lessons back to the skill.

## 8. Out of scope (now) / follow-ups

- Retrofitting the DrillLogify repo onto the plugin (+ extracting its specifics
  into a DrillLogify profile) — separate follow-up.
- API-only / CLI / desktop targets — explicitly out of scope (decision #2).
- Auto-generating specs for harnesses other than the one the repo already uses —
  the plugin generates against the discovered runner, it does not introduce one.
```
