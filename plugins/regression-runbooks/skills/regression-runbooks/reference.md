# Regression Runbooks — Reference

Reusable mechanics and the generalizable gotcha catalogue shared by every
per-area runbook. Per-area files (`docs/runbooks/<area>.md`, or the path
declared in the repo's profile) stay focused on that area's test cases and
link back here for mechanics.

---

## §1 Execution profiles

One runbook, three ways to run it. The **test steps are identical** across all
three — only the **Setup** and the **verification lane** differ.

| Profile | Who | App | Auth | Persistence | Local state reset |
| --- | --- | --- | --- | --- | --- |
| **A. Local-dev (manual)** | Developer | Dev server (discovered port) pointed at the local backend | Dev/quick login (discovered method) | Local backend process (DB file, in-memory, container) | App's "Clear Data" action, or delete/reset the local store |
| **B. Automated (e2e runner)** | Automation | Test server (harness-managed port) wired to test backend | Programmatic login (harness fixture) | Test backend (container or in-process) — programmatic access | Harness fixture clears per-test (storage, cookies, DB state) |
| **C. Second environment (manual)** | Human tester | Deployed staging/preview URL | Real identity provider (OAuth, SSO, etc.) | Staging/preview backend — query via DB client or API | App's "Clear Data" action (wipes local state only; remote intact) |

> The test steps in the runbook are written once and work for all three
> profiles. Annotate a step only when setup or verification differs
> (`[Profile A only]`, `[Lane 3]`, etc.).

### Setup steps by profile

**A — Local-dev (manual)**
1. Start the local backend (the repo's dev-backend command — see the profile).
2. Start the dev server (the repo's `dev` script) and open the dev URL.
3. Log in with the dev/quick-login method the repo provides.
4. For a clean slate: use the app's data-clear action (Settings → Clear Data, or equivalent).

**B — Automated (e2e harness)**
- The harness handles everything: `globalSetup` starts backend containers,
  warms the API, spawns the dev server, and provides a logged-in page plus
  direct backend access via the fixture API. Discover the run command from the
  repo's package scripts (see §8). You write the spec; the harness wires the
  plumbing.

**C — Second environment (manual)**
1. Open the staging/preview URL; sign in with the real identity provider.
2. Confirm the correct tenant/workspace/account is active.
3. For a clean slate: Settings → Clear Data (wipes local state only; remote
   data is untouched). A clean download proof requires a subsequent Sync or
   page refresh from the server.

---

## §2 Reusable mechanics

> **Read the architecture note first.** The persistence mechanics in this section
> and in §3 were written for an **offline-first** app. Sync triggers, dirty /
> unsynced badges, local-store clearing, two-profile conflict and tombstone
> propagation exist **only** in that architecture. Determine the app's
> architecture in Phase 1 (`SKILL.md`) and use only the matching mechanics:
>
> | Architecture | Write-proof | Read-back proof | Concurrency proof |
> |---|---|---|---|
> | **Online CRUD** | success signal + list/detail re-fetch | reload → reopen the record | the app's real guard: unique-key 409, already-actioned 409, last-write-wins, optimistic token, or a delete racing a worker |
> | **Offline-first / sync** | pending badge → sync → badge clears | clear local store → sync → reopen | §3c two-profile conflict + tombstone propagation |
> | **Realtime / push** | success signal + a second session converging with no reload | reload → reopen | two sessions converging |
> | **Eventual consistency** | success signal + poll-until-consistent | reload → poll | poll-until-consistent; honest interim state |
>
> **A mechanic the app doesn't have is deleted from the runbook, not written up
> as an "absent" case.** Record the absence once as an `absent:<reason>` row in
> the Coverage map (SKILL.md Non-negotiables).

### Navigate

Use the app's primary navigation (sidebar, top bar, breadcrumbs) to reach the
area. Sub-entities typically nest under a parent's detail page — derive the URL
pattern from the router (e.g. `/parents/:id/children/:childId`). In automated
specs, prefer `page.goto(url)` over simulating nav clicks for setup; reserve
UI navigation for cases that *test* navigation itself.

### Control persistence explicitly — disable background refresh

Background auto-sync, polling, and auto-refresh can fire between a mutation
and your explicit assertion, making unsynced-count and DB assertions
non-deterministic.

- **Automated:** disable programmatically before the app boots (seed
  `localStorage`, inject a flag, or stub the timer — whichever the repo
  exposes). The fixture should assert it stayed off.
- **Manual:** turn off auto-sync / auto-refresh in the app's settings before
  running, so only your explicit actions trigger writes.

### Trigger and observe a write

The write mechanism is repo-specific — see the profile for the exact action.
Common patterns: a top-bar "Sync" button, an inline save/submit, an API call
on form submit. After triggering, observe the durable signal (row appears in a
list, status field updates, unsynced count → 0) — **never** assert only a
transient toast (see §8 gotchas).

### Reset to a clean slate (for the download-direction proof)

- **Manual:** use the app's data-clear action (Settings → Clear Data, or delete
  browser storage from devtools). Clearing wipes local state; remote data stays.
  A subsequent sync/reload then downloads server state into the empty local
  store — this is how you prove the *pull* path.
- **Automated:** the harness fixture clears storage and resets DB state
  per-test. The fixture should expose a `resetLocalAndRelogin` helper (or
  equivalent) that wipes local state with the remote intact, then re-logs in.

---

## §3 Write / read-back / conflict recipes

Every mutating test case must prove persistence. Use the recipe that matches
the tier.

### 3a. Upload / write proof (Smoke/Targeted)

1. Create or edit a row in the UI.
2. Observe the pending-change signal (unsynced count, dirty indicator, pending
   badge — whatever the repo surfaces).
3. Trigger the write (submit, sync, save).
4. Observe the success signal (snackbar text, status → "saved", count → 0).
5. Verify the backend has the row (verification lane, §5).

### 3b. Read-back / download proof (Full)

1. After 3a, reset local state (§2) so only the remote copy remains.
2. Trigger a download (sync, page refresh, re-login).
3. Navigate to the area; the row must be present with the same field values.
4. (Remote unchanged — this proves the pull path end-to-end.)

### 3c. Concurrency proof (Full) — pick the variant for the architecture

**This recipe below is the offline-first variant.** For the other architectures:

- **Online CRUD** — there is no sync to conflict on. Test the app's *actual*
  contention guard, and only where one exists: a unique-key **409**, an
  already-actioned **409** (two users deciding the same item), a last-write-wins
  column, an optimistic-concurrency token, or a delete racing a background
  worker. If a Targeted/F3 case already covers that guard, **do not write a
  second case** — point the `concurrency:*` coverage row at the existing one.
  If the surface genuinely has no contention (a singleton row one role writes, a
  create-only form, a caller-scoped personal setting), record
  `absent:<reason>` in the Coverage map and write no case at all.
- **Realtime / push** — concurrency surfaces as **convergence**: with two
  sessions open on the same screen, a change made in session 1 appears in
  session 2 **without a reload**. Assert session 2's UI, never a sync indicator.
- **Eventual consistency** — assert poll-until-consistent, and that the interim
  UI is honest (a pending/processing state) rather than stale data shown as
  current.

**Offline-first variant.** Conflicts require the *same row* mutated in two
separate sessions before a sync. Use a **second browser profile/context**
(isolated storage) for the second session:

1. Profile 1: edit row R, field X → value `P1`. **Do not sync.**
2. Profile 2 (same user/tenant): edit row R, field X → value `P2`. **Sync.**
   Remote now holds `P2`.
3. Profile 1: **Sync**. Expect conflict detection (the app's conflict signal —
   count badge, history log, snackbar).
4. Verify resolution matches the entity's policy (observe the UI and the remote
   row). State the observed resolution in the runbook; if it's unclear, that is
   a finding to raise, not a value to invent.
5. Also cover **soft-delete propagation**: delete R in profile 1 → sync; confirm
   R is tombstoned remotely and disappears in profile 2 after its next sync.

### 3d. Every-field both-ends round-trip (Full) — the gold standard

This case makes "Full" actually exhaustive; it has already caught real systemic
bugs (date columns blank after download, mis-mapped fields). **One case per
area** fills **every** user-input field with a **distinct**, type-appropriate
value and checks each value **at both ends**: in the remote store after upload,
and back in the form after a download. A mis-mapped or dropped field fails at
one end or the other.

1. Open the create form; fill **every** field the form exposes (derive the list
   from the repo's source-of-truth — form JSX, schema, or OpenAPI — don't
   eyeball). Give each a unique value so a swapped column is detectable.
2. Submit and trigger the write (sync/save).
3. **End 1 — remote store:** assert every column equals the entered value
   (verification lane, §5). Mind type mappings (§5): enums store the **code**
   not the label; dates may need format conversion; numbers come back as numbers.
4. **End 2 — form:** reset local state (§2), trigger a download (sync/refresh),
   reopen the row's **edit** form, and assert every field shows what was entered.
5. If the form has **mutually-exclusive branches** (e.g. variant A vs variant B
   controlled by a type selector), one case can't fill both branches at once —
   fill one branch exhaustively in this case and cover the other branch in a
   Targeted case. State the split explicitly in both.

> **Why both ends:** upload-only proves the write path. The download→form half
> catches values that survive in the remote store but can't be parsed back into
> the UI (e.g. date picker rejects an ISO datetime string). Skipping it leaves
> a silent data-loss class uncovered.

### 3e. Per-field validation (Targeted/Full)

Cover each validation rule — derive them, don't guess:

- **Required fields:** derive the authoritative set from the repo's
  source-of-truth (schema, form validator, required-field config). Submitting
  with a required field empty must **block** and show the expected message.
  Note: to test a *non-required* rule you must first satisfy **all** required
  fields, or the required check fires first and masks it.
- **Other validators** (length bounds, date ordering, numeric range, uniqueness,
  format): each must block with its expected message. Derive them from the
  form's `validate` function; do not invent rules.
- **Where the message surfaces is form-specific — read the JSX, don't assume.**
  Two common shapes:
  - **Top-of-form `Alert`:** assert `getByRole('alert')` contains the message.
  - **Inline `helperText` per field:** assert `getByText('<message>')` (and
    that the URL didn't navigate away). Asserting `getByRole('alert')` here
    will find nothing.
  - **Some forms render the same message in BOTH places** — then
    `getByText(msg)` is a strict-mode violation (2 matches). Assert the unique
    `getByRole('alert')`, or scope to the specific field.
- **Validation timing:** most forms validate **on submit**, not on change — the
  pattern is `fill → click submit → assert message`, not `fill → assert`.
- **A `disabled={!canSave}` submit button changes the recipe.** If the button
  is gated on live `canSave` (all validators pass), the click never fires while
  invalid. Test as: assert the button `toBeDisabled()` while invalid, `blur()`
  the field to surface inline `helperText`, then assert `toBeEnabled()` once
  valid. Async validators (uniqueness checks) that run after the button enables
  are the only ones that can still reach a top `Alert`.

---

## §4 Every-field both-ends round-trip + per-field validation

See §3d and §3e above. These are the two mandatory cases for the Full tier.
Quick checklist:

- [ ] Every user-input field filled with a distinct, type-appropriate value.
- [ ] Remote store asserted after upload (every column, type-mapped — §5).
- [ ] Form re-asserted after download (every field, including date pickers and
      Select labels).
- [ ] Each required field blocks save with its expected message.
- [ ] Each other validator blocks save with its expected message.
- [ ] Validation message surface (top-of-form alert vs inline per-field message) confirmed by
      reading the form source — not assumed.
- [ ] Mutually-exclusive form branches split across cases if necessary.

---

## §5 Verification lanes (tri-modal) + type mappings

Every "verify the data" step in a runbook is written once and offers three
lanes. Pick by profile; **Lane 1 always applies**.

### Lane 1 — In-app / observable (all profiles)

Use the app's own read surfaces:
- The entity's **list** or **detail view** (field values rendered).
- The app's **data explorer** or **admin view** if one exists (surfaces raw
  column values including hidden audit columns).
- A **status indicator** (sync count, last-saved timestamp, record count).

Playwright: assert via `getByRole`/cell text. The human tester reads the same
UI.

### Lane 2 — Direct datastore query (human, Profile A or C)

Connect to the datastore (SQL client, Mongo shell, REST client, browser
DevTools → Application → IndexedDB/OPFS, etc.) and `SELECT`/query the row.
Confirm the expected columns, a server-assigned ID or timestamp, and soft-delete
state.

The query tool and connection details are repo-specific — record them in the
profile.

### Lane 3 — Automation-side read-back (Profile B)

Query the backend in-process from the Playwright/Node test — no external client
needed. The harness fixture exposes a `sql` / `db` / `api` helper for this. Use
`expect.poll(...)` because backend writes are asynchronous.

Assert server rows in-process; capture the request payload when a write 400s
(see §8 gotchas).

### Type mappings when asserting stored values (Lane 2/3)

| Type | Storage reality | How to assert |
| --- | --- | --- |
| **Date** | Stored as `DATE`/`DATETIME`/`string` | Extract the date portion: `.toISOString().slice(0,10)` (JS) or the DB's date-cast — e.g. `col::date` (Postgres), `DATE_FORMAT(col,'%Y-%m-%d')` (MySQL), `CONVERT(varchar(10), col, 23)` (T-SQL) → `'yyyy-MM-dd'` |
| **Enum / code-list** | Stores the **code** (`ON_HOLD`), not the label (`On Hold`) | Assert the code remotely; assert the rendered label in the form |
| **Number** | `FLOAT`/`INT`/`number` — comes back as a number | Assert `=== 2.5`, not `'2.5'` |
| **Soft-delete** | A `deletedAt` / `isDeleted` flag is set; the row is NOT removed | Assert the flag is set and the row disappears from the UI list |
| **JSON array/object** | Stored as a JSON string | `JSON.parse(row.Col)` then `expect.arrayContaining` / `.toMatchObject` — never string equality |
| **Boolean stored as 0/1** | SQLite stores `true`/`false` as integers | Assert `=== 1` / `=== 0` or coerce before comparing |

---

## §6 FK / dependency creation order

Create parents before children, or the child form has nothing to attach to.

**General rule:** walk the FK chain root-to-leaf.

```
RootEntity → ParentEntity → ChildEntity → GrandchildEntity
```

A runbook's **Preconditions** section must name the parent rows it needs and
how to create them (or reference the parent area's runbook). The setup for
every sub-entity case must build the full chain.

### Practical guidance

- **Build the chain in setup helpers** — one `createParent(page)` helper per
  FK-root, reused across cases. Don't re-derive the chain per case.
- **Reuse shared chain helpers** — if the repo has a shared harness helper
  file, import from it; don't re-implement chain creation per spec.
- **Navigate via the natural key / URL, not a server-queried auto-increment PK.**
  A server auto-increment PK differs between profiles and between runs. Use the
  row's **natural key** (user-visible ID, name) to navigate; store the URL or
  natural key, not the numeric PK.
- **Capture create-result IDs from the post-submit URL or response** — not from
  a DB query — so the spec stays fast and profile-independent.
- **Don't pick FK options by `nth(1)`** (order-dependent; a seed reorder silently
  breaks it). Pick by the option's readable value.

### Readiness-gated creates

Some entities can only be created when a chain of preconditions is met (e.g. an
order can only be created once there is an active customer + at least one in-stock
catalogue item). Build the entire gate-satisfying chain in setup.

---

## §7 Selector + authoring conventions

### Selector convention

Use **`getByRole(role, { name })`** with the element's accessible name. This
is readable by humans and runnable by Playwright, Cypress, and Testing Library —
matching the tri-purpose rule.

- **Accessible name = the label, `aria-label`, or tooltip title** (in that
  priority order — see gotchas in §8 for how the priority plays out).
- **`{exact: false}` is the default** — substring, case-insensitive. Use
  `{ exact: true }` whenever two elements share a word (see §8 strict-mode
  gotchas).
- Fallback: `getByLabel`, `getByText`, `getByPlaceholder` — use when `getByRole`
  has no meaningful role to attach to.
- **Never use nth-child, CSS class selectors, or positional nth selectors** in
  runbook steps — they are brittle. If you need one, that is a testability gap
  (flag it).

### Generic component → role cheat-sheet

> **This table is MUI/React-flavoured.** Verify the actual roles against the
> repo's component library — different libraries (shadcn, Radix, Ant Design,
> etc.) may use different roles or expose different accessible names.

