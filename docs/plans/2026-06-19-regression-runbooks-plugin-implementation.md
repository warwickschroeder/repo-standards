# Regression Runbooks Plugin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a repo-agnostic `regression-runbooks` Claude Code plugin — hosted as a marketplace in `warwickschroeder/repo-standards` — that exhaustively explores any web-app area and writes tiered regression runbooks, self-improving after every run.

**Architecture:** A marketplace at the repo root exposes one plugin under `plugins/regression-runbooks`. The plugin ships a single skill whose files encode a 6-phase workflow (Profile → Discover → Write → Reconcile → Automate → Self-improve). Repo-specific facts are discovered once into `<repo>/.claude/regression-runbooks/profile.md`; generic methodology + a generalizable gotcha catalogue live in the plugin; cross-repo lessons accumulate in `~/.claude/regression-runbooks/lessons.md` and (when reachable) in the plugin git source.

**Tech Stack:** Claude Code plugin/marketplace manifests (JSON), Skill markdown (YAML frontmatter + body). No runtime code. Source skill to generalize: `C:\F\Forge.LiveLogging.Application.Web\.claude\skills\regression-runbooks\` (`SKILL.md`, `reference.md`, `template.md`).

## Global Constraints

- Plugin name: `regression-runbooks`. Marketplace owner: `warwickschroeder`. Host repo: `C:\W\repo-standards` (public; remote `warwickschroeder/repo-standards`).
- Plugin root: `C:\W\repo-standards\plugins\regression-runbooks\`. Skill root: `…\plugins\regression-runbooks\skills\regression-runbooks\`.
- **Do NOT commit or create branches** — the user chose "don't commit yet" this session. No `git` mutations in any task. (A final task notes the deferred-commit handoff.)
- **Web apps, any FE stack only** — no API-only/CLI/desktop content.
- **Target scope = generic.** No DrillLogify-specific names may appear in plugin files. Banned substrings (case-insensitive) in every plugin file: `drilllogify`, `schema-contract`, `forgesoftware`, `sql server`, `mssql`, `test:e2e:harness`, `UiMeta`, `canonicalRequiredFields`. (These are repo-specific; their *generic* equivalents are "source-of-truth", "verification lane", "the repo's e2e harness".)
- **Skill frontmatter** must be `name:` + `description:` only, matching the folder name `regression-runbooks`.
- Self-improvement targets are fixed: per-repo → `<repo>/.claude/regression-runbooks/profile.md` + the runbook's log; generalizable → `~/.claude/regression-runbooks/lessons.md` (always) + plugin git source (when reachable).
- Coverage-ledger item types are fixed: `route`, `field`, `rule`, `branch`, `action`, `state`, `list`, `column`.

---

## File Structure

Files created by this plan (all under `C:\W\repo-standards\`):

- `.claude-plugin/marketplace.json` — marketplace manifest listing the plugin.
- `plugins/regression-runbooks/.claude-plugin/plugin.json` — plugin manifest.
- `plugins/regression-runbooks/README.md` — what the plugin is + install steps.
- `plugins/regression-runbooks/skills/regression-runbooks/SKILL.md` — lean entrypoint: 6-phase workflow, non-negotiables, pointers.
- `plugins/regression-runbooks/skills/regression-runbooks/discovery.md` — exhaustive discovery procedure + coverage-ledger schema + reconciliation gate.
- `plugins/regression-runbooks/skills/regression-runbooks/reference.md` — generic mechanics (profiles, verification lanes, FK order, selector conventions) + the generalizable gotcha catalogue.
- `plugins/regression-runbooks/skills/regression-runbooks/template-runbook.md` — framework-neutral per-area runbook template (incl. the coverage-map section).
- `plugins/regression-runbooks/skills/regression-runbooks/template-profile.md` — per-repo profile skeleton.

Reference-only (NOT created/modified — read for porting): the three DrillLogify source files above.

---

### Task 1: Marketplace + plugin manifests + skeleton

**Files:**
- Create: `C:\W\repo-standards\.claude-plugin\marketplace.json`
- Create: `C:\W\repo-standards\plugins\regression-runbooks\.claude-plugin\plugin.json`

**Interfaces:**
- Produces: a marketplace named `repo-standards` with one plugin entry `{name: "regression-runbooks", source: "./plugins/regression-runbooks"}`; a plugin manifest `{name: "regression-runbooks", version: "0.1.0"}`. Later tasks add skill files under that plugin; the validation task (Task 8) loads this marketplace.

- [ ] **Step 1: Define the validation check (write it first)**

Create the expected check so it fails before the files exist. Run:
```bash
cd /c/W/repo-standards && jq -e '.plugins[] | select(.name=="regression-runbooks")' .claude-plugin/marketplace.json && jq -e '.name=="regression-runbooks" and (.version|type=="string")' plugins/regression-runbooks/.claude-plugin/plugin.json
```
Expected now: FAIL (files do not exist).

- [ ] **Step 2: Create the marketplace manifest**

`C:\W\repo-standards\.claude-plugin\marketplace.json`:
```json
{
  "name": "repo-standards",
  "owner": {
    "name": "Warwick Schroeder",
    "url": "https://github.com/warwickschroeder"
  },
  "plugins": [
    {
      "name": "regression-runbooks",
      "source": "./plugins/regression-runbooks",
      "description": "Exhaustively explore any web-app area and write tiered regression runbooks (manual + automated), self-improving after every run.",
      "category": "testing",
      "keywords": ["testing", "e2e", "regression", "runbooks", "qa"]
    }
  ]
}
```

- [ ] **Step 3: Create the plugin manifest**

`C:\W\repo-standards\plugins\regression-runbooks\.claude-plugin\plugin.json`:
```json
{
  "name": "regression-runbooks",
  "version": "0.1.0",
  "description": "Exhaustively explore a web-app area and author tiered regression runbooks that drive manual and automated testing, deriving every field from the repo's source-of-truth and verifying persistence. Self-improves after every run.",
  "author": {
    "name": "Warwick Schroeder",
    "url": "https://github.com/warwickschroeder"
  },
  "homepage": "https://github.com/warwickschroeder/repo-standards",
  "repository": "https://github.com/warwickschroeder/repo-standards",
  "license": "MIT",
  "keywords": ["testing", "e2e", "regression", "runbooks", "qa", "playwright"]
}
```

- [ ] **Step 4: Run the validation check**

Run the Step 1 command again.
Expected: prints the matched plugin JSON object and `true` (both `jq -e` succeed, exit 0).

- [ ] **Step 5: Confirm valid JSON shape**

Run:
```bash
cd /c/W/repo-standards && jq empty .claude-plugin/marketplace.json plugins/regression-runbooks/.claude-plugin/plugin.json && echo OK
```
Expected: `OK` (no parse errors).

---

### Task 2: SKILL.md — the lean entrypoint

**Files:**
- Create: `C:\W\repo-standards\plugins\regression-runbooks\skills\regression-runbooks\SKILL.md`

**Interfaces:**
- Consumes: the marketplace/plugin from Task 1.
- Produces: the skill entrypoint. References sibling files `discovery.md`, `reference.md`, `template-runbook.md`, `template-profile.md` (created in Tasks 3–6). Defines the 6 phase names used everywhere: `Profile`, `Discover`, `Write`, `Reconcile`, `Automate`, `Self-improve`.

- [ ] **Step 1: Define the validation check (write it first)**

Run (fails until the file exists with required content):
```bash
cd /c/W/repo-standards/plugins/regression-runbooks/skills/regression-runbooks && \
  f=SKILL.md && \
  head -4 "$f" | grep -q '^name: regression-runbooks$' && \
  head -4 "$f" | grep -q '^description:' && \
  grep -q 'Profile' "$f" && grep -q 'Discover' "$f" && grep -q 'Reconcile' "$f" && \
  grep -q 'Self-improve' "$f" && grep -q 'discovery.md' "$f" && grep -q 'reference.md' "$f" && \
  grep -q 'template-runbook.md' "$f" && grep -q 'template-profile.md' "$f" && \
  ! grep -Eiq 'drilllogify|schema-contract|forgesoftware|mssql|test:e2e:harness|UiMeta' "$f" && echo PASS
