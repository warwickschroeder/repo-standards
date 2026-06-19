<!--
Per-area regression runbook TEMPLATE. Copy to docs/runbooks/<area>.md and fill in.
Keep every test case in the structured Step block so it stays human-runnable AND
maps 1:1 to a spec (Profile B — automated e2e). See the regression-runbooks plugin
reference.md for mechanics: profiles, sync/persistence recipes, verification lanes,
selector conventions, and the full gotcha catalogue. Replace all {{PLACEHOLDERS}}
and delete these HTML comments before committing.

PLACEHOLDERS:
  {{Area}}         Human-readable area name, e.g. "Projects"
  {{AREA}}         Short uppercase code for TC IDs, e.g. "PROJ"
  {{nav group}}    Nav label path to reach this area, e.g. "Projects" or "Settings > Notifications"
  {{/route}}       Primary route pattern(s), e.g. "/projects", "/projects/:id/edit"
  {{entity}}       Lowercase entity name as stored/persisted, e.g. "projects"
  {{Entity}}       PascalCase entity name, e.g. "Project"
  {RUNID}          A short unique suffix the tester injects per run (timestamp or UUID).
                   In the automated spec this becomes a fixture-injected variable;
                   in manual runs the tester types a short timestamp, e.g. "240315".
-->

# {{Area}} — Regression Runbook

**Area code:** `{{AREA}}` · **Nav:** {{nav group}} · **Routes:** `{{/route}}`
**Entities / tables:** `{{entity}}` · **Feature/permission gate:** {{feature flag or role, or —}}

> **Mechanics live in `reference.md` and `discovery.md`.**
> Per-area files stay focused on this area's test cases. For login, state-reset,
> persistence recipes (upload, download, conflict), verification lanes, type
> mappings, FK dependency order, selector conventions, form-control gotchas, and
> the harness fixture API — see `reference.md`. For ledger schema, discovery
> agents, and the reconciliation gate — see `discovery.md`.

---

## Run record

Fill one row per execution. Profile A = local-dev manual; B = automated e2e;
C = second environment (staging/preview). See `reference.md §1` for setup steps.

| Date | Tester | Profile (A/B/C) | Build / commit | Tier run | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  | Smoke / Targeted / Full | ☐ Pass ☐ Fail |  |

---

## Scope & preconditions

<!-- Describe exactly what this runbook covers and what it does not. -->

- **Covers:** {{description of what functionality is exercised, e.g. "Create, read, edit, and delete of {{Area}} records; required-field and cross-field validation; list filtering; sync round-trip"}}
- **Out of scope:** {{anything explicitly not covered here, e.g. "CSV import → see import runbook; role-based access → see admin runbook"}}
- **Parent rows required (FK order, see `reference.md §6`):**
  <!-- List the parent entities that must exist before any test case in this area can run. Walk the FK chain root-to-leaf. -->
  1. {{parent entity, e.g. "An active Workspace"}} — create via {{how, e.g. "the Workspace area runbook or a setup helper"}}
  2. {{next parent, if any}}
- **Setup:** follow the profile setup in `reference.md §1` for the chosen profile, then {{area-specific starting point, e.g. "navigate to {{/route}}"}}.

<!-- If any entity or feature of this area is gated by a feature flag, role, or
     plan-level permission, state what must be enabled/seeded here. A missing flag
     silently leaves the UI un-rendered (see reference.md §8 gotchas). -->

---

## Tier: Smoke (~5–10 min — the critical path only)

<!-- Run this tier for any change that touches this area. One structured case
     block per case. Action verbs: goto | click | fill | select | check | expect | press | upload.
     See reference.md §7 for the verb→Playwright mapping and selector conventions. -->

### TC-{{AREA}}-S1 — create a {{entity}} (happy path)

- **Tier:** Smoke
- **Preconditions:** parent rows from Scope above exist; auto-sync/auto-refresh off (`reference.md §2`).
- **Steps:**

  | # | Action | Target (`role "name"`) | Data | Expected |
  | --- | --- | --- | --- | --- |
  | 1 | goto | `{{/route}}` | — | {{Area}} list page; no errors |
  | 2 | click | `button "New {{Area}}"` | — | URL → `{{/route}}/new`; create form visible |
  | 3 | fill | `textbox "{{Primary field label, e.g. Name}}"` | `{{example value}} {RUNID}` | value set |
  | 4 | fill | `textbox "{{Second required field}}"` | `{{example value}}` | value set |
  | 5 | click | `button "Save"` | — | success signal (toast / redirect); URL → detail or list |
  | 6 | expect | detail or list | — | new row/record `"{{example value}} {RUNID}"` visible |

