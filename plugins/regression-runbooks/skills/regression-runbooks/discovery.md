# Discovery Procedure, Coverage Ledger & Reconciliation Gate

Deep-dive for the **Profile** (Phase 1 of the workflow) and **Discover** (Phase
2) phases, plus the **Reconcile** gate (Phase 4). SKILL.md summarises all six
phases and links here for the full ledger schema and discovery mechanics.

> **Scope of this document:** Phases 1 (Profile), 2 (Discover), and 4
> (Reconcile). The remaining phases — Phase 3 (Write), Phase 5 (Automate), and
> Phase 6 (Self-improve) — are covered in the other skill files. If you don't see a
> "Phase 3" heading here, that's intentional.

---

## Phase 1 — Profile (once per repo, then reused)

> Design-doc name: "Phase 0". SKILL.md name: "Phase 1 — Profile".

The profile is a **one-time discovery** of how this repo works. It is saved
to `<repo>/.claude/regression-runbooks/profile.md` (instantiated from
`template-profile.md`). Every subsequent area run reads it; re-validate lightly
if it already exists (stacks drift, harness commands change).

### Profile checklist

Work through the checklist in order. Each item produces a concrete answer
written into `profile.md`; nothing is left implicit.

#### 1. FE framework + component library

- Read `package.json` to identify the rendering framework (React, Vue, Svelte,
  Angular, …) and its major version.
- Identify the component library (MUI, Tailwind/shadcn/radix, Ant Design,
  Chakra, plain CSS, …). The library determines which selector patterns are
  reliable and which gotchas apply (see `reference.md §8`).
- Note any form-management library (React Hook Form, Formik, Zod-driven, …).

#### 2. e2e runner (or "none yet")

- Check for `playwright.config.*`, `cypress.config.*`, or equivalent in the
  project root and `package.json` scripts.
- If found: record the runner, the config file path, the run command(s),
  the test-file location pattern, and any helper / fixture / globalSetup
  the harness exposes.
- If none found: record **"none yet"**. Runbooks for this repo will be
  **manual-only** until a harness is introduced; note in `profile.md` so
  Phase 5 (Automate) knows to stop at the manual tier.

#### 3. Source-of-truth for fields and enums

This is the single most important profile item. The **source-of-truth** is the
authoritative declaration that every field list, enum set, required-field list,
and validation rule must derive from — never hand-written, never duplicated.

Scan for these, in priority order:

| Priority | Candidate | Signal |
|----------|-----------|--------|
| 1 | Published schema / contract package | `package.json` has a `@<org>/schema-*`, `@<org>/contract-*`, or equivalent dependency |
| 2 | OpenAPI / Swagger / AsyncAPI spec | `.openapi.json`, `openapi.yaml`, `swagger.json`, `api.yaml` in root or `docs/` |
| 3 | Zod schema module | `src/**/schema*.ts`, `src/**/validation*.ts`, imports of `zod` or `valibot` |
| 4 | Plain TypeScript types / interfaces | `src/**/types*.ts`, `src/**/models*.ts`, `src/**/entities*.ts` |
| 5 | Form components themselves | Fall-back; derive from JSX if no canonical file exists |

Record the canonical file(s)/package name so every area's ledger can point
"field source: <here>" unambiguously. If multiple layers exist (e.g. a schema
package AND a Zod adapter), record the chain and which layer is authoritative
for which fact (enums vs required vs label).

#### 4. Verification lanes

Runbooks prove persistence; this section says **how**. Identify at least one
automatable lane (canonical lane model: see `reference.md` §5):

| Lane | What you verify | Automatable? |
|------|----------------|--------------|
| **Lane 1 — In-app / observable** | Re-open the item in the form or list; inspect any app data-explorer view; check browser storage (IndexedDB / localStorage / OPFS) for offline-first apps | Yes — Playwright; always available |
| **Lane 2 — Direct datastore query** | Server-side row values queried directly (SQL client, DB console, admin endpoint, or ORM helper) — human-operated | No — human manual step (Profile A or C) |
| **Lane 3 — Automation-side read-back** | Backend rows queried in-process from the e2e harness (API call, DB helper, or `sql`/`db` fixture) | Yes — `page.evaluate(fetch(…))` or harness `sql`/`db` fixture |