```
Expected now: no `PASS` (file missing).

- [ ] **Step 2: Write SKILL.md**

Author the file with this structure (frontmatter then body). Description must be third-person and trigger-rich, e.g.:
> `Use when creating, updating, or running an exhaustive per-area regression runbook for a web app — discovering all functionality (routes, fields, validation, branches, actions, states, lists), writing tiered manual+automated cases, verifying persistence, and self-improving after every run.`

Body sections (port and generalize from the DrillLogify `SKILL.md`, stripping all repo specifics):
1. **Overview** — a runbook is the single source of truth for testing one area, run three ways (manual local / automated / manual on a second env); every case is human-runnable AND automatable; the safety net is the full round-trip (UI + persistence).
2. **When to use** — authoring/updating/running an area runbook.
3. **The 6-phase workflow** — one short paragraph each: **Profile** (once per repo → `discovery.md` + `template-profile.md`), **Discover** (parallel agents → coverage ledger, `discovery.md`), **Write** (tiers from `template-runbook.md`), **Reconcile** (ledger → ≥1 TC gate), **Automate** (generate spec against the repo harness; triage test-bug/app-bug/flake), **Self-improve** (dual target).
4. **Non-negotiables** — copy §7 of the design doc verbatim-in-spirit: tri-purpose; persistence in every mutation case; Full tier carries every-field both-ends round-trip + per-field validation; verify via a lane; derive from source-of-truth; stable `TC-<AREA>-<TIER><n>` IDs; **never defer/descope unilaterally — ask the user**; every run is a maintenance pass.
5. **Quick reference** table — where to find: profiles/lanes → `reference.md`; discovery + ledger → `discovery.md`; gotchas → `reference.md`; templates → the two template files.
6. **Common mistakes** — generalized list (UI-only cases that skip persistence; a "Full" tier checking only a few fields or only the write half; brittle selectors; fixed sleeps; renumbering IDs; not diffing against legacy test docs).

Keep it lean (target < 200 lines); push heavy detail to `discovery.md`/`reference.md`.

- [ ] **Step 3: Run the validation check**

Run the Step 1 command.
Expected: `PASS`.

---

### Task 3: discovery.md — exhaustive discovery + coverage ledger

**Files:**
- Create: `C:\W\repo-standards\plugins\regression-runbooks\skills\regression-runbooks\discovery.md`

**Interfaces:**
- Consumes: phase names + non-negotiables from `SKILL.md`.
- Produces: the discovery procedure, the ledger schema (8 item types), and the reconciliation gate referenced by `SKILL.md` and the runbook template's coverage-map section.

- [ ] **Step 1: Define the validation check (write it first)**

Run:
```bash
cd /c/W/repo-standards/plugins/regression-runbooks/skills/regression-runbooks && f=discovery.md && \
  for t in route field rule branch action state list column; do grep -q "\`$t\`" "$f" || { echo "MISSING $t"; }; done && \
  grep -qi 'parallel' "$f" && grep -qi 'Explore' "$f" && grep -qi 'ledger' "$f" && \
  grep -qi 'reconcil' "$f" && grep -qi 'legacy' "$f" && grep -qi 'source-of-truth' "$f" && \
  ! grep -Eiq 'drilllogify|schema-contract|forgesoftware|mssql|UiMeta' "$f" && echo PASS