| Control | Role | Notes |
| --- | --- | --- |
| Text input (`TextField`, `<input type="text">`) | `textbox` | |
| Number input (`TextField type=number`, `<input type="number">`) | `spinbutton` | Cannot `.fill()` with non-numeric text — browser rejects it |
| Native `<input type="date">` | **no `textbox` role** | Use `getByLabel('<label>')`. Fill `'yyyy-MM-dd'`. Do NOT confuse with a date-picker component. |
| MUI X `DatePicker` (or similar component date picker) | **`group`** (name = label) | Contains Year / Month / Day `spinbutton` sections. Fill by clicking then typing 8 digits (`20240315`) — auto-advances. Read by asserting each spinbutton's text. |
| `Select` / `Autocomplete` / `Combobox` | `combobox` | Opens a `listbox`; options are `option` (may be in a portal). Option text = rendered **label**; the **code** is stored — assert by code remotely. A placeholder option often sits at index 0. |
| `Checkbox` | `checkbox` | Toggle with `.check()` / `.uncheck()` |
| MUI v7 `Switch` | **`switch`** (NOT `checkbox`) | `<input type="checkbox" role="switch">`. Use `getByRole('switch', { name })`. `.check()` / `.uncheck()` work. |
| `Slider` | `slider` | Set by **keyboard** (focus → `Home`/`End`/`ArrowRight`×N), NOT drag (flaky). Assert the mirrored numeric input. |
| `Radio` | `radio` | |
| MUI `Rating` | `radio` (group of N radios) | Radios are visually hidden (1px clipped). Drive by keyboard: `getByRole('radio', { name: 'N Stars' }).press('Space', { force:true })` |
| Nav item / anchor (`<a href>`) | `link` | |
| `<Link component="button">` (in-app nav, no `href`) | **`button`** (NOT `link`) | Common in MUI for client-side navigation |
| Data grid | `grid` → `row` → `gridcell` | |
| Dialog / modal | `dialog` | `aria-hidden`/`inert` set on background while open — top-bar actions unreachable while dialog is open |
| Tab | `tab` | Switch tabs by clicking `tab "<Name>"` |
| Tab panel (active) | `tabpanel` | Only the active panel is in the tree; scope assertions to it |

