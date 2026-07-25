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

- **Covers:** {{description of what functionality is exercised, e.g. "Create, read, edit, and delete of {{Area}} records; required-field and cross-field validation; list filtering; the persistence round-trip"}}
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

<!-- MANDATORY plain-English block. Two lines, everyday words, no jargon:
     what a person is doing, and what breaks for a real user if it fails.
     A non-technical tester reads this and nothing else to know why they care. -->

> **In plain English:** {{what you are doing, in one sentence a non-technical
> tester understands}}.
> **If this fails:** {{what a real user loses — the consequence, not the mechanism}}.

- **Tier:** Smoke
- **Preconditions:** parent rows from Scope above exist.
  <!-- Offline-first / eventual-consistency apps ONLY: also disable auto-sync /
       auto-refresh (`reference.md §2`) so a background tick can't fire between the
       mutation and the assertion. Online-CRUD apps: delete this note. -->
- **Steps:**

  <!-- The `Expected` column is the CONTRACT the spec is generated from — element
       roles, DB columns, exact error strings, `exact:`/`.first()` notes. Never
       reword it to read more nicely. `In plain English` is the same condition for
       a human; both must hold for the step to pass. -->

  | # | Action | Target (`role "name"`) | Data | Expected | In plain English |
  | --- | --- | --- | --- | --- | --- |
  | 1 | goto | `{{/route}}` | — | {{Area}} list page; no errors | The {{Area}} list opens. |
  | 2 | click | `button "New {{Area}}"` | — | URL → `{{/route}}/new`; create form visible | A blank create form appears. |
  | 3 | fill | `textbox "{{Primary field label, e.g. Name}}"` | `{{example value}} {RUNID}` | value set | Type a name — include your run tag so you can find it again. |
  | 4 | fill | `textbox "{{Second required field}}"` | `{{example value}}` | value set | Fill in the other required field. |
  | 5 | click | `button "Save"` | — | success signal (toast / redirect); URL → detail or list | Save it; you get a confirmation. |
  | 6 | expect | detail or list | — | new row/record `"{{example value}} {RUNID}"` visible | Your new record is in the list. |

- **Persistence write-proof (`reference.md §3a`) — use the row for this app's architecture (Phase 1):**
  - **Online CRUD:** the server's success signal (toast / redirect / result panel) **plus** the
    list or detail re-fetch showing the change. There is no sync step and no dirty badge.
  - **Offline-first / sync:** pending-change badge increments after steps 3–5 → trigger the write
    (sync button or inline save) → success signal → indicator resets to 0 or "Saved".
  - **Realtime / push:** the success signal **plus** a second open session converging without a reload.
  - **Eventual consistency:** the success signal **plus** a poll-until-consistent read-back (`expect.poll`).
- **Verification Lane 1 — in-app (`reference.md §5`):** navigate to the app's data explorer or detail view → confirm `{{entity}}` row present; if the app surfaces a server-assigned ID or timestamp field, confirm it is non-null.
- **Result:** ☐ Pass ☐ Fail — Notes:

---

## Tier: Targeted (per-feature — run when this area changed)

<!-- Run this tier in addition to Smoke when the specific feature has changed.
     Never add a TC that can't also be expressed as an automated step.
     Keep only the sub-parts that exist in this area.

     EVERY case below takes the same two mandatory human elements as TC-S1:
       1. The `> **In plain English:** … / **If this fails:** …` block under the
          heading — what you're doing, and what a real user loses if it breaks.
       2. The `In plain English` column on the step table, ALONGSIDE `Expected`
          (never replacing or softening it — `Expected` is the spec's contract).

     ABSENCES: a sub-part that does not exist in this app is recorded as a single
     `absent:<reason>` row in the Coverage map — NOT as a case heading whose body
     explains why it doesn't apply. Delete the heading; the ID retires unused. -->


### TC-{{AREA}}-T1 — required-field validation blocks save

<!-- Derive the required-field set from the repo's source-of-truth (schema package,
     Zod module, OpenAPI spec, form validator — see the profile). Never eyeball the
     UI's asterisk markers; derive from the canonical required/requiredForInput flag.
     List every required field explicitly. -->