- **Persistence write-proof (`reference.md §3a`):** pending-change badge / dirty indicator increments after step 3–5 → trigger write (sync button or inline save) → success signal → indicator resets to 0 or "Saved".
- **Verification Lane 1 — in-app (`reference.md §5`):** navigate to the app's data explorer or detail view → confirm `{{entity}}` row present; if the app surfaces a server-assigned ID or timestamp field, confirm it is non-null.
- **Result:** ☐ Pass ☐ Fail — Notes:

---

## Tier: Targeted (per-feature — run when this area changed)

<!-- Run this tier in addition to Smoke when the specific feature has changed.
     Never add a TC that can't also be expressed as an automated step.
     Keep only the sub-parts that exist in this area; state explicit absences for
     parts that do not exist (e.g. "soft-delete UI absent — entity uses archive flag"). -->

### TC-{{AREA}}-T1 — required-field validation blocks save

<!-- Derive the required-field set from the repo's source-of-truth (schema package,
     Zod module, OpenAPI spec, form validator — see the profile). Never eyeball the
     UI's asterisk markers; derive from the canonical required/requiredForInput flag.
     List every required field explicitly. -->

- **Tier:** Targeted
- **Preconditions:** parent rows exist; navigate to `{{/route}}/new`.
- **Required fields (derive from source-of-truth):** `{{field1}}`, `{{field2}}`, …
- **Steps:**

  | # | Action | Target (`role "name"`) | Data | Expected |
  | --- | --- | --- | --- | --- |
  | 1 | click | `button "Save"` (empty form) | — | blocked; `alert` or inline message shows `"{{field1}} is required"` (or equivalent); URL unchanged |
  | 2 | fill | every required field | valid values | — |
  | 3 | click | `button "Save"` | — | success signal; navigation away from `/new` |

- **Note:** if the save button is `disabled={!canSave}` until all required fields are valid, assert `toBeDisabled()` at step 1 instead of expecting an alert. See `reference.md §3e`.
- **Result:** ☐ Pass ☐ Fail — Notes:

---

### TC-{{AREA}}-T2 — per-field validation rules

<!-- One row per validator rule in the form's validate function. Derive from the
     source-of-truth or the form's submit handler; do not invent rules.
     Satisfy ALL required fields first so the rule under test fires, not the
     required check (see reference.md §3e for the recipe when canSave gates the button). -->

- **Tier:** Targeted
- **Preconditions:** parent rows exist; navigate to `{{/route}}/new`; all required fields pre-filled with valid values.
- **Validation rules to cover (derive from source-of-truth):**

  | # | Field | Invalid value | Expected message | Where it surfaces |
  | --- | --- | --- | --- | --- |
  | 1 | `{{field}}` | `{{invalid value, e.g. "" / "a" / -1}}` | `"{{expected error message}}"` | `alert` or inline `helperText` — confirm by reading the form source |
  | 2 | `{{field}}` (cross-field rule) | `{{value that violates the cross-field rule}}` | `"{{message}}"` | — |

- **Result:** ☐ Pass ☐ Fail — Notes:

---

### TC-{{AREA}}-T3 — edit / update

<!-- Prove that editing an existing record persists the change end-to-end.
     See reference.md §8: "In conflict / soft-delete tests, edit a field that is
     NOT part of the list-row label." Pick a field whose text is not visible
     in the list row label so the locator stays stable after the edit. -->

- **Tier:** Targeted
- **Preconditions:** a `{{entity}}` record from TC-{{AREA}}-S1 exists.
- **Steps:**

  | # | Action | Target (`role "name"`) | Data | Expected |
  | --- | --- | --- | --- | --- |
  | 1 | navigate | `{{/route}}` | — | list; find row `"{{example value}} {RUNID}"` |
  | 2 | click | `button "Edit"` (row action) | — | URL → `{{/route}}/:id/edit`; form pre-populated |
  | 3 | fill | `textbox "{{field to change}}"` | `{{updated value}}` | value set |
  | 4 | click | `button "Save"` | — | success signal; detail / list shows updated value |