```
Expected now: prints `MISSING …` lines / no `PASS`.

- [ ] **Step 2: Write discovery.md**

Sections:
1. **Phase 0 — Profile** (detailed): the checklist of what to detect (FE framework + component lib; e2e runner or "none yet"; **source-of-truth** for fields/enums — schema pkg / TS types / OpenAPI / validation module / else the components; **verification lanes** — DB / API read-back / storage, ≥1 automatable; auth/login; state reset; **area inventory** from routes/nav; selector conventions). Output → `<repo>/.claude/regression-runbooks/profile.md` (from `template-profile.md`). Re-validate if it exists.
2. **Phase 1 — Discover (exhaustive, parallel):** how to fan out parallel `Explore` agents (and codebase graph/search tools when present) over the area; what each agent extracts; how results merge into the ledger. Emphasize **deriving from the source-of-truth** and **diffing against any legacy/manual test docs**.
3. **Coverage-ledger schema:** the table of 8 item types (`route`, `field`, `rule`, `branch`, `action`, `state`, `list`, `column`) with a stable-key convention and example keys (copy from design §6). Each item carries a status: `uncovered` | `covered:[TC-…]` | `absent:<reason>` | `deferred:<user-approval-ref>`.
4. **Phase 3 — Reconciliation gate:** every ledger item must be `covered`, `absent`, or `deferred` before "done"; any `uncovered` BLOCKS completion; `deferred` requires explicit user approval (tie to the non-negotiable). The compact ledger→TC map is written as a section inside the runbook.
5. **Sizing guidance:** when to split an area, how many discovery agents, how to keep the ledger reviewable.

- [ ] **Step 3: Run the validation check**

Run the Step 1 command. Expected: `PASS` (no `MISSING` lines).

---

### Task 4: reference.md — generic mechanics + gotcha catalogue

**Files:**
- Create: `C:\W\repo-standards\plugins\regression-runbooks\skills\regression-runbooks\reference.md`

**Interfaces:**
- Consumes: phase names from `SKILL.md`; ledger from `discovery.md`.
- Produces: the reusable mechanics + the generalizable gotcha catalogue referenced by `SKILL.md`'s quick-reference and by every runbook.

- [ ] **Step 1: Define the validation check (write it first)**

Run:
```bash
cd /c/W/repo-standards/plugins/regression-runbooks/skills/regression-runbooks && f=reference.md && \
  grep -qi 'verification lane' "$f" && grep -qi 'round-trip' "$f" && grep -qi 'per-field validation' "$f" && \
  grep -qi 'conflict' "$f" && grep -qi 'FK' "$f" && grep -qi 'getByRole' "$f" && \
  grep -qi 'strict' "$f" && grep -qi 'noValidate' "$f" && grep -qi 'transient' "$f" && \
  grep -qi 'timeout' "$f" && grep -qi 'testability gap' "$f" && grep -qi 'TC-' "$f" && \
  ! grep -Eiq 'drilllogify|schema-contract|forgesoftware|mssql|test:e2e:harness|UiMeta|canonicalRequiredFields' "$f" && echo PASS