Record the available lanes, any setup they require (credentials, helpers,
ports), and which lane is used at each tier (Smoke → Lane 1 minimum;
Full → Lane 1 + Lane 2 + Lane 3 where available).

#### 5. Auth / login and state reset

- How to log in (dev bypass, test account, env var–injected credentials, …).
- How to reach a clean slate before a run (clear local storage / DB, seed
  script, teardown hook, settings menu, …).
- Whether a separate "second environment" (staging, review app) exists and how
  auth differs there.

Record as exact UI steps (for manual profiles) and code references (for the
automated profile), so every area runbook can reference them by name.

#### 6. Area inventory

Build a table: **all routes / nav nodes** grouped into named areas. Columns:
`Area`, `Nav path / label`, `Route(s)`, `Entities written`, `Permission gate`.
The "Entities written" column holds `read-only` or `none` for areas that make
no writes (e.g. a dashboard or explorer view).

Derive from the router config (React Router, Next.js pages/app dir, vue-router,
…) and the nav component, not from docs that may be stale. Each area becomes a
potential runbook; this table is the scope list the user chooses from.

#### 7. Selector conventions

- Confirm the repo uses role + accessible name (preferred) or has a `data-testid`
  convention.
- List any known testability gaps (inputs without labels, icon buttons without
  `aria-label`) as a todo for the app, not a workaround in the runbook.
- Note component-library quirks already known for this repo (these become
  repo-specific entries in `profile.md`; generic ones live in `reference.md §8`).

### Re-validate an existing profile

If `.claude/regression-runbooks/profile.md` already exists:

1. Check the framework / library version hasn't changed (`package.json` diff).
2. Confirm the e2e runner and run command still work.
3. Skim the area inventory for new routes added since the profile was written.
4. Add any new verification lanes or credential changes.
5. **Verify the source-of-truth is unchanged.** Confirm that the schema package,
   OpenAPI spec path, or Zod module recorded in the profile still exists at the
   same location under the same name, and that the pinned version (if any) is
   still the one the repo uses. A renamed or replaced source-of-truth silently
   corrupts every ledger derived from it — catch this here, not mid-discovery.
   (Re-run the Discovery phase for any area whose ledger was derived from a
   source-of-truth that has since changed or been renamed.)

Update `profile.md` in-place; note the date and what changed.

---

## Phase 2 — Discover (exhaustive, parallel)

> Design-doc name: "Phase 1". SKILL.md name: "Phase 2 — Discover".

For the target area, fan out parallel `Explore` agents to build the **coverage
ledger** before writing a single test case. This is the phase where you find
everything — not just what's obvious on the happy path.

### Why parallel `Explore` agents

A single sequential read of an area misses things hidden behind conditional
renders, permission gates, or files several import hops away from the page.
Parallel `Explore` agents each focus on one dimension and their findings are
merged into the ledger. Codebase search / graph tools (when present) augment
this further.

### What to launch in parallel

Each agent below receives the area name, the relevant source files, and the
profile (`profile.md`). They are **read-only** — they explore and report; they
do not write.

| Agent | Focus | What it extracts |
|-------|-------|-----------------|
| **Routes agent** | Router config + nav | Every `route` — all URL patterns for this area; query-param variants; redirect/guard behaviour |
| **Form agent** | Form component(s) | Every `field` — control type, label, `required`, `placeholder`, default, bounds, enum source; conditional visibility; multi-step / multi-section layout |
| **Validation agent** | Validators / schema / form submit handler | Every `rule` — condition, error message, where it surfaces (inline vs. top alert vs. toast), timing (on-blur / on-submit) |
| **Branch agent** | Conditional render and routing | Every `branch` — what triggers it (field value, role, feature flag, entity state), which sub-set of fields/actions it shows |
| **Action agent** | Buttons, menus, links | Every `action` — label, role, gate condition, what it triggers (mutation, nav, modal, side-effect) |
| **State agent** | Lifecycle / workflow engine | Every `state` transition — entity lifecycle (draft→active→archived), confirmation dialogs, optimistic vs. confirmed UI |
| **List agent** | List/table/grid components | Every `list` feature — filter inputs + options, sort columns, search/debounce, pagination (page size, cursor, infinite), selection/bulk actions |
| **Column agent** | Repository / service / API layer | Every `column` written to persistence — map field→column name, note omitted or server-computed columns, FK columns that need a parent row |
| **Frame agent** (once per repo, not per area) | App shell, boot sequence, layout chrome, host-level endpoints | Everything belonging to no feature: what the app fetches **before it draws anything** (branding, auth mode, environment name, build version) and what it does when that fails; the environment banner; the build identity; operator-only diagnostics panels; global security headers and health probes; and **what the app renders when a screen throws** |