- **Tier:** Targeted
- **Preconditions:** parent rows exist; navigate to `{{/route}}/new`.
- **Required fields (derive from source-of-truth):** `{{field1}}`, `{{field2}}`, …
- **Steps:**

  | # | Action | Target (`role "name"`) | Data | Expected | In plain English |
  | --- | --- | --- | --- | --- | --- |
  | 1 | click | `button "Save"` (empty form) | — | blocked; `alert` or inline message shows `"{{field1}} is required"` (or equivalent); URL unchanged | Try to save an empty form — it refuses and tells you which field is missing. |
  | 2 | fill | every required field | valid values | — | Now fill in everything that's required. |
  | 3 | click | `button "Save"` | — | success signal; navigation away from `/new` | It saves and moves you on. |

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

  | # | Field | Invalid value | Expected message | Where it surfaces | In plain English |
  | --- | --- | --- | --- | --- | --- |
  | 1 | `{{field}}` | `{{invalid value, e.g. "" / "a" / -1}}` | `"{{expected error message}}"` | `alert` or inline `helperText` — confirm by reading the form source | {{why this value is wrong and what the user should be told}} |
  | 2 | `{{field}}` (cross-field rule) | `{{value that violates the cross-field rule}}` | `"{{message}}"` | — | {{the rule in one sentence, e.g. "the end date can't be before the start date"}} |

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

  | # | Action | Target (`role "name"`) | Data | Expected | In plain English |
  | --- | --- | --- | --- | --- | --- |
  | 1 | navigate | `{{/route}}` | — | list; find row `"{{example value}} {RUNID}"` | Find the record you made earlier. |
  | 2 | click | `button "Edit"` (row action) | — | URL → `{{/route}}/:id/edit`; form pre-populated | Open it for editing — the form already has its current values. |
  | 3 | fill | `textbox "{{field to change}}"` | `{{updated value}}` | value set | Change one field. |
  | 4 | click | `button "Save"` | — | success signal; detail / list shows updated value | Save; the new value is shown. |

- **Write-proof:** whichever row of the S1 architecture list applies (`reference.md §3a`) — for an
  online-CRUD app that is simply the success signal plus the re-fetch; there is no sync step.
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

  | # | Action | Target (`role "name"`) | Data | Expected | In plain English |
  | --- | --- | --- | --- | --- | --- |
  | 1 | navigate | `{{/route}}` | — | list; row present | Find the record in the list. |
  | 2 | click | `button "Delete"` (or row-action menu → `menuitem "Delete"`) | — | confirmation dialog appears | Click Delete; you're asked to confirm. |
  | 3 | click | `button "Confirm"` | — | dialog closes; row no longer visible in default list | Confirm; it disappears from the list. |

<!-- If soft delete: add a step to verify the tombstone flag in Lane 2/3,
     and (if the app has a "show deleted" view) verify the row appears there. -->
<!-- If NO delete UI: replace this case body with:
     "No delete UI — {{entity}} records are managed via {{enable/disable/archive}}
     instead. Soft-delete propagation is tested in TC-{{AREA}}-F2." -->

- **Write-proof:** the delete's success signal + the row leaving the list. (Offline-first only:
  also sync and verify the tombstone propagates to the backend — delete this clause otherwise.)
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

  | # | Action | Target (`role "name"`) | Data | Expected | In plain English |
  | --- | --- | --- | --- | --- | --- |
  | 1 | click | `combobox "{{Field label}}"` | — | listbox opens; options match canonical enum values: `{{A, B, C}}` | Open the dropdown — the choices offered are exactly the ones expected, no more and no fewer. |
  | 2 | click | `option "{{option label}}"` | — | combobox shows selected label | Pick one; it shows as selected. |
  | 3 | fill required fields | — | valid values | — | Fill in whatever else is required. |
  | 4 | click | `button "Save"` | — | success signal | Save; you get a confirmation. |

- **DB verify:** Lane 1 — detail view shows `"{{option label}}"`. [Lane 2/3: column stores the **code** `{{OPTION_CODE}}`, not the label.]
- **Result:** ☐ Pass ☐ Fail — Notes:

---

### TC-{{AREA}}-T6 — list filter / search

<!-- Cover at least one list filter and/or search input.
     For each, assert the filtered result set, not just that the control renders. -->