```
Expected now: no `PASS`.

- [ ] **Step 2: Write reference.md — generic mechanics**

Generalize the DrillLogify `reference.md` §1–§7, §9. Sections:
1. **Execution profiles** — three columns generalized: A) local-dev manual; B) automated (the repo's e2e runner); C) second-environment manual (staging/preview). Identical test steps; only setup + the verification lane differ.
2. **Reusable mechanics** — navigate; control persistence explicitly (disable background sync/auto-refresh so assertions are deterministic); trigger/observe a write; reset to clean slate.
3. **Verification lanes (generic, tri-modal):** Lane 1 in-app/observable (always); Lane 2 direct datastore query (DB/console); Lane 3 automation-side read-back (in-process query or API). Type-mapping caveats generalized (dates as strings, enums store the **code** not the label, numbers as numbers, soft-delete sets a flag).
4. **Sync/persistence verification recipes** — write-proof, read-back-proof, conflict-proof, the **every-field both-ends round-trip** (the gold standard), and **per-field validation** (required + each validator; where the message surfaces — top alert vs inline; validate-on-submit). Generalize §4a–§4e.
5. **FK / cross-entity setup order** — create parents before children; build the chain in setup; reuse shared chain helpers.
6. **Authoring conventions** — `getByRole(role,{name})`; a **generic** component→role cheat-sheet (textbox/spinbutton/combobox/checkbox/switch/slider/radio/group date-picker/grid) noting it's framework-dependent (verify against the repo's lib); enum vs DB-backed code-list distinction; run-IDs; step→verb mapping; flag testability gaps over brittle selectors.
7. **Test-case ID scheme** — `TC-<AREA>-<TIER><n>`; never renumber.

- [ ] **Step 3: Write reference.md — the generalizable gotcha catalogue**

Port from the DrillLogify `reference.md` §8 ONLY the entries that are framework-generic (MUI + Playwright + React), stripping all DrillLogify names and dropping sync/canonical-specific ones. Required categories (each as a short titled bullet, with the symptom → cause → fix shape):
- Substring strict-mode collisions (`{exact:true}`); page-heading vs empty-state-heading collision; short sentinel words.
- Unnamed `<Select>` combobox (needs `labelId`); raw-Select vs validated-Select; `<Select>` labelled by a sibling `<Typography>` (use `inputProps aria-label`); placeholder option at index 0.
- `<Switch>` is `role="switch"` not checkbox; bare Switch needs `slotProps.input.aria-label`; label that flips with state.
- MUI `Rating` radios are visually-hidden → drive by keyboard.
- Date pickers are `role="group"` of Year/Month/Day spinbuttons (fill 8 digits, read sections); native `type="date"` has no textbox role → `getByLabel`; focus the Year section first.
- Tooltip-wrapped text button takes the tooltip as its name; aria-label wins over visible text; Tooltip on a `<span>` names the span not the inner button.
- `<Link component="button">` has role `button`; a clickable `<Paper>`/`<div onClick>` card has no role (drive by heading text + flag a11y gap).
- Native HTML5 validation (number `min`/`max`, `type="email"`) preempts submit → form needs `noValidate`; `type="number"` rejects non-numeric text so format validators are UI-unreachable.
- Assert durable post-action state, not a transient toast (de-flakes AND surfaces masked bugs); a missing `event.preventDefault()` on a submit handler reloads the page.
- An unbounded action timeout hangs to the full test ceiling → cap risky actions with an explicit `{timeout}`; a missing locator hangs.
- JSON-array / JSON-object / editable-sub-table → one JSON column (`JSON.parse`, not equality); vs a separate FK child table (join + poll count).
- A model/payload field is not necessarily rendered — derive the every-field list from the rendered form; conflict/soft-delete tests must edit a field NOT in the list-row label.
- Image/binary upload via `setInputFiles({buffer})` round-trips as a data-URI column.
- A factory PK using `data.id ?? uuid()` keeps `''` (use `||`) — surfaced only by a real write/sync, not a repo-mocked test.
- Capture the upload REQUEST payload to root-cause a write 4xx.
- Generic triage note: a server check resolving the recorded user can fail on a dev-identity mismatch (id vs email/oid); a free-text field that is secretly an FK saves locally then fails on write.

Include a one-line header: "These are common web-app (MUI/React/Playwright-class) gotchas. Repo-specific gotchas live in the repo's `.claude/regression-runbooks/profile.md`."

- [ ] **Step 4: Run the validation check**

Run the Step 1 command. Expected: `PASS`. Then confirm no banned strings across all skill files so far:
```bash
cd /c/W/repo-standards/plugins/regression-runbooks/skills/regression-runbooks && \
  ! grep -REil 'drilllogify|schema-contract|forgesoftware|mssql|test:e2e:harness|UiMeta|canonicalRequiredFields' . && echo CLEAN