### Enum vs backend-seeded code-list — write them differently

- **Canonical / fixed enum** (a closed set defined in the source-of-truth):
  derive the expected option set and assert it exactly.
- **Backend-seeded code-list** (tenant-extensible, loaded from a codes table):
  do **not** assert a fixed set — assert the control reflects the configured
  set, and note it's a code-list. Check the form source: a constant-import
  ⇒ canonical enum; a `useDropdownOptions`/`useCodes` hook ⇒ code-list.
  Code-list options often render as `"CODE - Label"` (check the repo's
  `toDisplayLabel` pattern). Select by the leading code (`/^<CODE>\b/`), not
  the bare label with `exact:true`.

### Run IDs

Parameterize created records with a unique suffix so reruns don't collide and
cleanup is targeted (e.g. `"RB Project {RUNID}"` where `RUNID` is a short
timestamp or UUID injected by the spec, or typed by the human tester).

### Step → Playwright verb mapping

| Step verb | Playwright |
| --- | --- |
| `goto` | `page.goto(url)` |
| `click` | `.click()` |
| `fill` | `.fill(value)` |
| `select` | `.selectOption()` or click the MUI option |
| `check` / `uncheck` | `.check()` / `.uncheck()` |
| `expect` | `await expect(locator).to…` |
| `press` | `.press('Key')` |
| `upload` | `.setInputFiles(...)` |

### Testability gaps

If an element has no stable accessible name (icon-only button, unnamed Select,
ambiguous duplicate, composite card text), the step **flags** it with a
`> ⚠ Testability gap:` note and proposes the app fix:

- Add `aria-label` on the element (first choice).
- Add a `data-testid` (fallback for controls with no semantic label).

Do **not** silently rely on nth-child or CSS-class selectors.

### Waits

Assert on **observable state** (toast text, URL change, row visible, count → 0,
status field value) — never use fixed `sleep` waits. The observable signal is
more reliable and proves the app's behaviour, not just its timing.

---

## §8 Harness — writing & running the automated spec

### Discovering the run command

Inspect the repo's `package.json` scripts (and any `playwright.config.ts` /
`cypress.config.ts`) to find the e2e runner command. Common patterns:

```bash
# Look for e2e/test/harness scripts
grep -E '"test:e2e|"e2e|"playwright|"cypress' package.json

# Then run (examples — the exact command is repo-specific):
npm run test:e2e                        # all specs
npm run test:e2e -- path/to/area.spec.ts     # one spec
npm run test:e2e -- --grep "TC-AREA-F1"     # one case (Playwright)
npx cypress run --spec "cypress/e2e/area.cy.ts"  # Cypress
```