**Launch the frame agent once, and give what it finds its own area.** A per-area sweep is structurally
blind to the chrome, because the chrome belongs to no area: a repo can have a runbook for every route,
every module and every endpoint that belongs to a module, and still have nothing covering the frame those
routes are drawn inside. Measured in one repo on 2026-08-18: 15 runbooks and 151 cases, and six
uncovered frame surfaces, two of which were *mentioned* in existing runbooks in a way that reads like
coverage (one as a clause inside a manual capability matrix, the other as a note about a selector
collision). Own that area explicitly, with its own code and, where the harness is per-module, its own
project. The failure cases are the valuable ones: asking "what does this do when it breaks" of the shell
is what found a render crash that unmounted the whole document to a blank page, a behaviour nobody had
ever specified because it belonged to nobody.

### How agents derive from the source-of-truth

Each agent must cross-reference the **source-of-truth** (identified in the
profile) when extracting items:

- **Fields:** compare the form's rendered inputs against the canonical field
  list. A canonical field absent from the form is a `field:… absent:<reason>`
  entry. A form input without a canonical backing is a testability finding.
- **Enums / code lists:** check whether the form's option set matches the
  canonical enum values. A hard-coded JSX array that diverges from canonical is
  a drift finding, not just a test item.
- **Required fields:** derive from the canonical `required` / `requiredForInput`
  flags, not by eyeballing `*` markers in the UI (those may be cosmetic only or
  may be missing where the rule is enforced in JS, not HTML).
- **Validation rules:** prefer reading from the canonical schema or validator
  module; fall back to the form's submit handler. If both exist, check they
  agree — divergence is a finding.

### Diffing against legacy / manual test docs

Before finalising the ledger, the discovery phase **must** diff against any
existing documentation that previously guaranteed behaviour:

- `docs/runbooks/<area>.md` (if a prior runbook exists)
- Any manual test plan, QA doc, or spreadsheet committed under `docs/`
- Comments in the source that describe expected behaviour ("// must reject if…")

A new discovery run that finds fewer items than a legacy doc guaranteed is
**not** evidence the feature was removed — it is evidence the discovery missed
something. Slot every concrete behaviour from the legacy doc into the ledger as
a named item. Only mark something `absent` after confirming in source that it
truly does not exist.

### Merging agent findings into the ledger

After all agents return:

1. Collect all reported items into the ledger (Section 3 schema below).
2. Assign each a stable key following the naming convention.
3. Set initial status to `uncovered` for every item (reconciliation, Phase 4,
   will change this).
4. Flag duplicates (same behaviour discovered by two agents) — keep one entry,
   note both agents saw it.
5. Flag findings that require a **human judgment call** (ambiguous behaviour,
   suspected dead code, an enum that looks stale) — annotate, don't silently
   skip.

The verbose discovery dump may be saved to
`<repo>/.claude/regression-runbooks/ledgers/<area>.md` for auditability. The
**compact coverage map** (ledger item → TC IDs) rides inside the runbook
deliverable (`docs/runbooks/<area>.md`), not in a separate file, so proof
travels with the deliverable.

---

## Coverage-ledger schema

Each ledger item has:

- a **stable key** — never reused or renamed once assigned
- an **item type** — one of the 8 types below
- a **description** — one sentence: what the item is and how it behaves
- a **source** — the file / canonical path where it is declared or enforced
- a **status** — see status values below

### The 8 item types