```
Expected: `CLEAN`.

---

### Task 5: template-runbook.md — framework-neutral runbook template

**Files:**
- Create: `C:\W\repo-standards\plugins\regression-runbooks\skills\regression-runbooks\template-runbook.md`

**Interfaces:**
- Consumes: tiers + ID scheme + lanes from `reference.md`; ledger from `discovery.md`.
- Produces: the per-area template copied to `<repo>/docs/runbooks/<area>.md`. Adds a **Coverage map** section (the reconciliation proof).

- [ ] **Step 1: Define the validation check (write it first)**

Run:
```bash
cd /c/W/repo-standards/plugins/regression-runbooks/skills/regression-runbooks && f=template-runbook.md && \
  grep -q '{{AREA}}' "$f" && grep -qi 'Smoke' "$f" && grep -qi 'Targeted' "$f" && grep -qi 'Full' "$f" && \
  grep -qi 'Coverage map' "$f" && grep -qi 'round-trip' "$f" && grep -qi 'Testability gaps' "$f" && \
  grep -qi 'Self-improving log' "$f" && grep -qi 'Field reference' "$f" && \
  grep -qi 'Run record' "$f" && grep -qi 'feed learnings back' "$f" && \
  ! grep -Eiq 'drilllogify|schema-contract|forgesoftware|mssql' "$f" && echo PASS