Record the discovered command in the profile.

### Fixture / second-profile pattern (Playwright)

The harness typically exposes:

- **`appPage` / main fixture** — fresh storage + login + server state cleared
  per test.
- **`sql` / `db` / `api`** — in-process backend access for Lane 3 assertions.
- **`resetLocalAndRelogin(page)`** — wipe local state (server intact) then
  re-login; for the download-direction proof.
- **`bootAndLogin(page2)`** — second profile for conflict cases; use with a
  `browser.newContext(...)` and a `try/finally` to close it.
- **`sync(page)`** or equivalent — triggers a write + waits for completion.

Server assertions must **poll** (`expect.poll(...)`) — backend writes are async.

### Second-profile conflict context — canonical snippet

```ts
const ctx2 = await browser.newContext({ baseURL: appBaseURL });
const page2 = await ctx2.newPage();
try {
  await bootAndLogin(page2);      // independent login, same tenant/user
  // … profile-2 edits + sync …
  // … profile-1 sync → conflict detected …
} finally {
  await ctx2.close();
}
```

---

### Gotcha catalogue

> These are common web-app (MUI/React/Playwright-class) gotchas. Repo-specific
> gotchas live in the repo's `.claude/regression-runbooks/profile.md`.

---

#### Template scaffolding the app cannot have (the "13 apologies" smell)

**2026-07-26, Forge.Translation.** This template began life in an offline-first
app, so `F2 — sync conflict + soft-delete propagation` was marked *mandatory*.
Forge.Translation is online CRUD (React SPA → ASP.NET → Postgres, no local
store). Every one of its **13** runbooks therefore carried a `### TC-…-F2`
heading whose entire body explained why sync didn't apply — 13 separate
apologies for the same absent feature, plus 5 more phantom `F1` headings saying
"covered by S1". Eighteen case headings, zero test coverage, and no spec
referenced any of them.

- **Cause:** the template presented one architecture's mechanics as universal,
  and the repo's own reference told authors to *"state that in each runbook"* —
  turning a one-line fact into an N-file obligation.
- **Fix:** delete the section; record the absence **once** as an
  `absent:<reason>` row in that runbook's Coverage map, which is what the
  Phase 4 gate reads anyway. Retire the ID rather than reusing it.
- **Detect it:** `grep -rn "Absent" docs/runbooks/` — every hit that is a
  **case heading** rather than a coverage-map row is one of these.
- **Generalises to any template section**, not just sync: if the app has no
  delete UI, no offline store, no second session, don't write a case that exists
  only to say so.

#### Runbooks only a developer can read

Purposes #1 and #3 of a runbook are a **human** running it by hand, often
someone who has never seen the codebase. A case whose only statement of intent
is a `getByRole` step table fails those purposes silently — it looks complete
and is unrunnable by its actual audience.

- Give every case a two-line plain-English block (what you're doing; what a real
  user loses if it fails) and every step table an **`In plain English`** column.
- **Add the column — never reword `Expected`.** `Expected` is the contract the
  spec is generated from (roles, DB columns, exact error strings, `exact:` /
  `.first()` notes). Softening it to read nicely silently weakens the automated
  test. Both columns must hold for a step to pass.
- Put the legend (columns, action verbs, verification Lanes, personas,
  `{RUNID}`) **once** in the runbooks README and link it from each file, rather
  than re-explaining it per runbook.
- Tell manual testers which parts to ignore: `Automated:` lines, selector notes
  and the Testability-gaps table are for the spec, not for them.

#### Per-runbook automation notes drift from reality

A trailing "**pending the first green harness run**" that survives three green
runs makes the whole file untrustworthy — and in Forge.Translation two files
contradicted **their own Run record a dozen lines above**, while a third
described a bug a harness run had found and fixed while still claiming no run
had happened. Re-derive these notes mechanically from the specs
(`grep -o "TC-[A-Z]*-[STF][0-9]*" e2e/**/*.spec.ts | sort -u`) instead of
hand-editing them, and check them whenever you touch the file.

---

#### Strict-mode / substring collisions

**Substring name matching resolves to multiple elements.**
`getByRole(role, { name })` and `getByText(s)` match case-insensitive
substrings by default. If one name is contained in another, Playwright throws a
"strict mode violation: resolved to N elements" error. Symptom: a step that
targets `spinbutton "Azimuth"` also matches `"Magnetic Azimuth"`.
Fix: `{ name: '…', exact: true }` for roles; `getByText('…', { exact: true })`
for text. Audit any form where two fields or messages share a word (Depth /
Total Depth, Name / Display Name, etc.).

**Page heading collides with empty-state heading.**
A page title (e.g. `<h5>Sync History`) substring-collides with the empty-state
heading (`<h6>No sync history yet`) because "sync history" ⊂ "no sync history
yet". This only fires when the area is empty — so it passes on post-create cases
and fails only on no-data ones (state-dependent, looks random). Fix: `{ name:
'<title>', exact: true }` on page-heading assertions.

**Short sentinel words collide with status-bar phrases.**
`getByText('Never')` (the "Last Sync = Never" value) also matches a top-bar
"Last sync: Never" caption → 2 elements. Short sentinels (`Never`, `None`, `—`,
`0`) need `{ exact: true }`.

---

#### Unnamed `<Select>` / combobox

**MUI `<Select>` without `labelId` is an unnamed combobox.**
MUI names a combobox only when `<InputLabel id="x">` + `<Select labelId="x">`
are wired together. If a form omits the `labelId`, `getByRole('combobox', {
name: '<label>' })` can't resolve — the failure snapshot shows `combobox [ref=…]`
with no name. That is an **app gap to fix**: add the `id`/`labelId` pair. Do not
work around it with nth-child selectors.

**Conditional / category-revealed Selects are the prime offenders.**
Controls that only mount when a parent value is chosen (e.g. a "Duplicate Of"
field shown only when Category = DUP) are easy to miss in an unnamed-Select
audit because they're hidden on the default render. Audit by toggling every
branch, not just the default view.

**Raw `<Select>` vs the project's wrapper component.**
A project may have a `ValidatedSelect` wrapper that wires `labelId`
automatically. Plainer forms that hand-roll `<FormControl><InputLabel>Label</InputLabel>
<Select label="…">` without the id/labelId pair are the usual unnamed-combobox
culprits. Audit raw `<Select>` usages specifically.