| Type | Captures | Stable-key convention | Example key |
|------|----------|-----------------------|-------------|
| `route` | A navigable URL/state the app can be in | `route:<path-pattern>` | `route:/projects/:id/edit` |
| `field` | One form input (label, control type, required, bounds, enum source) | `field:<entity>.<fieldName>` | `field:project.name` |
| `rule` | One validation rule + the error message it emits | `rule:<entity>.<fieldName>.<ruleName>` | `rule:project.name.minLength` |
| `branch` | A conditional render or variant form triggered by a value/role/state | `branch:<entity>.<trigger>=<value>` | `branch:order.type=EXPRESS` |
| `action` | A button, menu item, or link that triggers a mutation or transition | `action:<entity>.<verb>` | `action:project.archive` |
| `state` | A lifecycle or workflow transition between entity states | `state:<entity>.<from>→<to>` | `state:order.DRAFT→SUBMITTED` |
| `list` | A filter, sort, search, or pagination feature of a list/grid | `list:<entity>.<featureName>` | `list:projects.filterByStatus` |
| `column` | A persisted column that must survive a write + read-back round-trip | `column:<Table>.<ColumnName>` | `column:Projects.ProjectName` |

### Status values

Each item carries exactly one status at any point:

| Status | Meaning |
|--------|---------|
| `uncovered` | Discovered but not yet mapped to any test case. Blocks completion (see Reconcile). |
| `covered:[TC-…]` | Mapped to ≥1 test case. Comma-separate multiple IDs: `covered:[TC-PROJ-T2,TC-PROJ-F1]` |
| `absent:<reason>` | Confirmed non-existent in the current app. State the evidence: `absent:field removed in v2.3 (PR #412)` |
| `deferred:<user-approval-ref>` | User explicitly approved deferral. Ref the conversation/issue: `deferred:approved 2026-06-19 #issue-301` |

### Ledger format (within a runbook or ledger file)

```markdown
## Coverage ledger

| Key | Type | Description | Source | Status |
|-----|------|-------------|--------|--------|
| route:/projects | route | Projects list page | src/router/index.tsx | covered:[TC-PROJ-S1] |
| field:project.name | field | Project name — text, required, maxLength 200 | src/forms/ProjectForm.tsx | covered:[TC-PROJ-T6,TC-PROJ-F1] |
| rule:project.name.required | rule | "Project name is required" blocks save when blank | src/forms/ProjectForm.tsx | covered:[TC-PROJ-T6] |
| branch:project.status=ARCHIVED | branch | Archived project shows read-only banner, hides Edit | src/pages/ProjectDetail.tsx | covered:[TC-PROJ-T4] |
| action:project.archive | action | Archive button transitions status ACTIVE→ARCHIVED | src/pages/ProjectDetail.tsx | covered:[TC-PROJ-T4] |
| state:project.ACTIVE→ARCHIVED | state | Project lifecycle — archive with confirmation | src/services/projectService.ts | covered:[TC-PROJ-T4] |
| list:projects.filterByStatus | list | Status filter dropdown on /projects list | src/pages/ProjectList.tsx | covered:[TC-PROJ-T3] |
| column:Projects.ProjectName | column | Maps field:project.name; verified in DB after sync | src/repositories/ProjectRepository.ts | covered:[TC-PROJ-F1] |
```

The ledger lives **inside the runbook** (`docs/runbooks/<area>.md`) as the
"Coverage ledger" section, immediately before the test cases. A verbose
discovery dump (with agent notes, findings, drift annotations) may optionally
be kept at `<repo>/.claude/regression-runbooks/ledgers/<area>.md`.

---

## Phase 4 — Reconcile (the "miss nothing" gate)

> Design-doc name: "Phase 3". SKILL.md name: "Phase 4 — Reconcile".

Reconciliation is a **hard gate** run after test cases are drafted and before
the runbook is considered complete.

### The rule

Every ledger item must have a final status of `covered`, `absent`, or
`deferred`. Any item still `uncovered` **blocks completion**.

```
blocked: the following items remain uncovered — resolve before closing the area
  uncovered: rule:order.quantity.min
  uncovered: state:order.PENDING→CANCELLED
  uncovered: list:orders.sortByDate
```

### Handling each status

**`covered:[TC-…]`** — at least one test case (Smoke, Targeted, or Full) maps
to this item. The TC ID must exist in the runbook. Verify the mapping is
substantive: a TC that navigates past an item without asserting it does not
count.

**`absent:<reason>`** — the item does not exist in the current app. The reason
must cite evidence (file path, PR, feature flag that never enables it). A
suspected-absent item that you cannot confirm with evidence is still
`uncovered`. Examples:

- `absent:field removed when API simplified schema in PR #288`
- `absent:pagination not implemented; list always returns all rows (< 50 typical)`
- `absent:sort by this column never wired in the component`