- **Sync:** trigger write; observe success signal (`reference.md §3a`).
- **DB verify:** Lane 1 — app detail view shows updated `{{field to change}}` value. [Profile A/C: Lane 2 — query the data store directly.]
- **Result:** ☐ Pass ☐ Fail — Notes:

---

### TC-{{AREA}}-T4 — delete lifecycle

<!-- Keep only the sub-parts this area implements.
     Soft delete: the row disappears from the default list but persists with a
     deleted/tombstone flag. Hard delete: the row is permanently removed.
     If there is no delete UI (entity uses enable/disable instead), state that
     absence explicitly and drop this case. -->

- **Tier:** Targeted
- **Preconditions:** a `{{entity}}` record exists.
- **Steps:**

  | # | Action | Target (`role "name"`) | Data | Expected |
  | --- | --- | --- | --- | --- |
  | 1 | navigate | `{{/route}}` | — | list; row present |
  | 2 | click | `button "Delete"` (or row-action menu → `menuitem "Delete"`) | — | confirmation dialog appears |
  | 3 | click | `button "Confirm"` | — | dialog closes; row no longer visible in default list |

<!-- If soft delete: add a step to verify the tombstone flag in Lane 2/3,
     and (if the app has a "show deleted" view) verify the row appears there. -->
<!-- If NO delete UI: replace this case body with:
     "No delete UI — {{entity}} records are managed via {{enable/disable/archive}}
     instead. Soft-delete propagation is tested in TC-{{AREA}}-F2." -->

- **Sync:** trigger write; verify the tombstone propagates to the backend.
- **DB verify Lane 1:** row absent from the default list view. [Lane 2/3: `deletedAt` / `isDeleted` flag set on the remote row; row not returned by the default query.]
- **Result:** ☐ Pass ☐ Fail — Notes:

---

<!-- Add one TC per: each enum dropdown / Select, each conditional field or branch,
     list filter/sort/search, pagination, any area-specific action (e.g. archive,
     approve, duplicate). Number sequentially: T5, T6, T7, …
     Never renumber an existing ID — only append. -->

### TC-{{AREA}}-T5 — {{enum Select or conditional field}}

<!-- Example: a Type Select whose values are a fixed canonical enum (not a
     tenant-extensible code list). Derive the expected option set from the
     source-of-truth; assert it exactly (it's a closed set).
     For a backend-seeded code list, assert the Select reflects the loaded set,
     not a hard list. See reference.md §7 "Enum vs backend-seeded code-list". -->

- **Tier:** Targeted
- **Preconditions:** parent rows exist; navigate to `{{/route}}/new`.
- **Steps:**

  | # | Action | Target (`role "name"`) | Data | Expected |
  | --- | --- | --- | --- | --- |
  | 1 | click | `combobox "{{Field label}}"` | — | listbox opens; options match canonical enum values: `{{A, B, C}}` |
  | 2 | click | `option "{{option label}}"` | — | combobox shows selected label |
  | 3 | fill required fields | — | valid values | — |
  | 4 | click | `button "Save"` | — | success signal |

- **DB verify:** Lane 1 — detail view shows `"{{option label}}"`. [Lane 2/3: column stores the **code** `{{OPTION_CODE}}`, not the label.]
- **Result:** ☐ Pass ☐ Fail — Notes:

---

### TC-{{AREA}}-T6 — list filter / search

<!-- Cover at least one list filter and/or search input.
     For each, assert the filtered result set, not just that the control renders. -->

- **Tier:** Targeted
- **Preconditions:** at least two `{{entity}}` records exist with different `{{filterable field}}` values.
- **Steps:**

  | # | Action | Target (`role "name"`) | Data | Expected |
  | --- | --- | --- | --- | --- |
  | 1 | goto | `{{/route}}` | — | list shows both records |
  | 2 | fill | `textbox "Search"` (or select filter combobox `"{{filter label}}"`) | `{{value that matches only one record}}` | list narrows to the matching record only |
  | 3 | clear | the search / reset filter | — | both records visible again |

- **Result:** ☐ Pass ☐ Fail — Notes:

---

## Tier: Full (exhaustive — pre-release or pre-merge for this area)

Includes everything in Smoke + Targeted, plus the cases below. The every-field
both-ends round-trip (F1) and conflict + soft-delete propagation (F2) are
mandatory. See `reference.md §3` and `reference.md §4` for the full recipes.

---

### TC-{{AREA}}-F1 — every field round-trips: write end (upload → data store) AND read end (download → form)

<!-- The gold standard. One case, two ends. Catches mis-mapped columns, date
     parse failures, enum code/label swaps, and dropped columns.
     Derive the every-field list from the repo's source-of-truth (schema, form
     JSX, or OpenAPI) — NOT by eyeballing the rendered form. Fields the form
     does not render are "not rendered" entries in the Coverage map, not test steps.
     See reference.md §3d for the full recipe and type-mapping rules. -->