**`<Select>` whose label is a sibling `<Typography>` (not a wired `InputLabel`) is unnamed.**
The label text exists but is not associated with the control. Fix with
`inputProps={{ 'aria-label': '<Label>' }}` (MUI's documented no-label pattern) —
names the combobox with no visual change, avoids a duplicate floating label.

**Placeholder option at index 0.**
Code-list Selects often prepend a placeholder (`"Not specified"`, value `""`) at
index 0. To choose a real value, skip index 0 or select by the known label.
Don't assert a fixed option set for tenant-extensible code-lists.

---

#### `<Switch>` gotchas

**MUI v7 `Switch` has `role="switch"`, NOT `checkbox`.**
`<input type="checkbox" role="switch">` resolves under `getByRole('switch', {
name })`. Using `getByRole('checkbox', …)` never resolves → 240s hang on
`.check()`. Use `getByRole('switch', …)`.

**Bare `<Switch>` without `FormControlLabel` needs `slotProps.input['aria-label']`, not `inputProps`.**
In MUI v7, a `<Switch inputProps={{ 'aria-label': X }}>` with no `FormControlLabel`
renders an **unnamed** switch — `Switch` reads input attrs from `slotProps.input`,
and the legacy top-level `inputProps` falls into `…other` where it no longer sets
the accessible name. A `FormControlLabel`-wrapped switch IS named — by the label.
App fix: `slotProps={{ input: { 'aria-label': X } }}`. (Note: `TextField` still
honours `inputProps`/`slotProps.htmlInput` — this rule is `Switch`-specific.)

**A label that flips with state gives the switch a moving accessible name.**
`label={x ? 'Enabled' : 'Disabled'}` ⇒ the switch is named `"Enabled"` when
checked, `"Disabled"` when unchecked. Toggle by the **current** name, assert
the **new** name afterwards. Drive to a known state with `.check()`/`.uncheck()`
(idempotent) rather than `.click()` (state-dependent).

---

#### MUI `Rating` — keyboard-only

**MUI `Rating` radios are visually hidden — drive by keyboard.**
The radio inputs are 1px clipped (`MuiRating-visuallyHidden`). `.check()` hangs
(waiting for visibility); a coordinate `.click({ force:true })` lands on the
wrong star. Drive it: `getByRole('radio', { name: 'N Stars' }).press('Space',
{ force:true })` — force skips the visibility wait; Space checks the focused
radio and fires the native change event. Name format: `"1 Star"`, `"N Stars"`.

---

#### Date pickers

**MUI X `DatePicker` is `role="group"` of spinbuttons — not a textbox.**
Contains Year / Month / Day `spinbutton` sections (aria-labels "Year", "Month",
"Day"). Fill by clicking then typing 8 digits (`20240315`) — auto-advances
through sections. Read by asserting each spinbutton's text. `getByRole('textbox',
{ name: '<label>' })` will find nothing.

**Focus the Year section first before typing.**
A `group.click()` lands on whichever section is under the cursor; in a narrow
grid cell that may be Month or Day. Clicking the Year spinbutton explicitly
(`group.getByRole('spinbutton', { name: 'Year' }).click()`) before typing 8
digits is deterministic for every layout.

**Native `<input type="date">` has no `textbox` role.**
It is NOT the same as a date-picker component. Use `getByLabel('<label>')` and
fill `'yyyy-MM-dd'`. Don't apply the date-picker spinbutton pattern here.

---

#### Tooltip / `aria-label` naming priority

**A `<Tooltip title="X">` wrapping a text `<Button>Y</Button>` names the button "X", not "Y".**
MUI Tooltip sets the title as the child's `aria-label` when the child has no
`aria-label`. So `getByRole('button', { name: 'Y' })` resolves to nothing and
`.click()` **hangs the full 240s**. The tell: a `.click()` hang on a button you
can plainly see, whose failure snapshot shows `button "X — the tooltip text"`
with the visible text as a child `text:` node. Fix the test: target by the
tooltip wording (`{ name: /X/ }`), or add an explicit `aria-label` on the
Button that matches its visible text (if the tooltip divergence is undesirable
a11y).

**A `<Tooltip>` wrapping a `<span>` (the disabled-button pattern) names the span, not the inner button.**
Put `aria-label` directly on the `IconButton`, not on the span wrapper.

**A button with both an explicit `aria-label` and visible text is named by the `aria-label`.**
`getByRole('button', { name: <visibleText> })` silently never matches. Read the
JSX or the failure snapshot for the actual `aria-label`. A button's aria-label
may differ from its rendered text (e.g. a "Clear Filters (3)" button with
`aria-label="Clear all filters"`).

---

#### `<Link component="button">` and clickable cards

**`<Link component="button">` has role `button`, NOT `link`.**
A clickable value rendered as `<Link component="button" onClick={navigate(...)}>` (common for in-app navigation that isn't a real `<a href>`) resolves under
`getByRole('button', { name })`. `getByRole('link', …)` times out. Check the
JSX: `component="button"` ⇒ assert as a button.

**A clickable `<Paper>`/`<div onClick>` card has no role.**
Not a `button` or `link` (usually not keyboard-operable). Drive it by its
**heading text** (`getByText('<title>', { exact: true }).click()` — the click
bubbles to the `onClick`) and **flag the a11y gap** (proper fix: `ButtonBase` /
`role="button"` + key handler). Caution: a card title can collide with a
sidebar nav item of the same name — match `exact` against a name the sidebar
doesn't carry, or scope to the page content.

---

#### Native HTML5 validation

**Native HTML5 `min`/`max` validation on `type="number"` preempts React's `onSubmit`.**
Without `<form noValidate>`, an out-of-range number triggers the browser's
native validation tooltip and **suppresses `onSubmit`** — so the form's custom
validator never runs and its error message never shows. App fix: add `noValidate`
to the `<form>` element.

**Native `type="email"` validation also preempts submit without `noValidate`.**
Same class of bug — a bad email address shows a browser tooltip and suppresses
`onSubmit`, so a custom `"Invalid email address"` validator is unreachable.
Same fix.

**`type="number"` rejects non-numeric text — format validators are UI-unreachable.**
The browser rejects non-numeric input in `<input type="number">`, and Playwright
`.fill('abc')` **throws** `Cannot type text into input[type=number]`. A
`"Must be a valid number"` branch behind a number input is defensive code you
can't exercise through the UI. Don't author a test step for it; cover the
reachable validators (range, required, comparison).

---

#### Assert durable state, not transient toasts

**Assert the durable post-action state — not a transient snackbar.**
A `<Snackbar autoHideDuration={3000}>` flashes for ~3s — `getByText` can miss
it and flake. Assert the durable signal instead: a carried-forward field value
(`toHaveValue`), the form reset, a new list row, the detail URL, or the backend
row. An inline persistent `Alert` is fine to assert; a 3s snackbar is not.

**A missing `event.preventDefault()` on a submit handler causes a page reload.**
When a `type="submit"` button calls an `onSubmit` handler that doesn't call
`event.preventDefault()`, the native form submission fires — page reloads,
save aborts. The symptom: asserting a durable signal (e.g. a carried-forward
field value after "Save & Next") shows the field is empty — the save never
completed. Fix: add `event?.preventDefault()` in the handler. When a
save-and-continue button misbehaves, check for missing `preventDefault`.

---

#### Unbounded action timeout hangs

**An unbounded `.click()` / `.fill()` on a missing locator hangs to the full test ceiling.**
Playwright's action timeout defaults to the test timeout (often 30–240s), so
a wrong locator doesn't fail fast — it burns the full timeout. For **uncertain**
targets (conditionally rendered, category-filtered, code-list option), pass an
explicit short `{ timeout: 15_000 }` to the action so the wrong assumption fails
in 15s, not 240s. Keep the global test timeout correctly sized for the
legitimate worst case (e.g. a two-profile conflict test doing two heavy syncs).

**A missing locator hangs, not throws immediately.**
If you see a test "hang" at a step, the most common cause is a locator that
never resolves — not an infinite loop. Check:
- Is the element conditionally rendered? (A field hidden by a parent value you
  haven't set.)
- Is the element inside a closed `<Dialog>` or inactive `tabpanel`?
- Is the accessible name wrong? (See §8 gotchas above.)
- Is the element disabled? (Check for `aria-disabled="true"` / `Mui-disabled`
  in the failure snapshot.)

---

#### JSON array/object columns vs FK child tables

**A multi-chip / repeating-row widget may persist to a JSON column — assert with `JSON.parse`.**
A capabilities field (e.g. lab `methods`, CRM `certifiedValues`) may store as a
`string[]` or array-of-objects in a single JSON column. Assert the server value
with `JSON.parse(row.Col)` + `expect.arrayContaining([...])` or
`.toMatchObject({...})` — never string equality.

**An editable sub-table that looks like a separate entity may be a JSON-object column.**
A repeating-row sub-form (rows of `element`/`value`/`unit` etc.) may persist
the whole table to **one** canonical JSON column, not a separate table. Drive
it: click "Add row", then fill cells addressed by `"<Field> row N"` with
`{ exact: true }` (because `"row 1"` substring-matches `"row 10"`, `"row 11"`,
etc.). Assert the server with `JSON.parse(row.Col)` then `.toMatchObject({...})`
per row (subset match tolerates unfilled optional keys).

**Distinguish JSON-cell sub-tables from FK child tables.**
A genuinely separate synced child table requires a **JOIN + poll count**, not
a `JSON.parse` of a single cell. Verify FK children by joining parent to child
on a natural key and polling the row count (`expect.poll(() => count(...))`)
before asserting per-row fields.

**A form with no `<form>` element has no native-HTML5-validation surface.**
A button-`onClick` save (no `<form>`) means `noValidate` doesn't apply,
required messages render inline (`getByText`), not in a top alert. If the page
has two save buttons (header `Save` + bottom-bar `Create X`), target the
specific label or `button "Save"` strict-mode-collides with `"Save Changes"`.

---

#### Model field ≠ rendered field; conflict edit ≠ row-label field

**A field in the model / payload is not necessarily rendered in the form.**
Deriving the every-field list from the entity model or `FormData` interface can
include fields the form JSX renders **no input** for. Filling a non-existent
field hangs the full test timeout. Derive the every-field list from the
**rendered form JSX** (or a quick exploratory run), and list model-only fields
as "not rendered" in the runbook.

**In conflict / soft-delete tests, edit a field that is NOT part of the list-row label.**
These tests navigate to the edit form by the row's visible text. If the field
you mutate is *in* that text (e.g. editing `depthFrom` when the row label is
`"5.0m – 10.0m"`), the next `getByText('5.0m – 10.0m')` finds nothing after the
edit. Pick a conflict field that is not in the list-row label.

---

#### Image / binary upload

**Image upload via `setInputFiles({ buffer })` round-trips as a data-URI column.**
For a form with an image picker (`<input type="file" accept="image/*">`), drive
it with `page.locator('input[type="file"]').setInputFiles({ name, mimeType,
buffer })` — no need to click the visible drop-zone label. Use a tiny 1×1 PNG
(`Buffer.from('<b64>', 'base64')`) so the data URI stays short. Assert the
round-trip: remote `MimeType` = the passed type, `FileSize` = `buffer.length`,
and the field value starts with `'data:<mime>;base64,'`. After a download, the
edit-form preview `src` should match the round-tripped data URI.

---

#### Factory PK `?? ''` bug

**A factory PK using `data.id ?? uuid()` keeps `''` — use `||` instead.**
Forms often construct a new record with `<pk>: ''` (to satisfy a required-id
type) and rely on the factory to mint the real id. But `'' ?? uuid()` keeps the
empty string (`??` only replaces `null`/`undefined`). The row is created locally
("works"), but on upload the server rejects an empty PK. This is invisible to
unit tests that mock the repo or seed explicit UUIDs — the real sync in §3d is
what surfaces it. Fix: change `?? → ||` (a falsy/empty PK regenerates); add a
factory unit test asserting `createX({ id: '' }).id` is a fresh UUID and an
explicit id is preserved.

---

#### Capture upload request payload

**Capture the `/sync/upload` (or equivalent write endpoint) REQUEST payload to root-cause a write 400.**
A response body shows the error message but not which field caused it. The
request body shows exactly what the FE sent. In a throwaway diagnostic spec:

```ts
page.on('request', r => {
  if (r.url().includes('/your-write-endpoint/') && r.method() === 'POST')
    console.log(r.postData());
});
```

Comparing the create vs update request payloads isolates classes like
"null date was never sent by the FE, not dropped by the API" and "NULL field
was re-serialised to `'[]'`". `console.log` in the test reaches the harness
stdout/log.

---

#### Dev-identity id vs email/oid

**A server check resolving the recorded user fails on a dev-identity mismatch.**
When a governed backend action looks up the recorded user by an ID field (e.g.
`overrideBy`, `reviewerId`, `createdBy`) and the FE dev login records the
user's **email** instead of the **oid/sub**, the server can't resolve the user
and refuses the action. Production is fine (real token carries the oid); dev
bypass fails because the FE recorded the wrong identifier.

General rule: when a sync write is refused by a server check that looks up the
recorded user, suspect a dev-identity mismatch (email vs oid/sub; FE id ≠ the
seeded/auth user) before assuming a server bug. Fix: ensure the FE dev-login
records the same identifier the server uses to look up the user.

---

#### Free-text field that is secretly an FK

**A plain text input for an FK column saves locally but 400s on sync.**
Some forms expose an FK column as a plain `<TextField>` with no existence check.
Locally the row saves fine, but the server has a real FK constraint, so on upload
it 400s with a constraint violation. The tell: only syncing cases fail;
validation / dropdown-only cases pass.

Triage: **test-setup issue** (the entity legitimately requires a real parent —
use its real id in setup) **AND** a real **app data-integrity bug** (the form
accepts a fake id that will never sync — fix with an existence check on save and
a clear error message). Surface both findings; don't paper over them.

---

#### Additional harness-specific gotchas

**A halted run can orphan the dev server process.**
If you kill a harness run mid-flight, the child dev server can linger on the
harness port. The next run errors "Port N is already in use" at globalSetup.
Free it: find the PID (`netstat -ano | grep ':PORT' | grep LISTEN` on Windows;
`lsof -i :PORT` on macOS/Linux) and kill it.

**Don't edit app source during a run.**
HMR will contaminate mid-run results — the app rebuilds while a test is
executing and the next assertion hits an inconsistent state.

**A `!== undefined` guard on a nullable field is a latent app bug.**
A control gated by `disabled={entity?.someId !== undefined}` is permanently
disabled when the entity loads with `someId: null` (most ORMs return `null` for
SQL NULL, never `undefined`), so `null !== undefined` is always `true`. The
harness surfaces it as a `.click()` that hangs on an element whose snapshot
shows `aria-disabled="true"`. Triage: **app bug** — fix the guard to a
truthiness / `!= null` check.

**A list-row `onClick` may navigate to an action, not a detail view.**
On some list pages the row body performs a specific action (e.g. "Create Actual
from Planned"), while Edit/Delete live on a per-row action menu. Drive
Edit/Delete via the menu; use `getByRole('row', { name })` for assertions only.

**A composite list-card primary text → use `filter({ hasText })`, not exact text.**
A `<ListItem>` whose primary text is a composite (name + chip + count, etc.)
has no single text node equal to the bare name — `getByText(name, { exact:
true })` times out. Use `getByRole('listitem').filter({ hasText: name })` and
open actions via a named button on the card.

**An open `<Dialog>` aria-hides the rest of the page — close it before any top-bar action.**
MUI's modal Dialog sets `aria-hidden`/`inert` on everything outside it. Top-bar
buttons ("Sync", "Save") vanish from the accessibility tree while a dialog is
open. If a `sync()` / top-bar action times out right after a wizard step that
itself succeeded, the dialog is still open. Fix: dismiss the dialog first, then
assert `getByRole('dialog')` has count 0 before proceeding.

**A derived display field may differ from the seeded/stored value.**
"Seats Used" renders `currentSeats/maxSeats`, but the backend derives
`currentSeats` from active users (1), not the seeded `0` → the cell reads
`1/100`, not `0/100`. Assert the stable part with a regex (`/\d+\/100/`) and
don't assume a field equals what was seeded when the server may compute it.

**A field required only when a sibling has a given value — test conditionally.**
E.g. `projectId` is required iff `scopeType === 'PROJECT'` (also disabled until
then). Test: set the trigger value + leave the dependent empty → assert the
dependent's error + disabled submit; then satisfy it → assert the value persists.
Don't treat it as always-required or always-optional.

**A `disabled={!canSave}` submit button changes how validation is testable.**
See §3e (Per-field validation) — the recipe is `assert toBeDisabled() while
invalid → blur() to surface helperText → assert toBeEnabled() once valid`.

**An engine-produced area: generate data through the real UI action, don't seed the end-state.**
Some areas' rows are produced by a background engine (e.g. "Run QC Check"
produces QC results). A write guard may require the engine's lineage (a hash
matching the real engine run). You can't shortcut by seeding the end-state
directly — drive the real generating action. A dev seed that fills the
end-state directly is fine for UI-render-only cases but may carry dangling FK
refs that won't survive a sync.

**After generating in-memory state, navigate by client-side button, not `page.goto`.**
`page.goto` does a full reload — the app re-bootstraps from persisted storage,
dropping any in-memory rows not yet flushed by an auto-save debounce. Use an
in-app `navigate` button after an action that produces in-memory data. Use
`page.goto` only after a forced save or when a clean reload is intentional.

**A status-conditional second button creates a state-dependent strict-mode collision.**
A button that only appears in a given state (e.g. "Review & Sign Off" after
reaching IN_REVIEW) can substring-collide with an always-present one ("Sign
Off"). Use `{ name: …, exact: true }` once the state flips.

**A tabbed detail panel hides action buttons behind a non-default tab.**
An exception/detail panel may render tabs (Summary / Context / Decision) with
action buttons under a non-default tab. Click the owning `tab "<Name>"` first;
otherwise `getByRole('button', { name: 'Accept' })` hangs 240s.

**An admin endpoint that self-protects the caller.**
A self-service admin endpoint may refuse to demote/deactivate the calling user.
When the harness seeds one user whose id == the bypass oid, that user IS the
caller — so demoting the sole admin is correctly blocked (400 by design), not a
bug. Assert the guard, not a forced-pass round-trip.

**A UNIQUE constraint on a nullable column does NOT enforce uniqueness for NULL rows.**
SQLite treats NULLs as distinct (each NULL is unique to itself), so duplicate
rows with `NULL` in the UNIQUE key column insert cleanly locally, then 500 on
sync (most relational databases — Postgres, MySQL, and others — allow only one
NULL per UNIQUE column). A dup guard that relies on the DB constraint silently
fails for the all-NULL case. Fix: pre-check existence explicitly before insert
(match NULLs via `IS NULL`).

**A CRUD area with no delete UI — state it as an absence.**
Some entities are managed by enable/disable (a boolean flag), never deleted,
even if the schema has a `deletedAt`. Don't author a delete/soft-delete case;
state the absence (genuinely no UI), and the conflict case has no
soft-delete-propagation half.

**A two-entity area can share one runbook with two ID prefixes.**
When an area owns two first-class entities with a FK dependency, use a distinct
`TC-<CODE>` prefix per entity in the same runbook/spec (`TC-ORDER-*` +
`TC-LINE-*` where an order-line needs an order) rather than splitting files — the FK chain is shared and the
prefixes keep the mapping unambiguous.

**A governed status column the edit form deliberately omits — test it via a workflow-action case.**
When a lifecycle column only advances through governed actions (e.g. a
`status` that changes via a "Submit" button, not the edit form), the every-field
F1 must assert it stays at its created default, and a separate Targeted case
drives the action + asserts the transition. Don't try to set it via the form.

**A `TextField` `aria-label` on the wrapper names the wrapper, not the input.**
`getByRole('textbox', { name: '<aria-label>' })` resolves nothing — the
aria-label lands on the outer wrapper; the actual input's accessible name is its
`placeholder`. Target by placeholder (`getByPlaceholder('...')`) or fix the
a11y by moving the label to `inputProps={{ 'aria-label' }}` / `slotProps.htmlInput`.

**A multi-step builder dialog's per-item label may be a computed value — select by position.**
A column-picker dialog may render each option via a computed label, not the
field label you added it by. When you control the inputs (added exactly N), use
the nth checkbox — `dialog.getByRole('checkbox').nth(0).click()` — label-independent.

**An `!= null` guard vs `!== undefined` — SQLite/ORM returns `null`, never `undefined`.**
A guard written as `entity?.someId !== undefined` is always `true` when the ORM
returns `null` for a missing FK. The correct guard is `entity?.someId != null`
(or truthiness). When a disabled-by-default control won't enable after data is
loaded, check the guard condition in the form source.

**A nullable JSON-array column that read-backs to `[]` may 400 on every update.**
If a null JSON-array field is coerced to `[]` on read (common in ORM
`fromSqlRow` helpers), any update re-uploads `"[]"` — a non-null value that a
server null-required invariant rejects. Symptom: create syncs; the first edit
400s with a "must be null" error. Fix: keep the column as `undefined`/`null`
in the entity when it was stored null; don't coerce to `[]` globally.

**A readiness-gated route requires the whole prerequisite chain assembled in setup.**
Some creates are blocked until a chain of preconditions is met (e.g. an order
requires an active customer + at least one in-stock catalogue item + an eligible
record in scope). Build the full gate-satisfying chain in setup helpers; drive
the prerequisite picker via its accessible label, not `nth`.

**A feature-flag / permission-gated area silently doesn't render if the flag is absent.**
If some UI is gated by `hasFeature('<flag>')` or a permission/plan/role check,
the harness seed must include that flag in its feature/plan/role config — a
`NULL`/empty features value is often a "no features" state, not an "all features
by default" fallback (confirm the repo's default). Seed the required flags
explicitly; a missing flag silently leaves the gated area un-rendered.

**A parent+child where the child editor only renders after the parent is saved.**
Some parent forms hide the child sub-editor on `/new` ("Save first to manage its
children") and show it only on the `/edit` page. So the child-table case must:
create the parent → open the edit page → manage children there. Verify by
joining child to parent and polling the count.

**A sub-entity edit-nav race — assert the sub-entity URL before clicking `Edit`.**
The pattern `getByText('<row>').click()` → `getByRole('button', { name: 'Edit'
}).click()` is a race: the parent detail page (still showing during row
navigation) may also have an `Edit` button. Under load, the click lands on the
parent's Edit. Fix: wait for the sub-entity detail URL first —
`await expect(page).toHaveURL(/<entity>\/\d+$/)` — then click `Edit`. Apply to
every sub-entity edit case.

**`getByText('<label>')` collides with a description paragraph that quotes the label.**
A control label (`Sync Interval`) is often echoed in a section description ("…
sync interval …"). The default substring match resolves to the always-present
paragraph, not the control. Fix: `getByText('<label>', { exact: true })`.

**A `<TextField>` aria-label naming the wrapper is the OUTER div, not the `<input>`.**
Move the label to `inputProps={{ 'aria-label' }}` or `slotProps.htmlInput` to
name the actual input.

**A case's own setup can disable the control the case needs.**
A case that creates work (a pending row, an in-flight job) and then presses the
button that acts on it may find the button greyed out — because the state it
just created is an input to that control's enablement. Seen as `busy =
pendingCount > 0` disabling both **Run now** and **Rebuild index**: the case
broke a document so the indexer would fail to read it, which put the row back in
the pending set, which turned off the button the case existed to exercise. The
manual step ("press Run now three times") was simply unrunnable. **Read a
control's `disabled` expression, not just its label, whenever a case sets up
state before clicking it** — and where the UI genuinely locks itself out, drive
the action from the endpoint behind the button, which usually carries a narrower
guard.

**A DB-constraint case written as an `UPDATE` can pass vacuously.**
`UPDATE … WHERE "Email" = …` proves a CHECK constraint only if a row matches. In
a projected read model it may not: a table fed by a domain event holds rows only
for the entities that have raised one, so for an untouched entity the statement
matches zero rows, **succeeds**, and the assertion that the write is *rejected*
never fires. Green, proving nothing. Use an `INSERT` — it always attempts the
write, so it always reaches the constraint, and it assumes nothing about seeded
data. If an UPDATE is unavoidable, assert the target row exists first.

---

## §9 Test-case ID scheme

`TC-<AREA>-<TIER><n>` — stable across the runbook markdown and the generated
e2e spec (use as the test title / Playwright test name).

- `<AREA>`: short uppercase code for the area, e.g. `PROJ` for Projects, `USER` for Users, `ORDER` for Orders — a short uppercase code per area. Choose a code that is unambiguous within the repo and record it in the profile.
- `<TIER>`: `S` smoke · `T` targeted · `F` full.
- `<n>`: sequential integer, starting at 1.
- Examples: `TC-PROJ-S1`, `TC-PROJ-T3`, `TC-PROJ-F2`.

**Never renumber an existing ID.** Renumbering breaks the spec mapping (the
spec test title must match the runbook row to maintain 1:1 traceability).
Append new IDs; mark retired ones as `[REMOVED]` with a note.

When an area owns two entities with distinct prefixes in one runbook, use two
series: `TC-ORDER-S1`, `TC-LINE-S1`, etc.

---

## §10 Self-improvement (dual target)

Phase 6 is the last step of every area run. It is not optional. Every lesson —
whether it applies only to this repo or to any future web-app — must be
recorded before closing the area.

### Classify first

Ask: *"Would a developer running this plugin in a different repo with a
different FE stack hit the same class of problem?"*

- **Yes → generalizable.** Write to the global sidecar (always) and the
  plugin git source (when reachable). See below.
- **No → repo-specific.** Write to the per-repo profile and the runbook log.
  Stop there.
- **Unsure → treat as generalizable.** Better to over-write to the sidecar
  than to lose a lesson.

### Repo-specific lesson

1. Open `.claude/regression-runbooks/profile.md` in the target repo.
2. Append under the **"Repo-specific gotchas"** section (create the section if
   absent): a short dated bullet describing the symptom, cause, and fix in this
   repo's context.
3. Open the relevant `docs/runbooks/<area>.md`.
4. Append to its **Self-improving log** (bottom of the file): date, brief
   description of what was learned, and any runbook step or selector that was
   updated as a result.

### Generalizable lesson — dual write

#### Step A — Global sidecar (ALWAYS)

Append to `~/.claude/regression-runbooks/lessons.md`. Create the file if it
does not exist. Each entry is a dated bullet in this format:

```
- **YYYY-MM-DD | <area> (<repo-name>):** <symptom> → <cause> → <fix>.
  Target plugin file: `skills/regression-runbooks/<file>.md`.