**`deferred:<user-approval-ref>`** — **never unilateral**. Before marking
anything deferred you must stop and ask the user: "do now / defer with your
approval / drop it?" The approval reference must be traceable (conversation
date, GitHub issue, PR comment). An item you would personally mark out-of-scope
must go through this gate — the non-negotiable from SKILL.md applies here
verbatim:

> "The only thing you may record without asking is a sub-part that genuinely
> does not exist in the app — state that absence. Everything that exists but
> you're not covering is a question for the user."

### Writing the compact coverage map

Once every item is resolved, write the compact map as the runbook's last
coverage section, immediately after the Full-tier cases:

> For `absent` and `deferred` items the second column holds the full status
> value (e.g. `absent:pagination not implemented`) rather than a TC ID.

```markdown
## Coverage map

| Ledger key | TC IDs / Status |
|------------|-----------------|
| route:/projects | TC-PROJ-S1 |
| field:project.name | TC-PROJ-T6, TC-PROJ-F1 |
| rule:project.name.required | TC-PROJ-T6 |
| branch:project.status=ARCHIVED | TC-PROJ-T4 |
| action:project.archive | TC-PROJ-T4 |
| state:project.ACTIVE→ARCHIVED | TC-PROJ-T4 |
| list:projects.filterByStatus | TC-PROJ-T3 |
| column:Projects.ProjectName | TC-PROJ-F1 |
| rule:project.code.unique | absent:uniqueness enforced server-side; 409 mapped to form error in TC-PROJ-T7 |
| field:project.legacyRef | deferred:approved 2026-06-19 #issue-301 (field present but not rendered in current form) |
```

This map stays with the runbook file — not in a separate ledger — so any
reviewer can confirm coverage without consulting additional files.

### Reconciliation checklist (run in order)

1. Count ledger items by status: `uncovered` / `covered` / `absent` / `deferred`.
2. For each `uncovered` item: determine if a TC should be added, the item is
   absent (evidence required), or deferral needs user approval.
3. Add missing TCs or update statuses; never just flip `uncovered` to `deferred`
   without the user conversation.
4. Verify every `covered:[TC-…]` ID appears in the runbook and the TC's step
   actually exercises the item.
5. Write the compact coverage map section.
6. Confirm the total: every item is `covered`, `absent`, or `deferred`. If not,
   go back to step 2.

---

## Sizing guidance

### When to split an area into multiple runbooks

Split when the area contains more than one of these signals:

- More than ~30 ledger items in total across all 8 types.
- Two or more **sub-routes** that each have their own forms, lists, and
  validation rules (they are effectively sub-areas).
- Distinct **permission gates** that require different auth contexts to test —
  each gate is a separate run profile.
- Unrelated entity lifecycles share a page only by navigation (e.g. a "lab
  management" page that hosts independent CRUD surfaces for laboratories,
  standards, and suites).

When you split: each sub-area gets its own runbook file; a parent
`docs/runbooks/<cluster>.md` (or `README.md`) links them and documents the
FK dependency order.

### How many discovery agents

| Area complexity | Parallel agents | Guidance |
|-----------------|-----------------|----------|
| Simple CRUD (1 form, 1 list, no branches) | 4–5 | Routes + Form + Validation + Action + Column |
| Standard area (form with branches, lifecycle, filters) | All 8 | Full fan-out; each agent is cheap |
| Complex cluster (multiple entities, deep FK chain) | 8 per sub-area, sequenced | Discover sub-areas sequentially; share findings about shared entities |

If a codebase graph or semantic search tool is available (e.g. an indexed
knowledge graph MCP), use it **in addition** to the agents — it surfaces
cross-file references that a single-file Explore may miss.

### Keeping the ledger reviewable

- Prefer **atomic items** over composite ones. One `field` entry per input, not
  one entry for "all the fields in this form." The reconciliation gate works at
  item granularity.
- Use the standard key convention — it allows mechanical deduplication and
  sorting.
- Keep `source` paths relative to the repo root so they remain valid if the
  project is moved.
- After reconciliation, archive the verbose discovery dump to
  `<repo>/.claude/regression-runbooks/ledgers/<area>.md` if it is large (> 100
  items); the runbook itself carries only the compact map.
- When a canonical field is added or renamed, re-run the Discovery phase for
  affected areas — the source-of-truth has changed, and the ledger's field and
  column entries must be re-derived, not patched by hand.