- **Tier:** Targeted
- **Preconditions:** at least two `{{entity}}` records exist with different `{{filterable field}}` values.
- **Steps:**

  | # | Action | Target (`role "name"`) | Data | Expected | In plain English |
  | --- | --- | --- | --- | --- | --- |
  | 1 | goto | `{{/route}}` | — | list shows both records | Open the list; both records are there. |
  | 2 | fill | `textbox "Search"` (or select filter combobox `"{{filter label}}"`) | `{{value that matches only one record}}` | list narrows to the matching record only | Search for something only one of them matches — only that one is left. |
  | 3 | clear | the search / reset filter | — | both records visible again | Clear the search; both come back. |

- **Result:** ☐ Pass ☐ Fail — Notes:

---

## Tier: Full (exhaustive — pre-release or pre-merge for this area)

Includes everything in Smoke + Targeted, plus the cases below.

- **F1 (every-field both-ends round-trip) is mandatory** wherever the area
  persists user input. If it persists none — a read-only screen, a list, a
  session — there is nothing to round-trip: **delete F1** and record it as a
  `roundtrip:*` row in the Coverage map with the reason. Keep the ID only if it
  holds a real test, and retitle it to what that test actually checks.
- **F2 is architecture-selected, not fixed** (Phase 1). Write the variant that
  matches this app and delete the rest; if the area has no concurrency surface,
  delete the case and record it once in the Coverage map.

See `reference.md §3` and `reference.md §4` for the full recipes.

---

### TC-{{AREA}}-F1 — every field round-trips: write end (upload → data store) AND read end (download → form)

<!-- The gold standard. One case, two ends. Catches mis-mapped columns, date
     parse failures, enum code/label swaps, and dropped columns.
     Derive the every-field list from the repo's source-of-truth (schema, form
     JSX, or OpenAPI) — NOT by eyeballing the rendered form. Fields the form
     does not render are "not rendered" entries in the Coverage map, not test steps.
     See reference.md §3d for the full recipe and type-mapping rules. -->

> **In plain English:** fill in **every** box on the form with a different value,
> then check each one saved correctly *and* comes back correctly when you reopen it.
> **If this fails:** one field silently doesn't save, or two get swapped — the kind
> of data loss nobody notices until it matters.

- **Tier:** Full
- **Preconditions:** parent rows exist; the app can write and read back.
- **Every user-input field (derive from source-of-truth — list all):**
  `{{field1}}`, `{{field2}}`, `{{dateField}}`, `{{enumField}}`, `{{numericField}}`, …

**Step A — Fill every field and write:**

  | # | Action | Target (`role "name"`) | Data (distinct value per field) | Expected | In plain English |
  | --- | --- | --- | --- | --- | --- |
  | 1 | goto | `{{/route}}/new` | — | empty form | Open a blank create form. |
  | 2 | fill | `textbox "{{field1}}"` | `"{{unique text A}} {RUNID}"` | value set | Type a distinct value — give every field a *different* one so a swapped column shows up. |
  | 3 | fill / click | `{{date control "{{dateField}}"}}`  | `{{yyyy-MM-dd}}` | date shown | Pick a date. |
  | 4 | click | `combobox "{{enumField}}"` → `option "{{label}}"` | — | label shown | Choose an option from the dropdown. |
  | 5 | fill | `spinbutton "{{numericField}}"` | `{{distinct number, e.g. 42.5}}` | value set | Enter a number. |
  | … | fill remaining fields | every user-input field | distinct values | values set | Fill in **everything else on the form** — no field left blank. |
  | N | click | `button "Save"` | — | success signal | Save; you get a confirmation. |

  <!-- Offline-first / sync ONLY: add a final row that triggers the write
       (`| N+1 | trigger write | sync | — | write success signal | Sync it to the server. |`).
       Online-CRUD apps: the save IS the write — do not add it. -->


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

**Step B — Discard what the client is holding, then read back from the server:**
The point is to prove the **pull** path, so the read-back must not be served from
anything the write left in memory (`reference.md §3b`).

- **Online CRUD:** reload the page (or navigate away and back) so the client
  re-fetches, then reopen the record. There is no local store to clear.