```
Expected now: no `PASS`.

- [ ] **Step 2: Write template-runbook.md**

Generalize the DrillLogify `template.md`. Keep the structured **Step tables** (so cases stay human-runnable AND map 1:1 to a spec). Sections, all with `{{PLACEHOLDERS}}` and guiding HTML comments:
- Header: `{{Area}}`, `{{AREA}}` code, nav, routes, entities/datastore tables, feature/permission gate.
- Pointer note: mechanics live in the plugin's `reference.md`/`discovery.md`.
- **Run record** table.
- **Scope & preconditions** (covers / out-of-scope / parent rows in FK order / setup by profile).
- **Tier: Smoke** — one structured case block (Action/Target/Data/Expected table) + a persistence write-proof + a Lane-1 verify.
- **Tier: Targeted** — required-field validation; per-field validation rules; edit/update; delete lifecycle (only sub-parts that exist); one TC per enum/conditional field/list feature.
- **Tier: Full** — the every-field both-ends round-trip (F1); conflict + soft-delete propagation (F2); edge cases (F3).
- **Coverage map** — NEW: a table mapping every ledger item (`type:key`) → its TC IDs / `absent` / `deferred(user-ref)`. Note: must have zero `uncovered` rows to ship.
- **Field reference** — derive from source-of-truth; control/required/enum-or-bounds.
- **Testability gaps** — element / where / gap / proposed fix.
- **Known-fragile / recent changes**.
- **Self-improving log (harness finds)**.
- **After the run — feed learnings back into the skill** — the dual-target closing step.

- [ ] **Step 3: Run the validation check**

Run the Step 1 command. Expected: `PASS`.

---

### Task 6: template-profile.md — per-repo profile skeleton

**Files:**
- Create: `C:\W\repo-standards\plugins\regression-runbooks\skills\regression-runbooks\template-profile.md`

**Interfaces:**
- Consumes: the Phase 0 checklist from `discovery.md`.
- Produces: the skeleton copied to `<repo>/.claude/regression-runbooks/profile.md` (the discovered-once repo facts + repo gotchas + lessons that repo accrues).

- [ ] **Step 1: Define the validation check (write it first)**

Run:
```bash
cd /c/W/repo-standards/plugins/regression-runbooks/skills/regression-runbooks && f=template-profile.md && \
  grep -qi 'FE framework' "$f" && grep -qi 'component lib' "$f" && grep -qi 'e2e' "$f" && \
  grep -qi 'source-of-truth' "$f" && grep -qi 'verification lane' "$f" && grep -qi 'auth' "$f" && \
  grep -qi 'reset' "$f" && grep -qi 'area inventory' "$f" && grep -qi 'selector convention' "$f" && \
  grep -qi 'runbooks path' "$f" && grep -qi 'repo gotcha' "$f" && \
  ! grep -Eiq 'drilllogify|schema-contract|forgesoftware|mssql' "$f" && echo PASS