- **Tier:** Full
- **Preconditions:** parent rows exist; write/download capable (sync configured).
- **Every user-input field (derive from source-of-truth — list all):**
  `{{field1}}`, `{{field2}}`, `{{dateField}}`, `{{enumField}}`, `{{numericField}}`, …

**Step A — Fill every field and write:**

  | # | Action | Target (`role "name"`) | Data (distinct value per field) | Expected |
  | --- | --- | --- | --- | --- |
  | 1 | goto | `{{/route}}/new` | — | empty form |
  | 2 | fill | `textbox "{{field1}}"` | `"{{unique text A}} {RUNID}"` | value set |
  | 3 | fill / click | `{{date control "{{dateField}}"}}`  | `{{yyyy-MM-dd}}` | date shown |
  | 4 | click | `combobox "{{enumField}}"` → `option "{{label}}"` | — | label shown |
  | 5 | fill | `spinbutton "{{numericField}}"` | `{{distinct number, e.g. 42.5}}` | value set |
  | … | fill remaining fields | every user-input field | distinct values | values set |
  | N | click | `button "Save"` | — | success signal |
  | N+1 | trigger write | sync / inline save | — | write success signal |

**End 1 — data store (after write):**
Navigate to the app's data explorer or query the data store (Lane 2/3).
Assert every stored column equals the entered value. Mind type mappings
(`reference.md §5`): enums store the **code**, not the label; dates need
format extraction; numbers come back as numbers; JSON columns need `JSON.parse`.

  | Column | Entered value | Expected stored value | Type mapping |
  | --- | --- | --- | --- |
  | `{{column1}}` | `"{{unique text A}} {RUNID}"` | same string | — |
  | `{{dateColumn}}` | `{{yyyy-MM-dd}}` | `{{yyyy-MM-dd}}` (extract date part) | date-cast |
  | `{{enumColumn}}` | label `"{{label}}"` | code `"{{ENUM_CODE}}"` | enum code |
  | `{{numericColumn}}` | `42.5` | `42.5` | number |

**Step B — Reset local state and download:**
Use the app's data-clear action (or harness `resetLocalAndRelogin`) to wipe
local state while the remote row remains. Trigger a sync / page refresh to
pull from the server (`reference.md §3b`).

**End 2 — form (after download):**
Navigate to `{{/route}}/:id/edit`. Assert every field shows what was entered.

  | Field | Expected form value |
  | --- | --- |
  | `textbox "{{field1}}"` | `"{{unique text A}} {RUNID}"` |
  | `{{dateField}}` (group spinbuttons) | Year `{{YYYY}}`, Month `{{MM}}`, Day `{{DD}}` |
  | `combobox "{{enumField}}"` | label `"{{label}}"` |
  | `spinbutton "{{numericField}}"` | `42.5` |

- **Result:** ☐ Pass ☐ Fail — Notes:

---

### TC-{{AREA}}-F2 — sync conflict + soft-delete propagation

<!-- Requires a second browser profile/context (isolated storage). See reference.md §3c.
     If this area has no delete UI (entities managed by enable/disable), the
     soft-delete half is absent — state that explicitly in the steps. -->

- **Tier:** Full
- **Preconditions:** one `{{entity}}` record `R` exists and has been synced to the server (no pending changes); two profile contexts available.