- **Offline-first / sync:** use the app's data-clear action (or harness
  `resetLocalAndRelogin`) to wipe local state while the remote row remains, then
  trigger a sync to pull server state into the empty local store.
- **Eventual consistency:** reload, then poll until the read model catches up.

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

### TC-{{AREA}}-F2 — concurrency & durability (**architecture-selected — see Phase 1**)

<!-- ############################################################################
     THIS SLOT IS NOT ONE FIXED CASE. Write the variant matching the app's
     persistence architecture, and DELETE the others.

     If the app has NO concurrency surface here at all — a singleton row only one
     role can write, a create-only screen, a caller-scoped personal setting —
     then DELETE THIS WHOLE CASE. Do not keep it as "Absent — online CRUD".
     Record it once instead, in the Coverage map:

       | `concurrency:{{entity}}` | absent:<why — e.g. one admin-only row, last-write-wins,
                                   no offline store, so no sync-conflict or tombstone path> |

     A heading whose body only explains why it doesn't apply is a phantom test.
     The ID is retired, not reused (reference.md §9).
     ############################################################################ -->

> **In plain English:** {{what two people doing things at once looks like here}}.
> **If this fails:** {{whose work gets silently lost or overwritten}}.

- **Tier:** Full

**Variant A — offline-first / sync** (requires a second browser profile/context with isolated
storage; see `reference.md §3c`). Preconditions: record `R` exists and is synced (no pending changes).

  | # | Who | Action | Expected | In plain English |
  | --- | --- | --- | --- | --- |
  | 1 | Profile 1 | edit `R`, field `"{{conflict field}}"` → `"P1 {RUNID}"` | NOT synced yet | Change it as person 1, but don't sync. |
  | 2 | Profile 2 | edit `R`, same field → `"P2 {RUNID}"` | sync → server holds `"P2"` | Person 2 changes the same thing and syncs first. |
  | 3 | Profile 1 | sync | conflict signal visible (the app's conflict indicator — count badge, log entry, snackbar) | Person 1 syncs and is told there's a clash. |
  | 4 | both | observe resolution | resolution matches the entity's stated policy (record observed behaviour; if unclear, raise as a finding) | Whoever's version wins, it matches the documented rule. |
  | 5 | Profile 1 | delete `R`; sync | `R` absent from Profile 1 list; tombstone set on server | Deleting it removes it for person 1 and marks it deleted on the server. |
  | 6 | Profile 2 | sync / refresh | `R` disappears from Profile 2 list | It disappears for person 2 too. |

**Variant B — online CRUD.** There is no sync, local store or tombstone. Test the app's *real*
contention guard, and only if one exists: a unique-key **409**, an already-actioned **409**, a
last-write-wins column, an optimistic-concurrency token, or a delete racing a background worker.
If the guard is already covered by a Targeted/F3 case, **delete this case** and point the
`concurrency:*` coverage row at that case instead of duplicating it.

**Variant C — realtime / push.** Concurrency shows up as *convergence*: with two sessions open on
the same screen, a change made in session 1 must appear in session 2 **without a reload**. Assert
the second session's UI, not a sync indicator.

**Variant D — eventual consistency.** The write succeeds before the read model catches up. Assert
poll-until-consistent (`expect.poll`) and that the UI shows an honest interim state rather than
stale data presented as current.

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

  | # | Scenario | Setup | Action | Expected | In plain English |
  | --- | --- | --- | --- | --- | --- |
  | 1 | {{field}} at maximum length | fill `{{field}}` with `{{maxLength}}` chars | save | saves; no truncation | The longest allowed value saves without being silently cut short. |
  | 2 | {{field}} exceeds maximum | fill `{{field}}` with `{{maxLength + 1}}` chars | save | blocked with `"{{message}}"` | One character too many is refused, with a message saying so. |
  | 3 | Special chars in `{{field}}` | fill with `O'Brien & Co. <test>` | save + round-trip | stored and displayed verbatim | Apostrophes, ampersands and angle brackets come back exactly as typed. |
  | 4 | Empty list state | no records in this area | navigate to `{{/route}}` | empty-state message visible; no errors | A brand-new, empty area shows a friendly message rather than a broken page. |

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