```
Expected now: no `PASS`.

- [ ] **Step 2: Write template-profile.md**

A fill-in skeleton with these `{{PLACEHOLDER}}` sections + guiding comments:
- **Stack:** FE framework, component lib, language, build tool.
- **e2e harness:** runner + run command (or "none yet — runbooks are manual-only").
- **Source-of-truth for fields/enums:** what + where + how to derive a field list.
- **Verification lanes:** Lane 1 (in-app/observable), Lane 2 (datastore query — connection/how), Lane 3 (automation read-back — helper/path). Mark which are automatable.
- **Auth / login:** how to authenticate in each profile (manual + automated).
- **State reset:** how to get a clean slate in each profile.
- **Area inventory:** table of area → nav → routes → entities/tables → gate.
- **FK / setup order:** the parent→child graph + shared chain-helper locations.
- **Selector conventions:** preferred query, component→role specifics for this repo's lib, label-stability caveats.
- **Runbooks path:** where runbooks live (default `docs/runbooks/`) + spec path if automated.
- **Repo-specific gotchas:** running log (the repo twin of the plugin's generic catalogue).
- **Profile maintenance:** note to re-validate when the stack drifts.

- [ ] **Step 3: Run the validation check**

Run the Step 1 command. Expected: `PASS`.

---

### Task 7: README + self-improvement wiring + global sidecar spec

**Files:**
- Create: `C:\W\repo-standards\plugins\regression-runbooks\README.md`
- Modify: `C:\W\repo-standards\plugins\regression-runbooks\skills\regression-runbooks\SKILL.md` (expand the Self-improve phase into a precise procedure)
- Modify: `C:\W\repo-standards\plugins\regression-runbooks\skills\regression-runbooks\reference.md` (add a "Self-improvement (dual target)" section)

**Interfaces:**
- Consumes: all skill files from Tasks 2–6.
- Produces: the install/usage README; the precise dual-target self-improvement procedure referenced by `SKILL.md`'s phase 6 and every runbook's closing step.

- [ ] **Step 1: Define the validation check (write it first)**

Run:
```bash
cd /c/W/repo-standards/plugins/regression-runbooks && \
  grep -qi 'plugin marketplace add' README.md && grep -qi 'plugin install' README.md && \
  grep -q 'warwickschroeder/repo-standards' README.md && \
  grep -q '.claude/regression-runbooks/lessons.md' skills/regression-runbooks/reference.md && \
  grep -qi 'when reachable' skills/regression-runbooks/reference.md && \
  grep -qi 'sidecar' skills/regression-runbooks/SKILL.md && echo PASS
```
Expected now: no `PASS`.

- [ ] **Step 2: Write the plugin README**

`plugins/regression-runbooks/README.md`: what the plugin does (the 6-phase loop in 6 bullets), install steps:
```
/plugin marketplace add warwickschroeder/repo-standards
/plugin install regression-runbooks
```
…what it creates in a target repo (`.claude/regression-runbooks/profile.md`, `docs/runbooks/<area>.md`), and where cross-repo lessons go (`~/.claude/regression-runbooks/lessons.md` + this plugin's git source).

- [ ] **Step 3: Add the dual-target self-improvement procedure**

In `reference.md` add a **"Self-improvement (dual target)"** section specifying exactly:
- **Repo-specific** lesson → append to `<repo>/.claude/regression-runbooks/profile.md` (Repo-specific gotchas) + the runbook's Self-improving log.
- **Generalizable** lesson → (a) ALWAYS append to `~/.claude/regression-runbooks/lessons.md` (give the entry format: date, area/repo, symptom→cause→fix, target file in plugin); (b) if the plugin git source is reachable on this machine, ALSO edit the relevant plugin file + note a version bump is due. State the sidecar→plugin fold-in step.
- Define the global sidecar file format (a dated bullet list).
In `SKILL.md`, make the Self-improve phase point to this section and name both targets + the "sidecar always, plugin when reachable" rule.

- [ ] **Step 4: Run the validation check**

Run the Step 1 command. Expected: `PASS`.

---

### Task 8: End-to-end validation

**Files:**
- None created. Validation only.

**Interfaces:**
- Consumes: everything from Tasks 1–7.

- [ ] **Step 1: Validate all JSON**

Run:
```bash
cd /c/W/repo-standards && jq empty .claude-plugin/marketplace.json plugins/regression-runbooks/.claude-plugin/plugin.json && echo JSON-OK
```
Expected: `JSON-OK`.

- [ ] **Step 2: Confirm the full file set exists**

Run:
```bash
cd /c/W/repo-standards/plugins/regression-runbooks && \
  ls .claude-plugin/plugin.json README.md \
     skills/regression-runbooks/{SKILL.md,discovery.md,reference.md,template-runbook.md,template-profile.md} && echo ALL-PRESENT