**Conflict:**

  | # | Who | Action | Expected |
  | --- | --- | --- | --- |
  | 1 | Profile 1 | edit `R`, field `"{{conflict field}}"` → `"P1 {RUNID}"` | NOT synced yet |
  | 2 | Profile 2 | edit `R`, same field → `"P2 {RUNID}"` | sync → server holds `"P2"` |
  | 3 | Profile 1 | sync | conflict signal visible (the app's conflict indicator — count badge, log entry, snackbar) |
  | 4 | both | observe resolution | resolution matches the entity's stated policy (record observed behaviour; if unclear, raise as a finding) |

**Soft-delete propagation:**

  | # | Who | Action | Expected |
  | --- | --- | --- | --- |
  | 5 | Profile 1 | delete `R`; sync | `R` absent from Profile 1 list; tombstone set on server |
  | 6 | Profile 2 | sync / refresh | `R` disappears from Profile 2 list |

<!-- If no delete UI: replace soft-delete steps with:
     "Soft-delete propagation absent — {{entity}} has no delete UI (see TC-{{AREA}}-T4)." -->

- **Result:** ☐ Pass ☐ Fail — Notes:

---

### TC-{{AREA}}-F3 — edge cases: boundary values, FK integrity, special characters, large inputs

<!-- Add edge cases specific to this area. Common candidates:
     - Boundary values: minimum/maximum field lengths, numeric extremes.
     - Special characters in text fields (apostrophes, ampersands, emojis).
     - FK integrity: what happens when a parent row is deleted while a child exists.
     - Concurrent create: two tabs create the same unique-keyed record.
     - Empty list state: the area with zero records shows the correct empty-state UI.
     State the ones that do NOT apply as "absent:<reason>". -->

- **Tier:** Full
- **Cases to cover (add/remove rows as applicable):**

  | # | Scenario | Setup | Action | Expected |
  | --- | --- | --- | --- | --- |
  | 1 | {{field}} at maximum length | fill `{{field}}` with `{{maxLength}}` chars | save | saves; no truncation |
  | 2 | {{field}} exceeds maximum | fill `{{field}}` with `{{maxLength + 1}}` chars | save | blocked with `"{{message}}"` |
  | 3 | Special chars in `{{field}}` | fill with `O'Brien & Co. <test>` | save + round-trip | stored and displayed verbatim |
  | 4 | Empty list state | no records in this area | navigate to `{{/route}}` | empty-state message visible; no errors |

- **Result:** ☐ Pass ☐ Fail — Notes:

---

## Coverage map

<!-- Populate AFTER drafting all test cases (Phase 4 — Reconcile, see discovery.md).
     Every ledger item discovered in Phase 2 must appear here with a final status.
     Zero "uncovered" rows to ship (uncovered items block completion).

     Status values:
       TC-{{AREA}}-S1              — covered by one or more test cases (list all TC IDs)
       absent:<reason>             — confirmed non-existent in the current app (cite evidence)
       deferred:<user-ref>         — user-approved deferral (ref conversation/issue/date)

     Never mark anything "uncovered" in the shipped runbook.
     Never unilaterally defer — ask the user first (see SKILL.md non-negotiables).

     ALL 8 ledger types must be represented (route, field, rule, branch, action, state, list, column).
     Add a `branch:` row for every conditional render, role-gated sub-form, or status-variant field. -->

| Ledger key | TC IDs / Status |
| --- | --- |
| `route:{{/route}}` | TC-{{AREA}}-S1 |
| `route:{{/route}}/new` | TC-{{AREA}}-S1, TC-{{AREA}}-T1 |
| `route:{{/route}}/:id/edit` | TC-{{AREA}}-T3, TC-{{AREA}}-F1 |
| `field:{{entity}}.{{primaryField}}` | TC-{{AREA}}-T1, TC-{{AREA}}-T2, TC-{{AREA}}-F1 |
| `field:{{entity}}.{{enumField}}` | TC-{{AREA}}-T5, TC-{{AREA}}-F1 |
| `rule:{{entity}}.{{primaryField}}.required` | TC-{{AREA}}-T1 |
| `rule:{{entity}}.{{field}}.{{ruleName}}` | TC-{{AREA}}-T2 |
| `branch:{{entity}}.{{trigger}}={{value}}` | TC-{{AREA}}-T5 |
| `action:{{entity}}.create` | TC-{{AREA}}-S1 |
| `action:{{entity}}.edit` | TC-{{AREA}}-T3 |
| `action:{{entity}}.delete` | TC-{{AREA}}-T4 |
| `state:{{entity}}.created→deleted` | TC-{{AREA}}-T4, TC-{{AREA}}-F2 |
| `list:{{entity}}.search` | TC-{{AREA}}-T6 |
| `column:{{Entity}}.{{PrimaryColumn}}` | TC-{{AREA}}-F1 |
| `column:{{Entity}}.{{EnumColumn}}` | TC-{{AREA}}-F1 |
| <!-- add rows for every ledger item discovered in Phase 2 --> | |

<!-- Example of absent and deferred rows (delete these examples when filling in):
| `list:{{entity}}.pagination` | absent:list always returns all rows (< 50 typical; no pager rendered) |
| `field:{{entity}}.legacyRef` | deferred:approved 2026-06-19 #issue-301 (field present in schema but not rendered in form) |
-->

---

## Field reference

<!-- Derive from the repo's source-of-truth (schema package, OpenAPI spec, Zod
     module, or form JSX — see the profile). DO NOT hand-write or invent.
     List every user-input field exposed by the form(s) in this area.
     For enum values: list canonical options for a fixed enum; note "backend code
     list — tenant-extensible" for a codes table.
     Update this table whenever the source-of-truth changes (re-derive, don't patch). -->

| Field (label) | Control | Required | Enum values / bounds | Notes |
| --- | --- | --- | --- | --- |
| `{{Primary field label}}` | `textbox` | yes | maxLength {{n}} | — |
| `{{Date field label}}` | date picker (`group`) | {{yes/no}} | valid date | Fill: click Year spinbutton → type 8 digits |
| `{{Enum field label}}` | `combobox` | {{yes/no}} | `{{A}}` / `{{B}}` / `{{C}}` (canonical enum — fixed set) | Stores code; displays label |
| `{{Code-list field label}}` | `combobox` | {{yes/no}} | backend code list — tenant-extensible | Options: `"CODE - Label"` format; select by code prefix |
| `{{Numeric field label}}` | `spinbutton` | {{yes/no}} | {{min}}–{{max}} | — |
| `{{Optional text field}}` | `textbox` | no | maxLength {{n}} | — |

---

## Testability gaps (Playwright)

<!-- Elements lacking a stable accessible name, with the proposed app fix.
     Flag these during discovery; fix the APP (aria-label / data-testid), not the
     test (nth-child / CSS selector). See reference.md §7 "Testability gaps". -->

| Element | Where | Gap | Proposed app fix |
| --- | --- | --- | --- |
| `{{icon button or Select}}` | `{{TC-{{AREA}}-T5, step 1}}` | no accessible name (`combobox [ref=…]` with no name in failure snapshot) | wire an accessible name to the control — an `aria-label` or an associated label; see `reference.md` §7/§8 for your component library's pattern |

<!-- If no gaps found, replace the table row with:
     "None identified — all interactive elements have stable accessible names." -->

---

## Known-fragile / recent changes

<!-- Flag any area with recent churn, historical regressions, or production
     incidents so testers look harder and reviewers pay closer attention.
     Examples: a form that had a soft-delete bug fixed, a field that was recently
     renamed, a validation rule that was loosened in a hotfix. -->

- {{YYYY-MM-DD — describe the fragile area, what changed, and which TCs exercise it most.}}

<!-- If no known fragile areas, replace with: "No known fragile areas at time of writing." -->

---

## Self-improving log (harness finds)

<!-- One dated entry per real defect the harness surfaced for this area.
     When the automated run finds an APP bug (not a test bug), fix the app, add a
     regression test, and record it here. Test-only corrections worth remembering
     go here too (e.g. a locator that was wrong and why).
     Format: date — what the harness caught, root cause, the fix, the manual check
     to confirm. See SKILL.md Phase 6 for the full self-improve workflow. -->

- {{YYYY-MM-DD — what the harness caught; root cause; the fix applied; the verification step that confirms it.}}

<!-- When the log is empty, replace with: "(none yet — first run)" -->

---

## After the run — feed learnings back into the skill

**Last step of every run.** Once the run is green (or every failure triaged):

1. **Repo-specific lesson** → update the repo's profile
   (`.claude/regression-runbooks/profile.md`) and this runbook's Self-improving
   log (above).
2. **Generalizable lesson** → update **both targets**:
   - The global sidecar: `~/.claude/regression-runbooks/lessons.md` (always
     reachable regardless of repo).
   - The plugin git source: edit `reference.md` (and/or `SKILL.md`) in the
     plugin repo, commit, and bump `plugin.json` version (when the plugin source
     is reachable from this session).
   - If neither is reachable, record the lesson inline and note it must be
     propagated.
3. **No generalization:** if nothing new generalizes, record "skill reviewed,
   no change" in the Run record above.

Why this matters: the skill compounds — a gotcha recorded after this area's run
saves time on every subsequent area and every subsequent repo that runs this
plugin. Each area should be cheaper than the last.