```

Example:

```
- **2026-06-19 | Catalogs (my-app):** Factory `id ?? uuid()` kept `''` because
  `??` doesn't replace falsy strings → rows created locally but rejected on
  upload with empty PK → change `??` to `||` in all factories.
  Target plugin file: `skills/regression-runbooks/reference.md`.
```

Write the sidecar entry **even if the plugin git source is not reachable on
this machine**. The sidecar is the permanent cross-session record; the plugin
edit is the propagation step.

#### Step B — Plugin git source (WHEN REACHABLE)

If the plugin git source is present on this machine (e.g.
`C:\W\repo-standards\plugins\regression-runbooks\` exists and is a git
working tree):

1. Locate the relevant plugin file — usually
   `skills/regression-runbooks/reference.md` (gotcha catalogue, §8) or
   `skills/regression-runbooks/discovery.md` (ledger schema) or
   `skills/regression-runbooks/SKILL.md` (workflow change).
2. Edit the file: add the gotcha entry, expand a section, or correct a
   procedure — whichever the lesson demands.
3. Record the pending bump (a `TODO: bump plugin.json` line at the top of the edited file, or an entry in the plugin's CHANGES/changelog) before the next publish. Do not bump it unilaterally in the
   same session unless you are explicitly managing a release; record the need.

If the plugin git source is **not reachable**, skip Step B. The sidecar entry
(Step A) is sufficient to carry the lesson forward.

### Periodic sidecar → plugin fold-in

Whenever you are actively working in the plugin git source (e.g. authoring a
new area or updating skill files), scan `~/.claude/regression-runbooks/lessons.md`
for entries that have not yet been folded in:

1. For each unfolded entry whose target plugin file is one you are already
   editing, add or merge the lesson into that file now.
2. Mark the sidecar entry as folded: append ` ✓ folded <YYYY-MM-DD>` to the
   bullet.
3. Record the pending bump (a `TODO: bump plugin.json` line at the top of the edited file, or an entry in the plugin's CHANGES/changelog).

This keeps the sidecar from accumulating stale un-propagated lessons
indefinitely.

### If nothing generalizes

Record in the runbook's Self-improving log: `"Skill reviewed — no generalizable
lesson this run."` This confirms the step was not skipped.