```
Expected: lists all 7 files + `ALL-PRESENT`.

- [ ] **Step 3: Confirm no repo-specific leakage anywhere in the plugin**

Run:
```bash
cd /c/W/repo-standards/plugins/regression-runbooks && \
  ! grep -REil 'drilllogify|schema-contract|forgesoftware|mssql|test:e2e:harness|UiMeta|canonicalRequiredFields' . && echo CLEAN
```
Expected: `CLEAN`.

- [ ] **Step 4: Confirm skill frontmatter loads**

Run:
```bash
cd /c/W/repo-standards/plugins/regression-runbooks/skills/regression-runbooks && \
  awk 'NR==1{e=($0=="---")} NR>1&&$0=="---"{print "FM-END@"NR; exit}' SKILL.md && \
  grep -m1 '^name: regression-runbooks$' SKILL.md && grep -m1 '^description:' SKILL.md && echo FM-OK
```
Expected: an `FM-END@N` line, the `name:` line, the `description:` line, then `FM-OK`.

- [ ] **Step 5: Live plugin-load check (in Claude Code)**

In a Claude Code session run `/plugin marketplace add C:\W\repo-standards` (local path), then `/plugin install regression-runbooks`, then confirm the skill appears in the skills list and `discovery.md`/`reference.md` resolve. Report the result. (This is the real acceptance check; the earlier greps are pre-flight.)

- [ ] **Step 6: Report deferred-commit handoff**

State that all files are in the `C:\W\repo-standards` working tree, uncommitted (per the user's "don't commit yet" decision), and offer to branch+commit or open a PR when the user is ready. Do NOT commit.

---

## Self-Review

**1. Spec coverage** — each design section maps to a task:
- Packaging/marketplace (design §3a) → Task 1, README in Task 7.
- 6-phase workflow (§4) → SKILL.md Task 2; Profile/Discover/Reconcile detail → Task 3; mechanics/Automate → Task 4; templates → Tasks 5–6.
- Carries-over vs generalized + gotcha split (§5) → Task 4 steps 2–3.
- Coverage-ledger schema (§6) → Task 3 step 2.3; coverage-map in runbook → Task 5.
- Non-negotiables (§7) → SKILL.md Task 2 step 2.4.
- Self-improvement dual target (§4 Phase 5, decision #3) → Task 7.
- Per-repo profile + `.claude/regression-runbooks/` naming (§3b, refinement B) → Tasks 6, 7; global sidecar → Task 7.
- "Miss nothing" gate (decision #4) → Task 3 + Task 5 coverage map + Task 8 step 3.

**2. Placeholder scan** — no "TBD/TODO/implement later"; template `{{PLACEHOLDER}}` tokens are intentional content of the deliverable templates, not plan gaps. Each content task carries a concrete grep/jq acceptance check.

**3. Type consistency** — fixed names used consistently across tasks: phase names (`Profile/Discover/Write/Reconcile/Automate/Self-improve`); ledger item types (`route/field/rule/branch/action/state/list/column`); paths (`<repo>/.claude/regression-runbooks/profile.md`, `~/.claude/regression-runbooks/lessons.md`, `docs/runbooks/`); banned-substring set identical in Tasks 2,3,4,5,6,8; ID scheme `TC-<AREA>-<TIER><n>`.

No gaps found.
