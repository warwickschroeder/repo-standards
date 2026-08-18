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
pattern from the router (e.g. `/parents/:id/children/:childId`).

⚠️ **Navigate the way a user does. `goto` is the exception, not the default.**
Click the sidebar entry, the row link, the breadcrumb, the back button. Reach for
`page.goto(url)` **only** when there is no in-app route to the state: the very first
load of the run, a deep link that is itself under test, an error or not-found URL a
user could only arrive at from outside, or a state the UI genuinely cannot reach.
Everywhere else, clicking is both cheaper and a better test.

*(An earlier version of this section said the opposite — that specs should prefer
`goto` for setup and reserve clicking for cases that test navigation. That advice is
withdrawn. It is wrong on all four counts below.)*

- **`goto` is a full page load.** The SPA re-mounts, every provider re-runs, and in an
  offline-first app the local database re-initialises from scratch. Measured on
  DrillLogify 2026-08-09: a spec averaging ~2.5 `goto`s per test spent ~35 s of every
  52 s test on boots. Clicking costs milliseconds.
- **It makes waits flaky, and lies about why.** After a reload the control the next
  step wants has not rendered, so a wait tuned on a warm page starts timing out — and
  it fails on a *locator*, which reads as a selector problem and sends you looking in
  entirely the wrong place.
- **It is unwatchable.** A headed run blanks to white between steps, which reads as the
  app reloading itself. The first thing anyone watching asks is why the page keeps
  reloading, and the answer is that the spec is doing it.
- **It tests less.** A `goto` skips the nav entry, the row link and the router wiring
  that a real user goes through — the exact things that break. A spec that only ever
  deep-links can be fully green while no one can reach the page.
- ⚠️ **Worst of all, it silently COMPLETES whatever the previous step started**, so the
  step under test is never observed. A reload dismisses dialogs, discards unsaved state
  and resolves guards, and the case then passes on the reload's behaviour rather than the
  action's. **Measured, DrillLogify 2026-08-09:** a case clicked *Cancel* on a
  half-filled form and immediately `goto`'d the list. Cancel on a dirty form does not
  close it — it raises a *"Discard unsaved changes?"* guard — and the reload destroyed
  that dialog along with the form. So the case proved that *reloading* discards, never
  that Cancel does, and **the discard guard had no coverage at any tier**: the one
  control standing between a user and losing what they had just typed. It surfaced only
  when the reload was replaced with a click.
  **The tell: a case that navigates away immediately after the action it is testing is
  asserting the navigation, not the action.** Look for `goto` on the line after the
  interaction the case is named for.

**Reset by navigating, not by reloading.** Where a spec used `goto` to get back to a
known state, click back to it (the sidebar entry, the breadcrumb, the back control) and
wait on a control unique to the destination. Where a case needs a specific record, click
through the list to it rather than reconstructing its URL from an id.

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

**An area that persists nothing is not exempt, its two ends are different.** The rule reads as though it
needs a stored row, so an area with no row looks excused, and that is how a whole class of
per-deployment values goes untested: branding, support addresses, environment naming, build identity,
feature switches served at boot. For those, the input end is **the configuration the server serves** and
the read-back end is **each surface that renders it**:

- Stub the served configuration with distinctive values, then walk every surface that consumes a field
  and assert the value arrived (a logo's accessible name, a page title, a banner, a version tag, a
  `mailto:` link's address *and* its generated subject line).
- Then remove the stub, reload, and assert each surface returns to what the deployment actually serves,
  read from the live endpoint rather than hard-coded, so the case also passes on another customer's stack.
- Name the fields that have **no** observable surface (an identity client id, a scope) and say what owns
  them instead: usually an integration test for the endpoint plus a manual second-environment step,
  because only a real sign-in proves they are wired.

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

Record **both** the full-suite command and the **single-case filter** in the
profile. The second is the one you will actually spend the run in.

### ⏱️ Re-run the CASES you fixed, not the suite

**The full suite is a confirmation step, not a debugging tool.** Run it once at
the end to prove nothing else moved; use a filtered run for every iteration in
between.

Measured 2026-08-08: a rebuilt 31-case suite came back 19/31. Fixing the
failures and re-running everything took **31 minutes**, and then 31 again.
Switching to `-g "TC-AXPL-T24|TC-AXPL-F5"` took the same fix-verify loop to
**1.7 minutes** — **18x** — and surfaced a second, different failure inside one
of those cases within two minutes instead of half an hour.

- **The real cost is not wall-clock, it is batching.** A 31-minute loop pushes
  you to bundle several speculative fixes into one run, so a red result cannot
  be attributed to any one of them. A two-minute loop lets you change one thing
  and learn one thing.
- **Every runner has the flag:** `-g` / `--grep` (Playwright), `-t`
  (Vitest/Jest), `--spec` (Cypress). Pipe several ids with `|`.
- **Then run the whole area once at the end.** A filtered run cannot tell you a
  fix broke a case you were not filtering for, which is exactly what a change to
  a shared helper or a shared component does.

### Read the failure screenshot before theorising about the failure

Most runners save an image on failure (Playwright's `screenshot: 'only-on-failure'` writes
one next to the error text). **Open it.** It is already on disk, it costs nothing, and it
routinely answers in seconds what the error message alone gets wrong.

**2026-08-09, DrillLogify.** A case failed on `dialog count expected 0, received 1` after
clicking *Keep editing* on a discard guard. Reasoning from that line alone produced **two
wrong fixes** and a suggestion that the app might be broken. The screenshot showed the guard
open over an **empty** name field, which immediately located the failure at a *later* step
than assumed and identified the real cause: clearing a field does not make a dirty form
clean, because the dirty flag records that edits were *made*, not that content differs from
its initial value. The app was correct throughout.

⚠️ **And a person watching a headed run sees what no log contains.** In that same session
the user caught a reload storm, a stalled run and a spec stuck on a popup — none of which
appear in the text output until a multi-minute timeout finally fires. So: **run headed**,
and **when someone says it looks stuck, go and look** rather than reasoning from the log. A
stuck run is nearly always a locator waiting on something that will never appear, and the
screen names the control.

**2026-08-09, Forge.Translation.** The same mistake, the same cost, in a different repo. A case
failed on `waiting for menuitem /delete/i`. Reasoning from that line alone produced "the list
must be showing stale cached data" and a **60-second retry loop that could never have helped**,
because it retried a state that was never going to change. The screenshot showed a **populated
search box**: the list was in search mode, and search hits are mapped with `canDelete: false`,
so the Delete item genuinely did not exist. One look would have replaced a wrong fix with the
right one. Two independent repos, two wrong diagnoses, one lesson: the error text names the
locator that missed, and **only the image says why**.

### Escalate deliberately: screenshot → trace → live DevTools

The screenshot answers most failures. When it does not, escalate in this order and stop as soon
as you have the answer. Each rung costs more, and each is easy to reach for too early.

1. **The screenshot.** Free, already on disk, whole-page state. Always first.
2. **The trace.** `trace: 'retain-on-failure'` writes `trace.zip` beside the screenshot;
   `npx playwright show-trace <path>` opens a DOM snapshot **per step**, plus the network log,
   console output, and the locator each action actually resolved to. It is a recording of *the
   failure that happened*, which is why it beats re-running by hand: a flake or a race may not
   reproduce, and the trace has it either way. Reach for it when the question is "what was the
   page like three steps before the error".
3. **Live Chrome DevTools (the MCP server), driven by hand against the running app.** The only
   rung that lets you *interact*: evaluate an expression, read an element's computed style,
   watch a request as it is issued, test a hypothesis directly. Use it when the question needs
   poking rather than looking: a response body, a console error with no visible symptom, a
   layout question a still image cannot settle.

**Two rules for rung 3.** It is a *diagnostic instrument only*, never how a check is run or a
screenshot captured: it attaches to **one shared browser**, so a second session on the machine
fights it for tabs and page state, and it is not reproducible a week later (same reasoning as
the capture-script rule under Approved screens). And whatever it teaches you goes back into the
spec as an assertion. A cause found in DevTools with no test holding it is a bug you have
agreed to find again.

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

### Non-DOM visuals (maps, charts, canvases): the class-hook rule

Anything drawn as **SVG or canvas** has no role, no accessible name, and no text
for `getByRole`/`getByText` to find. Leaflet pins, hand-rolled chart marks, the
strip-log columns: all of them are `<path>` / `<rect>` / `<circle>` elements.

- **Tag them with a stable `className` and assert on COUNTS.** Never assert on
  stroke or fill colour: the theme remaps every colour per variant (Ocean /
  Graphite / Warm / Slate) and again per light/dark, so a colour assertion breaks
  on a palette change that broke nothing real. `page.locator('.collar-pin')` plus
  `toHaveCount(n)` is stable; "the pin is orange" is not.
- **LEAFLET + REACT-LEAFLET TRAP: `className` in `pathOptions` is dead on
  arrival.** Two independent layers drop it. react-leaflet's `usePathOptions`
  applies path options **only** via `instance.setStyle(options)` in an effect,
  never through the Leaflet constructor; and Leaflet sets `options.className`
  **only** in `SVG._initPath` at creation, because `_updateStyle` rewrites
  `stroke` / `fill` / `stroke-width` and never touches the class. So the class
  never lands: not at mount, not on update. The failure mode is nasty, because
  the *visible* state still changes correctly (colour and weight DO go through
  `setStyle`), so the feature looks right in the browser and only the
  class-based assertion fails, which reads as a flaky selector rather than the
  real bug. Fix: give each mark its own component holding a `ref`, and set the
  classes on the element in a `useEffect`
  (`layer.getElement().classList.add('x')` / `.toggle('x-focused', on)`). Child
  effects run before parent effects, so a `<CircleMarker>` rendered by that
  component is already added to the map when the effect fires. That effect is
  also the natural home for `bringToFront()`, since Leaflet paints in creation
  order and a highlighted mark otherwise hides under its neighbours.
- **A tooltip bound to a mark is not inside the mark.** Leaflet renders it into
  `.leaflet-tooltip` at the pane level. Hover the mark, then assert on the
  tooltip container filtered by text. Mind `permanent` vs hover tooltips: a
  `CircleMarker` takes exactly one Tooltip, so a component showing permanent
  labels in one view and hover labels in another has **no hover tooltip at all**
  in the permanent view. Assert hover behaviour on the view that has it.
- **Record the hook in the area's Testability-gaps table** with the reason
  ("SVG path, no role"), so the next author does not "fix" it into a `getByRole`
  that cannot exist. (Projects T27, 2026-08-01.)

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

### Absence assertions need a positive control, and the control must be UNGATED for that persona

An RBAC case is mostly absence assertions: "a Read Only user does not see X". Every one of them passes just as happily when the page never rendered at all, which on a lazy route is the likelier failure. So each absence gets a **positive control** asserted **first**: something of the *same locator shape, in the same landmark*, that the persona **does** see.

**The trap is picking a control that is itself gated.** "The sidebar has no Sync Hub entry" paired with "but it does have Import Hub" looks like a control and is not: Import Hub is `canImport`-gated and Read Only lacks `canImport`, so it is absent for exactly the same reason as the thing under test, and the case fails on the control rather than on the behaviour. Read the nav/menu definition and pick an entry with **no permission and no feature gate** — ideally a sibling in the **same section**, so the control also proves that section rendered.

```ts
// Positive controls FIRST — same landmark, same role, ungated for this persona.
await expect(page.getByRole('main').getByRole('button', { name: 'Quick actions' })).toBeVisible();
await expect(page.getByRole('navigation').getByRole('button', { name: 'User Settings' })).toBeVisible();
// …then the absences.
await expect(page.getByRole('navigation').getByRole('button', { name: 'Sync Hub' })).toHaveCount(0);
```

Pair it with a **cross-persona** control where the cost is one extra context: assert the *same locators* find the entries for someone who is allowed, so a silently-wrong locator cannot pass the absence half.

**And hand-verification does not substitute for running it.** Inspecting the live DOM proves a locator resolves *for you* — normally a fully-privileged dev persona. It cannot catch a control that is invisible to the persona the case logs in as. (2026-07-31, DrillLogify `TC-SYNC-T7`: rewritten, hand-verified, left unrun, failed on precisely this.)

---

### Gotcha catalogue

> These are common web-app (MUI/React/Playwright-class) gotchas. Repo-specific
> gotchas live in the repo's `.claude/regression-runbooks/profile.md`.

---

#### A utility class that shares a token's NAME but not its value leaves a control with no focus indicator

**2026-08-09, Forge.Translation.** Four fields were styled `outline-none focus:border-accent`, which reads as "swap the browser ring for an accent border". In that app's theme `--color-accent` was mapped to `--surface-hover` (the brand accent being `primary`), so the browser ring was suppressed and the replacement border came out **quieter than the resting state**. Focused and unfocused were the same colour against the same backdrop, in both themes. It survived every code review, because the class list reads correctly, and every screenshot, because a screenshot never shows a focus ring you have not triggered.

- **Measure the indicator on the live page.** Focus the control, then compare `outlineStyle`/`outlineWidth`, `boxShadow`, and the focused vs resting border colour against what is behind them. A focus state that changes nothing, or changes in the wrong direction, is the finding.
- **Treat a utility/token name collision as its own defect class.** Before trusting any `*-accent`, `*-primary` or `*-muted` spelling, grep the theme mapping for what that name actually resolves to. The bug is invisible precisely because the code says the right word.
- **Never accept `outline-none` without a replacement in the same class list.** That pairing is greppable across a repo in one command and is worth checking as a sweep, not one screen at a time.

#### Hand-rolled empty and error panels converge, and then an outage reads as "nothing to do"

**2026-08-09, Forge.Translation.** Eleven screens each styled their own "X is unavailable right now" card and their own empty card, and both had drifted into the same bordered grey panel with the same muted sentence. A reviewer meeting the error state sees an empty queue and goes home satisfied. §8's "four designs, not one" only holds if **one component** owns loading, empty and error: the error variant needs a distinct icon in the danger colour and `role="alert"`; the empty variant needs a subject icon and an invitation to act.

- **The tell is countable before you look at anything.** `grep` one screen's unavailable sentence across the codebase; every extra hit is a state panel free to drift.
- **Cover the states that a healthy backend cannot produce** by intercepting the request (see the fault-injection entry above), and assert the error text **and** the absence of the empty text, so the two can never collapse into each other again unnoticed.

#### A response field no client reads is dead, and its only tests assert that it is

**2026-08-09, Forge.Translation.** A queue endpoint ran a second query on every page load for the 20 most recent decided rows. No screen had rendered them since a searchable History tab replaced them, and the **only** tests naming the field asserted it was *not* rendered. A field whose entire coverage is `expect(...).toBeNull()` is a field to delete.

- **When auditing an endpoint, grep the client for every response field.** The ones with no read site are dead weight that will rot silently, because nothing renders them and so nothing notices when they go wrong.
- **Record the removal as an `absent:` row in the Coverage map**, with the reason, so the next reader does not helpfully re-add it "to save a request".

#### A help affordance beside a field steals that field's accessible name

**2026-08-09, Forge.Translation.** Adding a `Help: decided to` button next to a `Decided to` input made `getByLabelText(/decided to/i)` match two elements, and two green unit tests failed on strict mode the moment the tooltip landed. The accessibility improvement and the test break have the same cause: both resolve by name, and the new button carries the field's name as a substring.

- **Name a help affordance after the question it answers, not the control it sits beside:** `Help: how the end of the range is counted`. It reads better aloud and it stops colliding.
- Same family as any repeated per-row control: if a name can be a substring of a neighbour's, use `exact` or make the names disjoint from the start.

#### A failure with no screenshot did not fail an assertion — re-run that one case first

**2026-08-09, Forge.Translation.** A run reported `browserContext.close: Target page, context or browser has been closed` for one case. Its artifact folder held an `error-context.md` containing only that line and **no `test-failed-1.png`**, because there was no page state left to shoot. That shape is a teardown race, not a defect, and the case passed immediately on a single-case re-run.

- Extends the standing rule (*read the failure screenshot before theorising*) with its complement: **screenshot present → open it first; screenshot absent → the failure happened outside the test body**, so re-run that one case before investigating anything.
- A whole-suite failure of this shape, contiguous to the end of the run, is the orphaned-stack symptom instead — check for a listener on the app's port.

#### A stub registered after the app has already refetched intercepts nothing

**2026-08-09, Forge.Translation.** Switching persona re-identified every query and refetched immediately, and clicking the nav entry while already on that route did not remount it, so the "navigate like a user" helper issued no second request. The stub sat armed while the assertion ran against real rows, and the case failed with the app behaving correctly.

- **Register the stub, then force one cold fetch** (`page.reload()`). A reload is the one place it beats in-app navigation, precisely because it re-issues every query.
- **Prefer `route.fetch()` plus an override to a hand-written body.** The fake then keeps the server's real shape and changes only the field under test, so the case still fails when the contract moves — which a hand-written payload would hide (see *forcing a case's input with a payload you made up*).

#### Presence is not usability: a responsive case that asserts a heading vouches for a layout nobody can use

**2026-08-09, Forge.Translation.** The mobile-breakpoint case signed in at 390×844 and asserted the library heading was visible. It passed for months while the sidebar held its fixed 248px column at **every** width, leaving **142px of a 390px viewport** for the page, which then scrolled sideways. The nav was using two thirds of the screen to say where you weren't, and the case was green because a heading is indeed present in an unusable layout.

- **Assert geometry, not presence, for anything responsive.** Read it off the live page: `getBoundingClientRect().width` for the content region, and `scrollWidth > clientWidth` for the sideways scroll that is the real symptom. Check it with the nav both closed **and** open — an overlay keeps the content's width, a column steals it.
- **The image is what found it, not the assertion.** This is the clearest argument for the approved-screens step (§11): capture the risky breakpoint, and look at it.
- **The note beside the case had been asserting the opposite of the truth.** It claimed the sidebar "is collapsed at this breakpoint"; it was fully open. **A runbook note describing behaviour is a claim with no gate behind it** — re-derive such notes from the running app during a review rather than reading past them, because they are the one part of the file nothing can fail.

#### An affordance you cannot assert is an affordance users cannot reach — the native `title` trap

**2026-08-09, Forge.Translation.** Every explanatory hint on the users screen was a native `title` attribute, including the reason each disabled row was disabled. `title` never appears on keyboard focus, never appears on touch, waits about a second on hover, cannot be styled — and **cannot be asserted in a test or captured in a screenshot**. So it passed every gate and every review while being invisible to a large share of the people who needed it, the reviewer included.

- **Treat "I can't write an assertion for this affordance" as evidence it doesn't reach users**, not as a testing inconvenience to route around with a DOM-attribute check.
- **A hint on a DISABLED control can never open at all** — no pointer events, no focus. It has to sit *beside* the control as its own focusable button. A hover tooltip on the control is the intuitive fix and is dead on arrival.
- Prefer a click/tap-opened affordance for anything a touch user must read; hover tooltips reach neither touch nor (for `title`) keyboard.

#### A lookup table's plausible fallback is where its own bugs hide

**2026-08-09, Forge.Translation.** The app shell mapped route → top-bar title, falling back to the product name. A route present in the nav but absent from the table therefore rendered the brand name in the top bar: wrong, daily-visible, and **indistinguishable from a deliberate choice**.

- **Ask what a missing entry looks like to a reader.** If the answer is "fine", the fallback is a bug incubator — make a miss look broken (here: *"Page not found"*).
- Doing so also lets the regression case be written as an **absence** (*the banner never reads "Page not found" on any nav route*) instead of a second copy of the table, which would drift from the first within a release.

#### "Unreachable without a fault" is a reason to inject one fault, not to leave the branch uncovered

**2026-08-09, Forge.Translation.** A list-unavailable panel and a failed-save toast had never once been rendered by any test: both exist *because* the server or network failed, and a backend that is up cannot be made to fail through the UI. They had quietly become permanently uncovered.

- **One intercepted route per case reaches them**, with every other request still hitting the real API. That is not a return to a mock-backed suite; say so in the case so a later reader doesn't "clean it up".
- **The valuable assertion is what happens to the CONTROL, not the error text.** A row still displaying the value the user chose after a failed save is worse than the failure, because they walk away believing it took. Assert the message *and* the revert *and* the re-enable.
- Beware ordering: if an earlier step already loaded that screen successfully, a client cache will serve the good data and your injected fault never fires. Force a cold load so a real request is actually made.

#### Contrast and computed-colour defects are invisible to looking, and two traps make measuring them wrong

**2026-08-09, Forge.Translation.** The app's quiet-text token failed WCAG AA at every size it was used, in **both** themes (3.47:1 light, 4.35:1 dark, against a 4.5 floor) — column headers, row sub-labels, sidebar section labels. Invisible in every screenshot: a colour that looks tastefully quiet and a colour that fails AA are indistinguishable by eye.

- **Read computed styles out of the running page and compute the ratio.** A design review that only looks is half a review.
- **Trap 1: `getComputedStyle` returns modern colour functions unconverted** (`oklch(...)`, `lab(...)`). Parsing those numbers as RGB yields confident nonsense. Resolve through a canvas `fillStyle` round-trip instead.
- **Trap 2: toggling a theme class and reading styles in the same tick captures values mid-`transition-colors`.** Let it settle first, or every number is a blend of the two themes.
- Walk to the nearest non-transparent ancestor for the background, and fold any `opacity` on the element into the foreground before comparing — a disabled control at `opacity: 0.6` is not the colour its `color` property claims.

#### A CSS `text-transform` defect is invisible to every text assertion, in every tier

**2026-08-08, DrillLogify Web.** An assay table rendered its element columns through an uppercasing micro-label, so silver `Ag` displayed as `AG` and arsenic `As` as the English word `AS` — chemical symbols whose **case is their meaning**. It had shipped that way from day one.

- **No text assertion can see it.** CSS casing does not change `textContent`, so `getByRole`, `getByText` and every unit assertion pass identically whether the page reads `Ag ppm` or `AG PPM`. Only `getComputedStyle(el).textTransform` distinguishes them, and only a human reading the screen suspects there is anything to check.
- **Assert the computed style wherever a rendered string's CASE carries meaning:** chemical symbols, unit prefixes (`mV` vs `MV`, `µ` vs `M`), `pH`, gene names, currency and country codes, any identifier the user will retype.
- Same family as the `µS/cm → ΜS/CM` trap: the label was correct and the *presentation* corrupted it.

#### An `sx`/inline style loses to a theme rule written as a descendant selector

**2026-08-08, DrillLogify Web.** The fix for the above — `textTransform: 'none'` on the header cell — did nothing at all, and the page looked completely unchanged after a correct-looking change. The theme uppercases every table head via `MuiTableHead → '& .MuiTableCell-head'`, specificity **0,2,0** against the `sx` prop's generated single class at **0,1,0**.

- **Put the override on a CHILD element**, where a directly-set value beats an inherited one regardless of specificity.
- **The tell is a style that "does not apply" on a component library that ships descendant-selector theming.** Before assuming the prop is wrong, read the theme for a `'& .Mui…'` rule targeting the same property.

#### An anti-vacuity test must prove the PARSER resolves, not merely that files were walked

**2026-08-08, DrillLogify Web.** A new static gate shipped **green with four of its checks seeing nothing**: `\b` inside a JS template literal is the **backspace character**, not a word boundary, so ``new RegExp(`<${component}\b`)`` matched zero elements. The anti-vacuity test asserted only `files.length > 400`, which was true and beside the point.

- **Assert a known-nonzero count from the parser itself** (">100 TextFields", ">50 FormSections"), not from the file walker.
- **A gate that finds nothing is indistinguishable from a codebase that is clean**, and it is by far the more likely of the two. Prove a new gate fails against the unfixed code before trusting it green.

#### Measure the IMMEDIATE child before calling a wrapped-control pattern a defect

**2026-08-08, DrillLogify Web.** A scan for "a `Tooltip` around a disabled element" (which fires no events, so the explanation dies exactly when the reader is asking why the control did nothing) returned **23 sites**. Measuring the immediate child rather than the subtree returned **11**. The other twelve wrapped the disabled control in a `<span>` first, which is the library's documented workaround and is **correct** — the span still fires events. The app shell's Sync button was among them.

- **A sweep of the 23 would have broken a dozen working tooltips**, and the figure had already been quoted to the user as a backlog.
- **Subtree searches over-report by exactly the population that already applied the fix**, which is the worst possible bias: the sites that did it right look identical to the sites that did nothing.

#### A wait helper that asserts an ABSENCE never waits

**2026-08-08, DrillLogify Web.** A shared `areaReady()` helper was `await expect(page.getByText('Loading…')).toHaveCount(0)`. That is true *before* the component mounts as well as after, so it returned instantly and the next step ran against a page with no table. Two cases failed on a probe finding zero column headers, and one on "Database not initialized".

- **Wait on a positive signal first** (the table, the empty state, the heading), then on the absence.
- Same shape as the rule that absence assertions need a positive control, applied to waits rather than to assertions.

#### A fixture can trip the feature's own guard, and the case then asserts what the app is right to refuse

**2026-08-08, DrillLogify Web.** Three cases seeded *only* above-cutoff intervals, so the composited result covered 100% of the sampled length, the app's own catch-all guard correctly reported the cutoff instead of stating a finding, and the cases failed asserting the finding.

- **Where a feature has a guard, the fixture for the normal path must stay clear of it** — here by seeding a barren tail so the cutoff genuinely selects.
- **Recognise this shape rather than "fixing" it by weakening the assertion**: the failure is the guard proving itself on its first run.

#### `getByText('SOME_CONSTANT')` cannot prove a raw enum is absent

**2026-08-08, DrillLogify Web.** An assertion that the storage value `VALIDATED` never reaches the reader was satisfied by the correctly-rendered `Validated`, because Playwright's `getByText` with a **string** matches case-insensitive substring. The assertion could never have failed.

- **Whenever the point of an assertion is CASE, compare the rendered text exactly** — `allInnerTexts()` plus an equality check, or `getByRole(role, { name, exact: true })`.
- The same trap makes "the raw code never appears" checks vacuous for any label that is a case-variant of its code.

#### A devtools audit hint is not a defect report, and "fixing" one can destroy an accessible name

**2026-08-08, DrillLogify Web.** Chrome's issues panel reported *"A form field element should have an id or name attribute"* against a component-library `Select`. Adding `name` satisfied it. The library then derived a `buttonId` from that name and set it as **both** the element's `id` and its `aria-labelledby`, so the combobox labelled itself; `aria-labelledby` beats `aria-label`, and the control silently lost the name it already had. **Five cases died** on a `getByLabel` that had worked for months.

- **Nothing in the usual net sees it.** The page renders correctly, the console is clean, the control works with a mouse and a keyboard, and the failure screenshot shows `combobox "Active project": <value>` looking perfect. Only a locator that resolves *by name* fails.
- **Read what the hint is actually about.** This one concerns autofill and form serialisation, and the element it named was a hidden `aria-hidden="true"`, `tabIndex="-1"` input on a page with no form. The audit had nothing to say about the accessibility tree, which is what the change broke.
- **The general shape is a self-referential `aria-labelledby`.** Any `aria-labelledby` whose target id is the element's own id computes the name from the element's contents, discarding an explicit `aria-label`. Grep for a component prop that generates an id, and check whether the library also points a labelling attribute at it.
- **After any accessibility-flavoured change, re-assert the name**, with `toHaveAccessibleName('<exact string>')` rather than a role-plus-name query, so a broken name reads as a diff instead of a not-found.

#### A "change the selection to X" case must first assert the value it is changing FROM

**2026-08-08, DrillLogify Web.** A case opened a page, selected project X from a dropdown, and asserted the dropdown showed X. It passed while the control had never moved: the list was ordered newest-first, so X was **already selected** on load, and the component library fires **no `onChange` when you pick the option that is already picked** (MUI's `SelectInput` guards on `value !== newValue`). The handler never ran and nothing was persisted.

- **Only the side-effect assertion caught it.** The case also read the storage key the handler writes, which came back `null`. Had it asserted the control alone — the obvious way to write it — it would have passed forever.
- **The precondition is the fix.** Assert the value you are changing *from*, then change it. Without that the case asserts an end state without ever proving a transition, which is a tautology dressed as coverage.
- **Pin the starting value explicitly** — a deep link, a seeded preference, a fixture — rather than relying on list ordering. The ordering lives in a repository query (`ORDER BY createdAt DESC` here) that nobody reads while writing a UI case, and it changes without the case's author hearing about it.
- **Generalises to anything whose "set to X" is a no-op when already X**: tabs, filters, sort direction, theme pickers, radio groups, segmented controls.

#### An area that owns no entities inherits every fixture, so it expires when a NEIGHBOUR changes

**2026-08-08, DrillLogify Web.** A read-only board's case asserted that a newly created record showed one status. The create default had moved to a different value **three days after that runbook's last recorded run**, and the *neighbouring* runbook that owns the entity recorded the new value correctly the whole time. So two runbooks in one repo contradicted each other in prose for twelve days, and no gate reads prose.

- **Diff the runbook's last-run date against `git log` for the entities it borrows, not just for its own page.** An area with no tables of its own has no changes of its own to look at, which is exactly why its author looks nowhere.
- **Its expiry is the earliest change in any area it depends on**, so the check is a `git log --since=<last run> -- <each dependency>`, one line, run before writing anything.
- **The tell when it bites is a status, label or default that another runbook already states differently.** Grep the sibling runbook for the same constant before trusting your own.

#### Whenever one record hides another, write the case for the hider disappearing

**2026-08-08, DrillLogify Web.** A board suppressed a parent card "in favour of" its child by testing whether a foreign key was set. When the child was cancelled it was filtered off the board, but the parent stayed suppressed — so **both** vanished, the emptiness check went true, and the page rendered *"No samples in the lab workflow yet"* over live work and real records.

- **Suppress on "the other thing is actually rendered", never on "a foreign key is set".** The rule exists to stop one item appearing twice; with nothing else on screen there is nothing to appear twice.
- **One rule covers every way the hider can go**: cancelled, soft-deleted, filtered out by a status rule, not yet downloaded, or belonging to a page the reader has scoped away.
- **This was found by a case written blind**, purely because the coverage map carried a row for the cancelled branch and nothing owned it. It is the clearest argument for the map: the case was written from the branch list, not from a suspicion.

#### Read the validator before seeding an edge case

**2026-08-08, DrillLogify Web.** A fixture for "a rollup with no depth range" was rejected by the repository with `Sample depth interval is required`: depths may be omitted only for one narrow category of record. The rejection was the good outcome — a laxer repository would have created a row the app can never hold, and the case would have quietly tested a fiction.

- **Prefer the domain scenario that legitimately produces the edge case.** Here a quality-control standard inserted into the sample stream, which is a real thing a geologist does and genuinely has no drilled interval, rather than a depthless core sample, which is not a thing at all.
- **A seed that bypasses the app's own creation path also bypasses its validation**, so a raw insert would have hidden this. Seeding through the repository is what turned an invented fixture into the right one.
- Related trap in the same case: an aggregate computed with `MIN`/`MAX` **across a group** means the edge-case row needs its own group, or a normal sibling supplies the value and the branch never renders.

---

#### `getByRole` reads the ROLE ATTRIBUTE; the browser reads ARIA's ownership rules on top, and a green role query proves nothing about what a screen reader hears

**2026-08-07, DrillLogify Web.** A grouped autocomplete nested each group's options inside a plain `<ul>` inside a **role-less** `<li>`, both direct children of `ul[role="listbox"]`. That breaks the listbox → option ownership ARIA requires, so Chrome **discarded** the `role="option"` the markup claimed and exposed **fifteen unnamed `listitem`s**, the three group headings as bare `generic`s, and `aria-activedescendant` pointing at something the browser did not consider selectable.

The spec had been resolving `getByRole('option')` to fifteen elements since the day the feature shipped. The suite reported a healthy, navigable list. A screen reader got fifteen blank rows. **Nothing in the test tier could see it, and one assertion actively said the opposite.**

- **The two resolvers are not the same thing.** Playwright (and Testing Library) compute a role largely from the attribute and the tag. The browser's accessibility tree then applies required-context and required-owned-element rules and can throw a role away. Where they disagree, the suite is the half that reports success.
- **The tell is a role attribute whose parent chain does not permit it**: `option` outside a `listbox`, `gridcell`/`row` outside a `grid`, `tab` outside a `tablist`, `menuitem` outside a `menu`, `listitem` outside a `list`. Any component library that lets you group, virtualise, or wrap its list items can introduce one.
- **The probe is a tree dump, not a role query.** Chrome DevTools' accessibility pane, or an MCP browser tool's verbose snapshot. Read the popup/subtree, not the page summary, which truncates it.
- **What a spec CAN still assert is agreement.** Count the rendered rows with a CSS locator (`li[role="option"]`) and assert the role query returns the same number. That is inside the suite's reach and catches a regression in either direction, and it is what the runbook's exhaustive a11y case should carry.
- **Record it as a Testability gap in the runbook**, explicitly saying the suite cannot see this class, so the next reader does not take a green run as proof.

#### A result cap is invisible at fixture scale, and the fixture is exactly why it survives

**2026-08-07, DrillLogify Web.** A search returned five matches per type and said nothing about the rest. Every harness test seeds two or three rows, so five was never reached and the cases would have passed forever. Against the real development database one query matched **28 holes, 1,711 samples and 9 batches** — the reader saw fifteen of 1,748, with nothing on screen admitting it.

- **Ask the datastore what a realistic query returns before writing the coverage map.** One `SELECT COUNT(*)` turns "the list looks fine" into a defect with a ratio.
- **A case that exercises a cap must seed PAST it.** Seeding five against a limit of five proves nothing; seed six so the group has something to withhold, and assert the withheld count, not just the shown one.
- Same family as any list whose length is a property of the user's data rather than of the UI: pickers, filter menus, distinct-value lists, "recent items".

#### "Loading" and "empty" are different slots, and copy in the wrong one is dead code that renders the library's default

**2026-08-07, DrillLogify Web.** The app set `noOptionsText={loading ? 'Searching…' : 'No matches'}`. The library renders `loadingText` while loading and consults `noOptionsText` only once it is not, so the `Searching…` arm could never be reached and every reader saw the library's untranslated **`Loading…`**. The runbook described `Searching…` as observable behaviour.

- **Sample a transient state over time rather than reading the settled one.** A 40 ms polling loop over the container's text content showed `Loading…` at 0 ms and the settled text at 308 ms. A single post-hoc assertion cannot see a state that has already gone.
- **A ternary inside one slot is the tell** that the author expected that slot to handle both states. Check which slot the library actually renders for each state before writing the case.

#### A keyboard shortcut registered on mount cannot be pressed straight after a navigation

**2026-08-07, DrillLogify Web.** The only case to fail its first run did `goto` and immediately pressed the shortcut. `goto` resolves on load, well before the framework commits the component that registers the `window` listener, so the key reached a page that was not listening. It reads in the log exactly like a broken shortcut.

- **Wait for something the component renders before sending it a key.** The sibling case in the same file passed only because it happened to click a heading first, which is an accident, not a design.
- **A human never hits this**, because they cannot press a shortcut for a screen they have not seen — which is the general shape: any precondition the manual profile satisfies by being slow is one the automated profile has to state.
- Put the wait in the **runbook step**, not just the spec, or the next author writes the race back in.

#### "The behaviour stays here" is a coverage claim, and it needs a case here

**2026-08-07, DrillLogify Web.** A runbook recorded that a control belonged to another area's case and that the *behaviour behind it* stayed in this one. The other area's case genuinely covered the control. Nothing in either file ever exercised the behaviour, so a whole entry point was uncovered while both documents read as though ownership had been settled.

- This is the mirror of the known deferral trap. That one is a deferral naming a **file** instead of a case ID; this one **keeps** the half that nobody then writes.
- **Both halves of a split need a case ID before the split is finished.** When you write "X is owned by `other.md` TC-…, Y stays here", the sentence is not complete until "here" names a TC too.

---

#### Adding an `aria-label` to a CHILD pollutes the parent's name, wherever the parent is named from its contents

**2026-08-07, DrillLogify Web.** Fixing one accessibility gap created another. A column-resize handle had no role and no name, so it was unreachable by keyboard; giving it `role="separator"` and `aria-label="Resize Project Name column"` fixed that and was verified working. But the handle is a child of the `<th>`, and `columnheader` takes its name **from its contents**, so every header in the grid started announcing as **"Project Name Resize Project Name column"**.

The cost was six failing cases in one run, four of them burning the full 240-second locator timeout, and a screen reader reading every column header twice over. The page looked and behaved perfectly throughout.

- **The roles named from their contents are the trap**: `columnheader`, `rowheader`, `cell`, `button`, `link`, `heading`, `option`, `menuitem`, `gridcell`. Adding a *named* child to any of them changes the parent's name.
- **Fix by pinning the parent's name** (`aria-label` on the container), not by removing the child's. An explicit label wins over name-from-contents, so the child keeps the name it needs and the parent stops absorbing it.
- **The tell in a run is an ANCHORED regex that suddenly cannot match** while its unanchored sibling still passes: `/^Depth From$/` dies, `/Depth From/` survives. That asymmetry points straight at extra text in the name.
- **Assert a name with `toHaveAccessibleName('<exact string>')`, not a loose regex**, precisely so this shows up as a diff of the whole name rather than a silent pass.
- Generalises past testing: this is the same mechanism as a `Tooltip` relabelling its child, one level up.

#### A list sized by the USER'S data freezes on real data, and every fixture hides it

**2026-08-07, DrillLogify Web.** A column-filter menu rendered one checkbox row per distinct value in that column, with no length guard. The harness creates two or three rows per test, so the list was two items, the case was instant, and it passed on every run for months.

Driven against the developer database, the same menu on a column holding **6,912** distinct values took the page from **5,514 to 53,964 DOM nodes** and about **17 seconds** to open. On a column holding **8,518**, it hung the renderer past a 45-second tool timeout. Capping the list at 200, with a line naming the count and how to narrow, took it to **+140 nodes**.

- **No e2e fixture in any repo can see this**, because the whole point of a fixture is a small, controlled dataset. It is found only by driving a database with real volume, which is an argument for the browser pass rather than for a bigger fixture.
- **The tell is a `.map()` over a derived set inside a popover, menu or dropdown, with no length guard.** Grep for `distinct`, `unique`, `new Set(` feeding JSX.
- **Write the case against the CAP, not the freeze.** A case cannot seed 8,000 rows in reasonable time, so assert the two things that are cheap: that a small column still lists its values, and that the withheld-list wording appears with its explanation. Put the measured numbers in the runbook note so the next reader knows why the cap exists.
- Generalises to anything whose length is a property of the data rather than of the UI: a group list, a tag picker, a legend, a per-row expansion.

#### A query parameter with producers and no consumer fails silently, forever

**2026-08-07, DrillLogify Web.** A dashboard linked to `/database?table=<name>` from every record-type chip. The target page never read the parameter, so every chip landed on whichever table happened to be first. No error, no console line, no failing test, and the area's runbook described the deep links as working, which is how the claim survived being false.

- **Grep a parameter's PRODUCERS as well as its consumer.** One `grep -rn "?param=" src/` finds the links; the absence of the read in the target is the other half of the answer.
- **Check the producer's value space exists in the consumer.** Two of the chipped record types had no destination at all, so those links could never resolve even after the fix. That is a second finding, and a product question rather than a bug.
- **A deep link needs a case for each way it can fail**, not just the happy one: the target exists, the target is empty, the target is unknown. The last two must *say so*, because silently showing something else is what makes the first failure invisible.

#### A contrast probe that ignores the alpha channel over-reports by 4x

**2026-08-07, DrillLogify Web.** A dark theme's muted token is `rgba(221, 232, 245, 0.4)`. Reading the first three channels as opaque reported **13.6:1**; composited against its real background it is **3.27:1**. The probe said the theme passed comfortably while three elements were failing AA.

- **Composite before measuring:** `result = a*fg + (1-a)*bg`, against the nearest ancestor with a non-transparent background, then compute the ratio. A probe that parses `rgb()` and ignores a fourth channel is worse than no probe, because it produces a number that looks authoritative.
- **Check both themes and expect light to be the worse one.** The assumption runs the other way and it was wrong here: the same three elements measured 2.43 / 2.59 / 2.59 in light against 3.30 / 3.27 / 3.27 in dark.
- **Look for a *disabled* token used for content that is merely quiet** — a row-number gutter, a units hint, an absent-value glyph, a timestamp. Nothing about them is unavailable, and a disabled token is designed to recede below the readable threshold.

#### "Read-only area" is a claim about the write calls, not a property of the name

**2026-08-07, DrillLogify Web.** A runbook opened by declaring its area read-only, and used that to skip the entire persistence tier. One toolbar button created a row and navigated to it, and had done since before the runbook was written.

- **Grep the page for repository or API writes before accepting the framing**, especially where the framing is what justifies skipping a tier. A framing that removes work is the one to check hardest.
- **A read-only area still has an exhaustive Full case; it is just a different one.** With no form to reload values into, the both-ends round-trip has no second end. What must be exhaustive instead is the **rendering**: one case over one seeded table asserting that each value type (string, number, date, boolean, foreign key, enum, null) gets its own treatment. These are ordered branches in a single renderer, so a change to one can shadow another, and no single-type case can see that.

#### Two counters over two mechanisms drift, and the noun they share is what hides it

**2026-08-07, DrillLogify Web.** A "Columns" button badge read **9 hidden** while the menu it opens showed **7** unticked boxes, and a footer counted the other 2 separately as "2 empty columns hidden". Nothing was miscalculated: the badge's input was `total - rendered`, which silently folds in a second, unrelated hiding mechanism. Three numbers for two mechanisms, all using the word "hidden", all correct in isolation.

- **When one noun labels two counters, assert them against each other in a case.** Read one number, open the thing it describes, count, compare. It is three lines, it needs no fixture, and it is the only check that can see this.
- **The smell is a count derived by subtraction** rather than from the set it claims to describe. Count the thing; do not infer it from a difference.

#### `stopPropagation` on a form control's key handler is a question about its parent

**2026-08-07, DrillLogify Web.** A filter popover was built as a `role="menu"` containing text boxes and buttons, which are not valid menu children. Every input carried `onKeyDown={e => e.stopPropagation()}` so the menu's type-ahead would stop eating keystrokes, and the container logged a library error on **every single open**, in a page nobody had read the console on. Rebuilding it as a popover with a real menu list wrapping only the menu-shaped actions deleted every one of those calls.

- **Read a `stopPropagation` on a keyboard handler as a smell, not a fix.** It usually means a control is inside a container whose keyboard model does not expect it.
- ⚠️ **The conversion changes roles, so re-derive every locator in the area.** What stays in the list keeps `menuitem`; what moves out does not. Controls can also *gain* accessible names they never had, which is a win but breaks any locator that worked around their absence.

#### A stated absence may name a MECHANISM, never an outcome

**2026-08-06, DrillLogify Web.** A backup area's out-of-scope paragraph read: *"the automatic backup (every 30 min) and the rotation are background behaviours with no user-facing trigger, not automatable here."* Every word of that is true of the **30-minute timer**. None of it is true of the **list of five snapshots and their five restore buttons**, which are on screen whenever snapshots exist and which the same function the timer calls populates in about a second from a `page.evaluate`.

The cost was measured. All five restore buttons carried the accessible name `Restore this backup`, so a screen reader announced five identical buttons and any role-plus-name locator resolved to five elements and died on strict mode. Nothing had ever tested them, because the runbook said they were untestable, and it said so because that one sentence conflated the trigger with everything downstream of it. The feature had shipped that way from the start.

- **An absence may name a mechanism** — a timer, a debounce, a rotation policy, a retry, a network condition. **It may never name an outcome.** Before writing one, ask what the mechanism *produces* and whether that thing has a locator.
- **Split the row rather than widening it:** `absent:the 30-minute interval` alongside `covered by T7/T8:the snapshot list it produces`. The reconciliation gate reads rows, so a split row is what makes the covered half visible.
- **The tell when reviewing an inherited runbook:** an absence whose justification is about *how something is triggered* rather than about *what it renders*. Scheduled jobs, background syncs, cache warmers and cleanup passes all attract this shape.
- Sits beside *"An 'out of scope' note is a claim with a shelf life"* below: that one is about a reason that expired, this one is about a reason that was never as broad as its wording.

---

#### A closing modal hides the page from role queries but not from text queries

**2026-08-06, DrillLogify Web.** Three tests in one suite asserted a destructive action's outcome message (**passed**) and then a control on the surface behind the now-closed dialog (**failed**, "unable to find"). The dialog-closing state update had already run. The dialog was in its exit transition, and a mounted modal puts `aria-hidden` on its siblings: `getByRole` honours that, `getByText` does not.

The failure is unusually hard to read, because the query that fails is on an element the query that just passed proved was rendered. It presents as a rendering bug in the component under test.

- **After closing a dialog, wait for it to unmount before any role query on what was behind it.** `await expect(page.getByRole('dialog')).toHaveCount(0)` in Playwright; `await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())` in Testing Library. Put it in a named helper, because a confirm-then-check-the-page sequence is most destructive-action tests.
- This is the *closing* case. The familiar advice — "a modal blocks the page, assert the dialog first" — covers a dialog that is **open**, which is when authors expect it. Nobody expects it after they have closed it.

---

#### A surface that pins its own background but not its own foreground is invisible in the other theme

**2026-08-05, DrillLogify Web.** A sign-in page is deliberately dark in **both** light and dark themes, a ratified brand decision. The dev-persona menu on it pinned its paper to a hard-coded dark colour and left the item labels to take the theme's text colour. In light mode every label rendered near-black on near-black: **1.04:1**, measured. The menu looked empty. It had been that way for months.

Nothing in the usual net can see it:

- **A role query passes.** The text is in the DOM, so `getByRole('menuitem', { name })` resolves and clicks. In this repo the shared login fixture had clicked through that very menu in all 45 specs.
- **A screenshot passes**, because it was taken in whichever theme the author's browser happened to be in. One theme is a coin-flip on missing it.
- **A contrast unit test passes**, because each component's own tokens are fine in isolation. The failure exists only in the *combination* of a fixed background and a themed foreground.

What to do:

- **Grep any theme-independent surface for a hard-coded background.** In MUI that is `bgcolor:` / `backgroundColor:` inside `slotProps.paper`, a `Menu`, `Popover`, `Dialog`, or a branded panel. Every hit needs its text and icon colours pinned **in the same block**. A pinned background with unpinned foreground is the defect.
- **The case must assert computed colours, not text.** Set the theme preference **before the app boots** — most theme providers read storage in a state initialiser, so setting it afterwards does nothing — then read `getComputedStyle(el).color` for each affected element, in both themes. Asserting the element is visible proves nothing: it always was, just not to a human.
- **Generalise the shape:** any state a *user preference* controls is a second axis your cases must cross, and theme is the one nobody crosses, because the author only ever sees their own.

#### A parent route wrapper's redirect beats a child handler's `navigate()`

**2026-08-05, DrillLogify Web.** A sign-in handler read a saved "where you were heading" destination and called `navigate(destination)`. Signing in also updates auth state, which re-renders the **parent** public-route wrapper, whose `<Navigate to="/" replace />` runs as an effect after commit and therefore lands last. The user arrived at the dashboard.

The misleading part is the evidence: the destination had been read **and cleared**, so the store looked right, the feature looked implemented, and only the final URL disagreed. It had stayed invisible because the handler and the wrapper happened to choose the same target until one of them stopped.

- **Whichever route wrapper owns the post-auth redirect owns the destination.** Put the decision there and delete the handler's navigate. Two things steering one navigation is the bug.
- **The case needs a negative control.** Assert that a deep link lands on the deep link, *and* that a plain sign-in with nothing saved still lands on the default. Without the second, a wrapper that always replays a stale destination reads as a pass.

#### A copy-parity gate that greps the whole source cannot tell user copy from a log line

**2026-08-05, DrillLogify Web.** A gate exists to stop a spec waiting on an outcome message the app never says; it checks whether the phrase appears anywhere under `src/`. The phrase `Updated to version` was satisfied by two `console.log` template strings in unrelated services, so the gate would have passed with the user-facing message deleted entirely.

- **A containment check over all source is a staleness detector, never an existence proof.** Read a green result as "not obviously wrong", and say so where the runbook cites the gate.
- **Write the copy as one contiguous literal** where a gate is meant to check it. Splitting a phrase for emphasis (`Updated to <strong>version {x}</strong>`) removes the only thing the gate could match; moving the emphasis (`Updated to version <strong>{x}</strong>`) keeps both the design and the check.

#### A destructive-action case must re-seed the harness's own settings afterwards

**2026-08-05, DrillLogify Web.** A "wipe local data" recovery action clears every storage key carrying the app's prefix. That includes the key the harness writes to hold **background sync off** for the duration of a test, and the service's built-in default is on. So the case that wiped the device and then asserted the device was empty was racing a background sync that would refill it.

**It passed.** That is the whole lesson: the race was won, not avoided, and a green result on a racy assertion is indistinguishable from a green result on a sound one. It was caught by reading the wipe's implementation, not by running anything.

- **After any case that resets storage, re-apply whatever the fixture applied**, then continue. Put the re-seed in the runbook as a numbered step with *why* on it, or the next author deletes it as noise.
- **Ask of every destructive case: what did the fixture put in the place I just emptied?** Refresh intervals, feature flags, view preferences and seeded sessions usually live in the same store as the data.

#### An ownership note that lists only EXCLUSIONS leaves the inclusions uncounted

**2026-08-05, DrillLogify Web.** A high-traffic shell runbook opened with three careful ownership exclusions — search belongs elsewhere, sync belongs elsewhere, the boot screens belong elsewhere — and never enumerated what it *did* own. A whole header control, an issues indicator carrying ten distinct issue kinds, a count badge and two severity levels, had **zero** coverage in any of the repo's 45 runbooks. Nobody had noticed, because every reader checked the three exclusions and found them correct.

- **State the boundary in both directions.** An exclusions-only note is a list of things you have thought about; it says nothing about the remainder.
- **State it most carefully where it reads oddly.** Several of those issue kinds are *about* sync, which is exactly why each reader assumed the sync runbook had them. Write the awkward sentence: "these conditions concern X, but the control is ours."
- **Phase 4 reconciliation is what catches this**, and only if the ledger is built from the *source* rather than from the runbook's own framing. Enumerate the area's controls from the component tree, then map each to a case.

#### A case whose `Expected` promises more than its spec asserts is invisible to an ID-based gate

**2026-08-05, DrillLogify Web.** A theme-menu case's Expected column read "menu opens with Light, Dark, System, then a **Style** group of palette variants". The spec asserted the three mode items and nothing whatsoever about the group — no options, no switching, no persistence. Both CI parity gates reported clean, because one compares TC ids and the other compares button names, and **neither reads what an `Expected` cell claims**.

- **When a case's Expected names something, check the spec asserts it.** The 1:1 gate proves a case has *a* test, never that the test does what the case says.
- **This is the reverse-direction check** in Common mistakes: policing "every case has a test" is easy, and the half nobody polices is "every promise has an assertion".
- **The fix is usually a new case**, not a bigger one: the promise was a second behaviour hiding inside a case about something else.

#### A modal-based overlay portals OUT of its landmark at small breakpoints

**2026-08-05, DrillLogify Web.** Below the mobile breakpoint the nav drawer swaps to the component library's `temporary` variant, which is a modal and therefore renders into `document.body` — outside the `navigation` landmark that every other case in the spec scopes to. The landmark-scoped locator matched **zero** elements and the click burned the full 240-second test timeout, while the drawer was plainly on screen and the identical locator worked on desktop.

- **Verifying a locator on one layout proves nothing about the other**, even when a single component generates both. The live browser pass had missed it entirely, having queried the drawer's own class directly.
- **Keep a second helper scoped to the surface itself** (the drawer paper, the dialog, the popover) and use it in every small-screen case. Say *why* in the helper's docstring, or the next author will "simplify" it back.
- **The tell is a full-timeout failure on a control you can see in the failure screenshot.** That combination means the locator, not the app.

#### Three assertion traps that each read as an app failure

**2026-08-05, DrillLogify Web.** All three surfaced in one run, and all three were test bugs that looked like defects.

- **A whole-element text match reads CONCATENATED text.** A menu's lines arrive glued together (`…Forge SoftwareEnterprise Plan…`), so a regex anchored with `\b` can never match. The plain-string form it replaced worked only because a string is matched as a substring. **Do not add word boundaries to a whole-element text assertion.**
- **A tooltip stays mounted through its leave transition.** Hovering a second target briefly puts two on the page, so an unnamed `getByRole('tooltip')` trips strict mode on the *second* assertion while the first passed. Address them by role **and** name.
- **A page snapshot attached to a failure is captured after it.** A geometry case that measured before its lazy route had rendered read a null heading, and its own evidence showed a fully rendered page. Wait on the page's own heading, not just on the shell around it.

#### A menu that stays open removes its own trigger from the accessibility tree

**2026-08-05, DrillLogify Web.** A theme picker was changed to apply live without dismissing, so its two axes (light/dark, and the palette family) could be compared. Two cases that asserted the trigger's accessible name — `Change theme, currently Light` — immediately failed, because the library's menu is a **modal**: while it is open the rest of the page is `aria-hidden`. The name updated correctly, somewhere no screen reader and no locator could reach.

- **A trigger that carries state in its name cannot be the live feedback for a stay-open picker.** Assert the chosen item's selected state *inside* the menu, plus a document-level signal (a `data-` attribute, a computed colour), and assert the trigger's name only after the menu closes.
- **Raise it as a design question, not only a test fix.** If that name was the only confirmation a non-sighted reader got, the change made the control *less* accessible; the in-menu selected state is what has to carry it instead.
- **Same shape for any modal-backed surface**: while a dialog, menu or popover is open, assert what is inside it first, and treat everything behind it as absent.

#### A `<footer>` inside `<main>` has no landmark role

**2026-08-05, DrillLogify Web.** A runbook step told the tester to assert `contentinfo`. A `footer` element nested inside `main` (or `article`, or `section`) is **scoped**, so it exposes as a plain generic and that role can never appear. The spec passed regardless, because it happened to reach for a CSS element selector, so the two halves of a 1:1 pair disagreed and nothing said so.

- **Only a `footer` that is a direct child of `body` is `contentinfo`.** The same rule governs `header` and `banner`.
- **Prose in an `Expected` column is checked by nobody.** Roles, landmark names and exact strings written only in markdown drift freely; the gates read ids and button names.

#### A preference is not covered until something READS it

**2026-08-04, DrillLogify Web.** A "Compact View" switch on the user-settings page had a runbook case, a passing spec test, a stored key, and **no consumer anywhere in the codebase**. The control changed nothing; its green case proved only that a switch flips. Every layer of the net was satisfied because each layer only ever checked the layer beside it: the case asserted the control, the spec asserted the case, the parity gate asserted the ids.

- **Write the case against the EFFECT, not the control.** Set the preference, then assert what it changes somewhere else in the app: a date rendering in the chosen format, a list getting denser, a column appearing. A case that only round-trips the control is a tautology dressed as coverage.
- **The audit is seconds long.** For each settings key, grep it and count the readers. One reader (the settings page itself) means the control is dead.
- **Applies to any write whose only observable effect is its own control:** a toggle, a saved filter, a view mode, a "remember this" checkbox.
- **When the finding lands, the control is the decision, not the test.** Removing a dead control retires its case (never renumber); implementing it is a feature with its own scope. Ask rather than choosing.

#### An "out of scope" note is a claim with a shelf life

**2026-08-04, DrillLogify Web.** Three of one runbook's stated absences were justified by real limitations that had since disappeared: the runner grants geolocation directly, the harness had gained role switching months earlier, and route interception reaches states one seeded backend cannot produce. Each reason still *read* plausibly, which is precisely why nobody re-checked it. The area sat at 8 cases against about 66 behaviours partly on the strength of those three notes.

- **Re-test the premise, not the reason.** "Needs a real permission", "the harness only logs in as X", "one seeded tenant cannot produce this" are all statements about tooling, and tooling moves.
- **Attack the stated absences first** when you reopen a runbook. They are where the coverage went to hide, and they are cheap to re-check.
- **Date every absence** so its age is visible, and prefer a machine-checkable reason (`absent:harness-limitation`) over prose.

#### Two surfaces showing the same thing need a shared implementation, not a shared namespace

**2026-08-04, DrillLogify Web.** Two pages ran the same four diagnostics. They already agreed on a `sessionStorage` prefix and had still drifted: the check names differed in casing, one skipped a branch the other ran, and they stored their payloads under different keys. Sharing the namespace was **worse** than not sharing, because the flag one page wrote suppressed the other's work while the payload that page needed was absent, leaving it stating a status above an empty list.

- **Extract the logic, export the canonical names as a constant**, and have both runbooks assert that constant rather than retyping the strings.
- **A shared storage prefix with no shared owner is the smell.** Two features reading one namespace must each validate what they restored rather than trust a boolean the other wrote.
- **Write the cross-surface case from both ends:** one case proves the cache is populated and named correctly, its sibling proves the other surface reads the same thing.

#### A CSS-uppercased label matches its AUTHORED casing

**2026-08-04, DrillLogify Web.** Micro-labels rendered upper-case through `text-transform`, which is the correct choice (casing the string in JS is what a screen reader announces, and it mangled `µS/cm` into `ΜS/CM`). So the screen reads `KEPT IN` while the matched text is `Kept in`. A spec written from a screenshot produced **twelve** assertions that could not pass.

- **Assert the string as written in the source**, with the exactness flag on. Without it the match is case-insensitive and passes while proving nothing about casing.
- ⚠️ **A label split into per-segment elements to protect units or internal capitals is broken across elements**, so a whole-label match finds nothing. Address it by a segment, or by the value beside it.
- **Same class of trap:** any CSS that changes rendered text (`text-transform`, `::before` content, `first-letter`). What you see is not what the runner matches.
- ⚠️ **Only half of these wrong assertions tell you they are wrong.** In the same file, a `toBeVisible()` on the rendered caps failed loudly while a `toHaveCount(0)` on the identical impossible string **passed**: a count-zero assertion on text the app can never produce passes whichever way the app behaves. A permission-absence case reported green with two vacuous assertions inside it. **After any casing or copy change, invert every count-zero text assertion and confirm it can fail.**

#### Scope a heading or landmark COUNT to the page's main region

**2026-08-04, DrillLogify Web.** Two of six run failures were the **app shell's** own headings counted against the page's outline: a tenant name in the app bar and a product name in the nav drawer. The page was correct both times, and the case pointed at the wrong file. Anything that **counts** elements rather than naming one needs a container (`getByRole('main')`), or the shell fails your case for you. Corollary worth noting in the runbook: if the shell's own headings are themselves wrong (both of those are values rendered as headings), that is the shell area's finding, not yours.

#### Read the branch, don't infer the constant

**2026-08-04, DrillLogify Web.** A geolocation case expected the coordinate-system code for one datum where the app's own region table returns another for the same zone (GDA2020's `7800 + zone`, not GDA94's `283xx`). The wrong value looked authoritative in **both** the runbook and the spec, because it was written from domain knowledge rather than from the function. Derive an expected constant by reading the code that produces it, and cite the branch in the case so the next reader can check it in seconds.

#### Check a "scope to the card" locator resolves to ONE element

**2026-08-04, DrillLogify Web.** Filtering containers by a heading they contain matched **both** the inner panel and the outer section card wrapping it, so scoping to "the card" failed strict mode. Nested containers sharing a class is the normal case in a component library, not the exception. Count the matches before trusting a filter, and take the innermost explicitly when that is what you mean.

#### An ungated page still needs a persona case, and it is the inverse of the usual one

**2026-08-04, DrillLogify Web.** For a page every role can reach, the guard worth asserting is that a **read-only persona gets in**, plus whichever regions differ by permission. A privileged persona proves none of it, and "no gate" is otherwise an untested claim sitting in the runbook header. Same discipline as the positive-control rule: the assertion has to be capable of failing.

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

**`getByRole`'s `name` is a case-insensitive SUBSTRING match by default. Both directions of that bite.**
Playwright matches the accessible name as a substring unless `exact: true` is
passed, so the same default causes two opposite failures:

- **Too loose.** `getByRole('button', { name: 'Review' })` also matches a sidebar
  entry named **Duplicate Review**, so an absence assertion fails against an
  element in completely different chrome, and a click can land on the wrong one.
  Any short, common label (`Review`, `Import`, `New`, `Edit`) needs `exact: true`,
  a landmark scope, or both.
- **Too tight, once you fix the above.** A control whose name is built
  conditionally (`aria-label={n > 0 ? 'Sync Hub, N changes waiting to upload' :
  'Sync Hub'}`) keeps matching the bare `{ name: 'Sync Hub' }` *only because* of
  the substring default. Add `exact: true` and it silently stops matching the
  moment a case seeds anything, which reads as a flake: the same locator passes
  in one test and fails in the next depending only on what that test created.

Prefer an **anchored regex** (`{ name: /^Sync Hub/ }`) where a name has a stable
prefix and a variable tail, since it survives both directions and documents which
half is stable; assert the whole string with `toHaveAccessibleName` only where the
variable part is itself under test. Common wherever a visible badge is
`aria-hidden` decoration and the number rides in the accessible name instead.
(2026-07-31, DrillLogify Dashboard. Recorded first with the substring default
stated backwards, and corrected only when a run proved it: **verify a framework's
matching semantics against the docs or a run, never from memory** — the same rule
this skill already applies to an app's own copy.)

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

**When that card's title ALSO collides, stop working around it and fix the app: the a11y bug and the selector gap are the same bug.**
The text-click fallback above only holds while the title is unique. On a
dashboard it usually is not: a KPI tile labelled "Drill Holes" collides with the
sidebar entry *and* with a per-type chip of the same name, so `getByText`
resolves to three elements and trips strict mode with no scoping that separates
them. At that point the workaround is exhausted and the correct fix is one edit
in the component: `role="button"` + `tabIndex={0}` + `aria-label={label}` + an
Enter/Space handler, applied **only when an `onClick` is present** so
non-interactive instances stay plain. That makes the tile keyboard-operable and
addressable in the same change. Prefer `aria-label={label}` over letting the
name fall back to the tile's text content, which would otherwise read out every
number on it. (2026-07-31, DrillLogify Dashboard.)

---

#### Tables that group rows, and content hidden by default

**When a table's identifying column is removed, look for a per-row CONTROL before reaching for `data-testid`.**
Row locators are usually built on the one cell that identifies the row
(`filter({ has: cell "UPLOAD" })`). Collapse two records into one row, or drop a
column, and every such locator dies at once — and `role=row` is no help, because
it also matches the header, the always-rendered expand-detail row that follows
each data row, and any full-width toggle/pager rows in the body. The stable
replacement is a control **every data row carries and no other row does**,
almost always the expand toggle:
`getByRole('row').filter({ has: getByRole('button', { name: 'Toggle row details' }) })`.
Address one specific row by filtering that set again on a unique cell value you
injected. (2026-07-31, DrillLogify Sync Hub.)

**A new "hide the boring ones" default is a breaking change to every case that relied on a boring one being visible.**
Folding low-value rows away behind a `Show N …` toggle is a normal UI
improvement and a silent test break: a case that did the cheapest possible setup
(sync with nothing pending, save with nothing changed) now produces exactly the
row the fold hides, and "the record renders" fails for a reason unrelated to
what it tests. Two fixes, both needed: **seed real work** in every case that
expects to see a row, and give the fold **its own case** (hidden by default,
revealed by the toggle, label flips). Drive that case from an **injected** row
rather than a provoked one — whether a real action happens to be a no-op depends
on harness residue, and the fold's behaviour should not. (2026-07-31,
DrillLogify Sync Hub.)

**An inverted premise needs the old control's ABSENCE asserted.**
When a page moves from manual refresh to event-driven re-query, the case that
proved "stale until you press Refresh" inverts to "appears on its own". Asserting
only the new behaviour still passes if someone re-adds the button and the
subscription rots, so assert `getByRole('button', { name: 'Refresh' })` has
**count 0** in the same case.

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

#### A case-sensitive text assertion is invisible to every parity gate

**2026-08-04, DrillLogify, Developer Console.** A repo can have a gate checking
spec-targeted **button names** against the app, another checking **case IDs** both
ways, and still ship two dead cases. A dialog title asserted with `toContainText`
is neither a button nor an ID, and `toContainText` normalises **whitespace only,
not case**. Two cases asserted `Edit Tenant Details` and `Edit License`; the app
had said `Edit tenant details` and `Edit the license for <tenant>` since those
dialogs moved onto the shared form-dialog primitive, a change the repo's own
casing gate had *forced*. Neither gate could see it, and the file read as clean.

- **After any copy or casing change, grep the specs for the old string.** The
  gates cover controls and identifiers; prose assertions are on you. Cheap
  insurance: a run costs 20 to 30 minutes and each stale assertion surfaces as a
  timeout.
- **A casing gate that reads JSX props cannot see a title passed as state.** The
  same repo's guard scans `title="…"` on the dialog primitives and literal
  `<DialogTitle>` text. Two confirm dialogs built their titles into a state
  object, so `Change User Role` and `Deactivate User` survived an app-wide
  sentence-case sweep. **If a title is computed, its casing has no automated
  guard at all**, so check those by hand when reviewing the area.

#### A negative text assertion cannot see casing without an exactness flag

**2026-08-04, DrillLogify.** `expect(getByText('Included in ENTERPRISE')).toHaveCount(0)`
resolved to **10** elements against an app rendering `Included in Enterprise`.
Playwright's `getByText` is **case-insensitive substring** by default, so the
assertion matched the exact string it existed to rule out. The app was correct
and the guard was incapable of expressing its own claim.

It failed loudly, which was luck. **Written the other way round it passes
vacuously forever:** a `toHaveCount(0)` against text the app never says is green
whether or not the app is right, so the one assertion written to catch a casing
regression would let it through silently.

- **Any assertion whose purpose is casing or exact wording takes `exact: true`**
  (or an anchored regex). That is what makes it case-sensitive and whole-string.
- Same default, two failure modes: over-matching two *elements* is the
  strict-mode collision everyone knows; over-matching one *string* is this, and
  it hides in negative assertions where nothing ever resolves to complain.
- **Audit rule:** grep the spec for `toHaveCount(0)` and `not.toBeVisible()` on
  text locators, and check each one could actually fail.

#### When a page has several handlers of the same shape, diff them first

**2026-08-04, DrillLogify.** One page had three migration handlers. One branched
on the response's failure count and reported failures through the error alert;
the other two always called the success setter, so a run with failures rendered
a **green** alert with "1 failed" inside the reassuring sentence. An operator
would move on believing the schema had changed.

Nothing was wrong with any handler read in isolation: the correct sibling is
what made the other two obviously wrong. **Diff same-shaped handlers against each
other before reading any closely.** It is the cheapest way to find an
outcome-reporting bug, a class no type, lint or coverage gate can see.

#### A warning in a PASSING test's stderr is a finding

**2026-08-04, DrillLogify.** A green unit run carried a component-library warning
("you are providing a disabled button child to the Tooltip component") in one
test's `stderr`. That is a real defect (a disabled element fires no events, so
the tooltip can never open) and it sat in a **shared** component used by two
areas. Driving the app then found the same class on four more buttons, one of
which renders disabled on first paint because its data has not arrived, so every
visit to that tab logged it.

- **Read the stderr blocks in a passing run, not just the ✓ count.**
- **The fix that keeps the tooltip useful** is to render the bare control while
  it is disabled rather than wrapping it in a span: a control carrying its own
  accessible name loses nothing for the moment it is unusable.

#### Mock the API to reach the states one seed cannot produce

**2026-08-04, DrillLogify.** A platform-admin area's seed held one tenant, one
user, a healthy database and a licence valid for months. That made the
expired-licence chip, the offline-database recovery action, the over-five-item
summary, the seat-limit warning and all three API-failure messages
*structurally* unreachable, so they had been recorded as "out of scope" for a
year. Fulfilling the admin endpoints' responses with the runner's route
interception reached every one, cost the shared control DB nothing, and needed no
new fixture. Coverage went 9 → 39 cases, and most of the new ground was error and
boundary states rather than more happy paths.

**Before writing "cannot be reproduced in the harness", ask whether the response
can simply be fulfilled.** The genuine limits are usually authentication and
third-party redirects, not data shapes.

⚠️ **The glob-collision trap.** A collection endpoint and its item endpoint
(`…/tenants` and `…/tenants/*`) return different payload shapes. One glob
catching both makes the list answer with an item payload and the page renders
**empty**, which reads as a broken mock rather than an over-broad route. Pin each
glob to one endpoint.

#### Measure a visual defect before reporting it, and after fixing it

**2026-08-04, DrillLogify.** Fourteen defects were found by driving two pages in a
real browser. **Six needed a measurement rather than a reading:** two chips whose
computed colours were byte-identical while meaning different things, three
`aria-labelledby` references pointing at ids no element carried, a dialog whose
*paper* scrolled instead of its content so the action bar scrolled out of reach,
and an accessible name with a required-marker asterisk folded into it. All
fourteen survived typecheck, lint, dead-code, copy-paste and 7,718 unit tests.

One of the same session's candidate findings was wrong for the opposite reason: a
label appeared to overlap its chip, and measuring both bounding boxes showed an
8px gap: the mouse cursor was sitting between them in the screenshot.
**Measure to confirm, not only to quantify.**

Cheap measurements worth reaching for: `getComputedStyle` on two elements that
should differ; `getElementById` on every `aria-labelledby` / `aria-controls`
value; `scrollHeight > clientHeight` on both a scroll container and its intended
child; the accessible name via `aria-label`, or the label's text with
`aria-hidden` subtrees excluded.

#### A runbook STEP is a claim about the spec, and the parity gate cannot see it

**2026-08-05, DrillLogify.** A seven-case runbook was audited against its own
spec. Three of its steps were false:

- a step promising the table's **six** column headers, where the spec asserted one;
- a scope note saying the seat-limit warning was "asserted not-fired", where the
  spec contained no seat assertion at all;
- a step listing **three** role descriptions, where the spec asserted two.

Every one reads as coverage to anyone skimming the runbook, and every one passed
the repo's runbook↔spec parity gate, because that gate matches **case IDs**. It
has no view of whether a case does what its own steps say. This is the same blind
spot as the `Preconditions` trap (a case whose stated setup the spec never
implements), one level lower down: there the setup is missing, here the
assertions are thinner than advertised.

- **When auditing an existing runbook, read the spec beside it, case by case.**
  Re-reading the runbook can only ever confirm what it already claims.
- **The over-promise is always in the same direction**: the prose enumerates and
  the spec spot-checks. Grep the spec for each concrete noun the step lists.
- **A step that says "asserted not-fired" is the highest-risk shape**, because a
  negative assertion is invisible when absent and vacuous when miswritten.

#### A deferral phrased as impossibility outlives the thing that made it true

**2026-08-05, DrillLogify.** A runbook deferred role-gating coverage with a
structural reason: *"the harness logs in with all roles, so it cannot reproduce a
role redirect."* True when written. By the time it was inherited, the harness
login helper had taken a persona argument for months, and a **sibling spec in the
same directory already proved a route guard that way**, complete with a positive
control. Nothing announced the change, and the deferral had hardened into a fact
because it was phrased as impossibility rather than as a cost.

- **Re-derive the premise of any inherited deferral before honouring it**,
  especially one worded as "structurally cannot". Grep the fixtures for the
  capability it says is missing, and grep the sibling specs for anything shaped
  like the case it declined.
- **Write a deferral with its expiry condition attached**: name the fixture or
  capability whose arrival makes it obsolete, so the next reader knows what to
  check rather than having to disprove an absolute.
- A **user-approved** deferral still needs re-approving when its reason
  evaporates. The approval was for the trade-off, not for the absence.

#### A headline number computed from the fetch window, and the control that gives it away

**2026-08-05, DrillLogify, Sync Hub.** The page's summary line read **"25 syncs · all successful"**
over a log holding **53 syncs of which 5 had failed**. Neither calculation was wrong; the *input
set* was the table's 50-row fetch window rather than the data. The one question people open that
page for was answered confidently and incorrectly, and every gate in the repo was green.

- **The tell is a control that changes a number it has no business changing.** Pressing "Load older
  syncs" took the line to `53 syncs · 5 with failures`. **Whenever a page has a show-more, load-more
  or paginate control, press it and watch every other number on the screen.** Any that move were
  scoped to the fetch rather than to the data. This is a two-second check that finds a whole class.
- **The fix pattern:** an *unlimited but narrow* read feeding the summary (nine columns, not the
  whole entity, so the unbounded scan stays cheap) alongside the windowed read feeding the table,
  with **one shared derivation** consumed by both so they cannot disagree. Two implementations of
  "how many are there" is how the summary and the table below it came to state different numbers.
- ⚠️ **The e2e assertion that matters is the INVARIANCE, not the count.** Assert the summary,
  press the load-more control, and assert the summary is **unchanged**. A count assertion alone
  passes happily against a page that still recomputes from the window.

#### Summarising a multi-part operation by its last part

**2026-08-05, DrillLogify, Sync Hub.** A "records up / records down" figure read the newest
completed *pass*. The sync engine is pull-first, so the last pass of a healthy cycle is the upload,
which downloads nothing by definition: the down count was **structurally zero** after every
successful sync, printed directly above a table row saying otherwise.

Any summary over an operation with phases must summarise **the operation**, not whichever phase
finished last. The smell is a query ending `ORDER BY … DESC LIMIT 1` feeding a figure the UI
presents as being about a whole unit of work.

#### A conditional block keyed on the data you have, not on the reader's question

**2026-08-05, DrillLogify, Sync Hub.** The "why did records fail" panel was gated on the presence of
an error message. Every partly-failed run recorded before the app started storing reasons has a null
one, so expanding a red "Failed 2" rendered **nothing at all**, which reads as a broken page rather
than as missing data.

- **Gate on the condition the reader is asking about** (did anything fail), and give the
  data-absent case its own branch that says so.
- Generalises to every "show the detail if we have it" block: **the absence of the detail is itself
  information the reader needs**, especially where the summary already told them something happened.

#### A repeated element identical on every row encodes nothing

**2026-08-05, DrillLogify, Sync Hub.** Each expanded run rendered 46 chips naming every entity type
the sync had examined. That list is a constant, so it was the same 46 names on every run, occupying
roughly 40% of the panel and distinguishing nothing.

Standing question when reviewing any list, chip row or detail block: **would this look different on
a different record?** If not, collapse it to a count with the list behind a disclosure, or drop it.
The variant of this that hides best is a block that *was* informative once and became constant when
its source changed to a fixed set.

#### A hand-written sum beside a hand-written map will drift, invisibly

**2026-08-05, DrillLogify.** A counts function counted 45 entities, gave each a display label in a
map, and then totalled them with a hand-written addition expression that omitted two of them. Both
omitted entities were genuine, uploadable data. A device whose only pending work was one of them
showed a **zero badge**, made its status page print "everything has been uploaded", and left the
**pre-wipe data-safety guard with nothing to warn about**.

- **Compute the total FROM the map**, so the thing deciding what the reader is *told about* is the
  thing deciding what the reader is *counted*. Adding an entity then becomes one edit, not two.
- ⚠️ **A test on a grand total cannot see one missing addend among forty.** Drive **one entity at a
  time**: set that entity's count to 1 and every other to 0, then assert the total is 1. That test
  fails on exactly the real bug, which is worth proving by re-introducing it once.

#### A tooltip used as a gloss REPLACES the label unless you tell it to describe

**2026-08-05, DrillLogify, Sync Hub.** A component-library tooltip with a string title puts that
string on its child as `aria-label` unless a "describe" flag is set. `aria-label` is a **name**, not
a description, so the glossed thing stops saying what it is: a table column announced *"Records sent
from this device to the server."* and never said "Uploaded". Because a `columnheader` derives its
name from its contents, the whole cell's name went with it.

- **The defect is invisible to a browser review.** The tooltip worked, the label was on screen, the
  page behaved correctly. Only a **role-plus-name query** could see it, and the case that ran one
  was the first in the app's history to assert a column header by name.
- ⚠️ **A unit test can actively document the defect.** The one here asserted
  `getByLabelText(/out of the seats your license allows/)` with a comment explaining that a tooltip
  becomes the accessible name. It passed for years. **When a test's comment explains a surprising
  platform behaviour, check whether the behaviour is a bug rather than a fact.**
- **Audit shape:** the app had three gloss primitives and only one had the flag. Whenever a
  convention exists in more than one component, grep for the flag and count the ones that have it,
  rather than reading the one you happen to be in.
- ⚠️ **Testing the fix:** in the un-flagged form the tooltip sets **no `title` attribute at all**,
  so an e2e check for one passes vacuously. Assert by hovering and reading the tooltip's own role.
  And hover the **gloss span**, not its container: a right-aligned cell has empty padding at its
  centre, which is where a hover action aims.

#### Before reporting a missing convention, read the nearest page of the same shape

**2026-08-05, DrillLogify, Sync Hub.** "This page has no breadcrumbs and no way back" looked like a
clear miss against the 43 pages that carry a trail. It was wrong: the sibling in the same nav group
has neither either, and the convention document is explicit that a trail is only for a page that
**sits under** something. Both are top-level destinations.

One grep of the nearest same-shaped page costs seconds. Reporting a convention violation that is not
one costs the reviewer's trust in every other finding in the same list.

#### A number and its trend indicator can come from different sources and still look right

**2026-08-05, DrillLogify, Dashboard.** A KPI tile's value was metres **logged** in the last 7 days.
The ↑/↓ percentage in its top-right corner was the week-on-week change in metres **drilled**, from a
different aggregate over a different table. Nothing threw, both numbers were individually correct,
and the pairing was entirely plausible: logging and drilling move together most weeks.

The case covering that tile asserted its **value**. That is the shape of the miss.

- **A tile is not one number.** It is a value, a trend, a subtitle, a progress bar and sometimes a
  sparkline, and each can be wired to a different query. Trace **every** adornment to its source
  separately, and write the source into the runbook's field-reference row so the next reader can
  check the pairing without reading the component.
- **A shared component that renders a unit is a contract about what may be passed to it.** The same
  page handed a *count* to a chip whose only job is to format `{value}%`, so three new records read
  **"↑ 3%"**. Name the unit in the component's prop or its type (`pct` versus `count`), and give the
  count its own component rather than reusing the percentage one.
- **Assert the absence of the wrong unit, not the presence of the right number.** The existing case
  used `toContainText('1')`, which the tile's own value satisfied, so the broken version passed. What
  catches it is `not.toContainText('%')`.
- **The tell is a value and its adornment described by different nouns** anywhere in the source: a
  field called `metresTrendPct` feeding a tile labelled "logged". Grep the render for every state
  field it reads and check they are all about the same thing.

#### An accessible name has spaces the `textContent` does not, and composing a name re-opens collisions an exact match had closed

**2026-08-05, DrillLogify, Dashboard.** Two `role=button` elements on one page carried the same
visible label: a KPI tile and a summary chip. The chip renders its label and its count as two
sibling spans, so:

- its **`textContent`** is `Drill Holes1` — no space, because there is no whitespace between the
  spans in the DOM;
- its **accessible name** is `Drill Holes 1` — with a space, because the name computation inserts
  one when it joins the contributions of two elements.

The tile's locator had been `{ name: 'Drill Holes', exact: true }`, which excluded the chip **purely
because of that space**. Then the tile's name was composed to carry its numbers (a good a11y fix),
`exact` stopped being possible, and the obvious replacement `/^Drill Holes/` matched **both**. Strict
mode caught it on the first run, but the reason is not obvious from either element.

- **A name-based regex and a text-based regex disagree about whitespace on the same element.** If a
  filter works as `hasText: /^Label\d+$/` and fails as `name: /^Label\d+$/`, this is why.
- **Whenever you make an element's accessible name longer or composed, re-check every locator that
  used to rely on `exact` to exclude a sibling.** `exact: true` is doing more work than it looks:
  it excludes by whole-string equality, and a composed name removes that lever entirely.
- **Anchor on the punctuation the composition introduces** (`/^Label, /`), not on the shared label.
  It is the one part that distinguishes the two, and it documents the name's shape.
- **The general form: a fix that changes an accessible name is a change to every selector in the
  suite that reads it**, including the ones in other areas' specs. Grep for the label before landing
  it.

#### A deferral that reads as "not covered yet" can be masking a state the app cannot reach

**2026-08-05, DrillLogify, Dashboard.** A runbook listed a four-step onboarding stepper advancing
through its steps as out of scope, with a plausible cost as the reason: *"reaching step 4 means
creating a project, a hole, a log and a workspace inside one case."* The real reason it was uncovered
is that the card was gated on the **exact condition that pinned the stepper to its first step**, so
steps 2 to 4 were unreachable code and the card vanished the moment step 1 was completed. The
onboarding guide abandoned every new customer after one step, and had done for as long as it had
existed.

The deferral read as a **cost** and was an **impossibility**, which hid a defect behind a decision
somebody had already accepted.

- **For every deferral, ask what state the app must be in for the case to be reachable, then check
  the gate actually permits that state.** Two conditions in one file were written as "not covered
  yet" and were "cannot happen".
- **A deferral whose stated cost is "several creates in one case" deserves the check most**, because
  that reason is always true and therefore never evidence of anything.
- This is the **mirror** of the entry above on a deferral *phrased* as impossibility that has since
  become possible. Both directions cost the same, and the fix is the same: re-derive the premise
  rather than re-reading the sentence.

#### A runbook's own reference tables can contradict the file they are in

**2026-08-05, DrillLogify, Sync Hub.** The Testability-gaps table named the wrong ARIA role for a nav
entry and recommended a positive control that the **same file's Self-improving log** records as
having failed for being permission-gated. The spec was right on both counts. Every parity gate was
clean, because ID-parity reads case ids and locator-parity reads button names, and **neither reads a
markdown table**.

This is the same blind spot as the "per-runbook automation notes drift" entry, one level up: there
the notes go stale, here the *reference* material does, and reference material is what the next
author copies from. **Re-derive the reference tables from the spec whenever you touch the file**, and
treat an internal contradiction (table says X, Known-fragile says not-X) as the cheapest possible
signal that one of them is rotten.

#### A `placeholder` can name a control the developer thought they named

**2026-08-05, DrillLogify.** A search field carried `aria-label="Search users"` as
a top-level prop on the component library's text field. That lands on the wrapper
element; the `<input>` itself was left with **no** accessible name, so the field
was nameless to a screen reader.

The e2e tier said otherwise. Because the field also had
`placeholder="Search users by name, email, or role..."`, the accessible-name
computation fell back to the placeholder, and the runner's `name` matching is
**substring**, so `getByRole('textbox', { name: 'Search users' })` matched and the
case went green. A sibling area's spec has been passing over the identical defect
this way. The name it asserts is the placeholder; the case dies silently the day
that copy is reworded, and the accessibility defect was never covered at all.

- **A green `getByRole(role, { name })` is not evidence an `aria-label` is
  wired.** Where the element has a placeholder, a title, or wrapping label text,
  the name can come from any of them.
- **Check the element, not the query**: assert the attribute sits on the control
  itself, or add a component test. Component-tier name resolution (jsdom plus
  `dom-accessibility-api`) does **not** fall back to `placeholder` for a label
  query, so the unit tier catches what the e2e tier cannot. Here two new
  component tests failed on it immediately, with the typing helper silently
  typing into a `div`.
- **The general shape:** an assertion satisfiable by two different underlying
  facts tests neither. Prefer the tier whose name resolution is strictest for the
  property you actually care about.

#### A case that invents its input tests the app against a server that does not exist

**2026-08-06, DrillLogify Web.** An access gate branches on whatever the login endpoint answers, and every case forced its branch by fulfilling that endpoint with a hand-written payload. Three of those payloads were plausible and none of them was real:

- One case sent the message `"License expired"`. The API has only ever sent `"Organization license has expired."`
- Another sent a seat-limit message containing a number. The API's carries none.
- Worst, the **app** contained a de-duplication guard written to recognise the first of those invented strings. It suppressed a redundant sentence when the message was exactly `"license expired"` — so against the real server it had **never once fired**, and every genuine licence refusal showed the same sentence twice. The unit test for it passed, because the unit test used the invented string too.

The suite was fully green throughout. It was measuring the app against a fiction that the tests and the code had agreed on.

- **Open the endpoint's source and copy its literals.** Where the backend is a sibling repo you can read, the refusal catalogue, the error strings and the status codes are all right there. Where it is not, capture one real response and paste it in.
- **Suspect any app-side branch keyed to an exact server string.** It is a claim about the wire, and the test covering it usually restates the same claim rather than checking it.
- **Prefer a rule to a literal.** Replacing `message === "license expired"` with "append the server's sentence only when it carries a number or a date" removed the coupling entirely: no rewording upstream can break it.

#### A cross-file deferral is not coverage until you open the other file

**2026-08-06, DrillLogify Web.** An area's scope section recorded one branch as out of scope because "it belongs with the offline behaviour in `user-settings.md`". That runbook covers the offline **setting** thoroughly and does not cover the branch at all. The pointer had read as reassurance for months, and the branch turned out to hold a real defect: a session with a partial offline token reaching the app entirely unvalidated.

A deferral is the one kind of absence that looks *more* rigorous than it is. It names a destination, so the reader stops.

- **Name the case ID, not the file.** `covered by user-settings.md TC-PROFILE-F1` can be checked in seconds; `belongs with user-settings.md` cannot be checked at all.
- **Verify it when you write it, and again whenever you re-run the area.** Both directions of the 1:1 rule apply across files too.

#### "This case doubles as the default branch" is a claim, and it is usually wrong

**2026-08-06, DrillLogify Web.** A case exercised a classifier's `deactivated` branch, and its note said that since anything unrecognised also falls through to the same screen, the case "doubles as the default branch". It does not: its input matches an **explicit** branch and never reaches the default. The default was exactly where two live wrong-screen defects were sitting.

The note is the tell. A case that genuinely covers two branches takes two inputs.

- **A branch is owned by an input, not by a shared outcome.** Two branches rendering the same screen still need two cases, because the thing under test is which branch was taken.
- **Treat "also covers" in a runbook the way you would treat an untested assertion**: re-derive it from the code, and if it holds, say which input reaches which branch.

#### A fully green suite is evidence about the suite

**2026-08-06, DrillLogify Web.** An area's ten cases passed 10/10, and a review of the same area that afternoon found five live defects: two refusals routed to a screen contradicting their own message, an error blaming the user's internet for a server-side fault, an unvalidated session reaching the app, and no `h1` at all on a screen that replaces the entire app. Every one sat in a branch no case owned. The run record had read "all pass" for a week.

This is the failure Phase 4's reconciliation gate exists to prevent, and the runbook had **no coverage map** — the one section that would have made the uncovered branches countable rather than invisible.

- **The green number to distrust is the one with no denominator.** "10/10" means nothing without "and here are the area's 22 branches, each against the case that owns it".
- **Write the coverage map even for a small area.** It costs a table, and it is the only artefact that can state what is *not* covered.
- **When re-running an existing area, reconcile before you run.** Deriving the branch list from the code first turns the run from a confirmation into a measurement.

#### A table-driven case that reuses one screen needs an assertion on something that changes every row

**2026-08-06, DrillLogify Web.** A new case walked a server's eight refusal payloads through a single blocked screen, advancing with the screen's own retry button rather than reloading eight times, and asserted the resulting heading each round. Two pairs of rows map to the **same** heading, and one such pair is adjacent — so that row's assertion was satisfied by the previous row's screen still being on display. It would have passed whether or not the request was ever made.

The shape is worth naming because it is invisible in a green run and it is *caused* by the optimisation: reloading per row would have made each round independent, and reusing the page is what made the previous state a valid answer.

- **Assert on something that differs for every row**, not on the property the table happens to group by. Here that was the message; a status, a count or an id serves as well.
- **Sort the table so identical outcomes are not adjacent** if you cannot assert a differing property — it narrows the window but does not close it, so treat it as a fallback.
- **The general rule:** whenever a case advances state in place rather than resetting, ask what the assertion would do if the advance silently failed. If the answer is "pass", the assertion is measuring the previous step.

---

#### "This is not rendered" is the one assertion an accessibility-tree query cannot make

**2026-08-06, DrillLogify Web.** A page that rendered one card per record fell over on a real device carrying 1,304 of them, so the tables were collapsed into accordions to stop rendering what nobody had opened. The fix looked done and was not: the component library keeps a collapsed panel's children **mounted** and merely hides them, so 150 cards stayed in the DOM while every section read as closed. The unit assertion written to prove otherwise — "no radio is present" — **passed**, because both Testing Library and Playwright deliberately skip `visibility: hidden` content.

That is the trap: the assertion was satisfied by the very mechanism that was hiding the problem, so the guard and the bug agreed with each other.

- **When the claim is about absence of *rendering*, count nodes**: `container.querySelectorAll('table')` in a unit test, `page.locator('table').count()` in a spec. Role queries answer a different question ("is it in the interface"), and for hidden content the answer is no either way.
- **Check the guard fails against the unfixed code.** Reverting the one prop and re-running the single case takes a minute and is the only thing separating a guard from a second copy of the same false negative.
- Applies to any lazy-render claim: virtualised lists, tabs, collapsed panels, `hidden` sections.

---

#### A performance shape needs one case at the volume the worst real device carries

**2026-08-06, DrillLogify Web.** Every case in an area's suite seeded **two** rows. On a real device the same page produced 1,306 tables, 3,040 radios, a 324,000px scroll region and a renderer that locked for over 30 seconds when scrolled. The suite could not have noticed: nothing it did was ever big.

- **If a page renders one row, card or table per record, one case seeds the volume.** Ask what the worst real database holds, then seed that order of magnitude.
- **Assert a countable consequence, not a duration.** Nodes rendered, cap respected, a "show more" control present. Timings are flaky and tell you nothing about why.
- A bulk seed belongs in a batch/transaction helper, or the seed itself becomes the slow part of the suite.

---

#### A Testability-gaps row is a dated measurement, not a standing fact

**2026-08-06, DrillLogify Web.** A runbook listed a role-based redirect as out of scope because "the harness logs in as one all-roles persona and structurally cannot reproduce a role-limited session". True when written. By the time it was read, the harness took a role argument, the repo's own runbook index recorded that deferral as **resolved**, and two other areas already ran their gate cases. The stale claim sat in an out-of-scope list, where prose reads as authority rather than as a note.

- **Re-check every gap claim on each visit.** Most cost one grep against the harness or the fixtures.
- **When a deferral is resolved centrally, grep the runbooks for its wording** and strike it there too. Otherwise the index and the runbooks disagree, and the reader believes whichever they opened.
- Prefer wording that dates itself: "as of <date>, the harness cannot …" invites the check that "structurally cannot" forecloses.

---

#### A locator name that substring-matches a longer sibling inflates counts in silence

**2026-08-06, DrillLogify Web.** Adding a bulk `Resolve all 3 groups` button broke three unrelated cases that counted `getByRole('button', { name: 'Resolve' })`: default name matching is substring, so 3 became 4. Nothing in the failure pointed at the new control, and a fourth case that *clicked* the same locator kept passing, because the first match was still the right element.

- **When you add a bulk twin of an existing action, add `exact: true` to every count of the singular** in that area, in the same change.
- **A count drifts silently where a click does not.** Expect the suite to fail in one place and lie in another.
- **A label carrying a count needs an anchored regex** rather than a literal, or a build-time locator gate that only understands literals will report a label the app never renders verbatim.

---

#### A case that never ran cannot vouch for its own fixtures

**2026-08-06, DrillLogify Web.** A seed helper minted primary keys like `AREA-1234-A`. The API rejects anything but a uuid with a 400. Nobody knew, because the runbook's "sync proof" was a manual step plus a citation to a test in another tier, and no automated case had ever uploaded those rows. The invalid fixture had been sitting in the helper for two months looking fine.

- **A fixture is only validated by the layer that consumes it.** Local-only cases will happily accept data the server would refuse.
- **If a runbook claims a round trip, one case must actually make it** — a citation to another tier documents the chain, it does not exercise this area's fixtures through it.
- When a seed bypasses the app's own creation path (raw insert, direct DB write), it also bypasses the validation that would have caught this, so the round-trip case is the only thing left holding the shape.

---

#### A figure the page states about what an action will do deserves a case that recomputes it

**2026-08-06, DrillLogify Web.** A summary tile read "Rows Affected 3040" for an action that would have deleted 1,730: one row per group is kept, so the figure overstated the damage by exactly the number of groups. No case asserted any tile, so the wrong number was as green as the right one would have been.

- **Recompute the figure from the seed, in the case**, and pick a seed where the wrong arithmetic gives a different answer (here, groups of three, so "rows" and "rows minus groups" cannot coincide).
- Any number a destructive control states about its own consequence is worth this: counts of what will be deleted, moved, overwritten or uploaded.

---

#### Exercise the primary control with the KEYBOARD, once, per area

**2026-08-06, DrillLogify Web.** The only way into an import page was a drop zone rendered as a
bare `<div>`: no `role`, no `tabindex`, no accessible name, and the real `<input type="file">` sat
at `display: none`. So the first step of the sole path through the page **could not be done without
a mouse**, and had never been possible. A 37-case suite passed 37/37 over it.

- **Nothing programmatic could see it.** The element rendered, the click handler worked, the copy
  was correct, the console was clean, and no locator failed, because no case ever tried to reach it
  by keyboard. The accessibility tree simply had no button in it.
- **Two `Tab` presses found it.** This extends the "exercise the control" rule from *clicking* to
  *tabbing*: for each area, tab to its primary control once and press `Enter`.
- **The case is cheap and stable.** Assert the control resolves as a named `button`, that focus
  lands on it, and that `Enter` produces the same observable effect as a click. For a file picker,
  wait on the runner's `filechooser` event: the native dialog is browser chrome, so nothing in the
  DOM moves when it opens.

---

#### An affordance named in the copy is a claim, and claims in copy need a case

**2026-08-06, DrillLogify Web.** An upload area read *"Click to select a file or drag and drop"*.
There was no `onDrop`, no `onDragOver` and no `dataTransfer` anywhere in the page, and there never
had been. Months of green runs never noticed, because no case ever tried to drop anything.

- **Grep a page's copy for the affordances it promises, then check each has a handler**, the same
  way the coverage map checks each branch has a case. "drag", "drop", "paste", "swipe", "double
  click", "right click" and "keyboard shortcut" are the words worth grepping.
- The automated half is reachable without OS support: build a `DataTransfer` in the page and
  dispatch `drop` at the element. That exercises the real handler, which is what is under test; the
  operating-system half belongs to the browser.

---

#### A casing or copy sweep is invisible to a locator gate wherever the assertion is a REGEX

**2026-08-06, DrillLogify Web.** A page-wide sentence-case sweep updated every string literal the
build gates understand. Two cases still failed, on
`getByText(/Overlapping (Depth |Sample )?Intervals/)`: a capital `I`, no `/i` flag, and **no gate
reads a text regex**. One gate checks button names, another checks outcome copy, and a regex on a
table title is neither.

- **After any copy or casing change, grep the specs for the regex forms too**, not just the quoted
  literals. Escaped forms hide as well: one assertion survived a literal sweep as
  `/Failed Rows \(Required Fields \/ Invalid Codes\)/`.
- **A permissive either-or regex is worth replacing while you are there.** That one accepted the
  sample table *or* the depth table, so neither case could tell which one it got. Two cases, two
  exact titles, and a mix-up becomes a failure instead of a pass.

---

#### A fixture value quoted in runbook PROSE is only as true as the last person who checked it

**2026-08-06, DrillLogify Web.** A new case seeded a sample with the physical type named in an
existing case's `Preconditions` line. That line said `CHIPS_CONE`; the case's own spec used
`CORE_HQ`. The shared helper creates a **diamond** hole, and a chip type on a diamond hole is
rejected for the hole's method before any other validation runs, so the new case never reached the
table it was written to test.

- **Prose has no gate.** The id-parity gate matches ids and the locator gate matches button names;
  neither reads a `Preconditions` line, a field reference or a fixture value.
- **Copy fixtures from the spec, not from the runbook**, and when the two disagree, the spec is the
  one that has been executed. Fix the prose in the same change, or the next author inherits it.
- Related trap, same run: an assertion of `<code>-2` for a de-duplicating suffix, because the
  `while` loop opens with `suffix++`. The initialiser one line above said `suffix = 1`. **Read the
  initialiser, not the loop body.**

---

#### Contrast that comes from an ALPHA must be measured in both themes

**2026-08-06, DrillLogify Web.** A decorative chevron at `opacity: 0.65` measured **3.5:1** over the
dark surface and **2.75:1** over the light one. It was approved from a dark screenshot, where it
looked fine.

- **The same alpha loses far more contrast over a light background than a dark one**, so a value
  chosen in one theme is not evidence about the other.
- **Measure the composited pixel, not the token.** `getComputedStyle().color` reports the colour
  before the opacity is applied, so a naive ratio from the token overstates it. Composite it:
  `o*fg + (1-o)*bg`, then compute against the same background.

---

---

#### Shared singleton state: SET it, restore it, and never guard the restore with a non-waiting check

**2026-08-08, Forge.Translation.** A workspace-wide "retry limit" singleton, written by one area's
screen and read by another's cap guard. Three defects in one feature, each of which cost a run:

- **The teardown silently did nothing.** It read `if (await input.isVisible()) { restore() }`.
  `isVisible()` is a **non-waiting** check, so while the SPA was still rendering it returned `false`,
  the restore was skipped, and the value leaked forward. **Never guard a teardown with a non-waiting
  predicate** (`isVisible`, `isEnabled`, `count() === 0` all answer immediately), and **restore shared
  state through the API rather than the UI** — a teardown is not the thing under test, and the API path
  has no rendering race to lose.
- **The leak detonated one run later, in a different file.** The dev database persists between runs, so
  the abandoned value survived to poison the *next* run, where the failure appeared in a spec that never
  mentions the setting: it spent three retries against a limit of twenty and got `200` where it wanted
  `409`. Nothing in the failing file was wrong. **A case that depends on shared state must SET that
  state in a `beforeEach`, not assume the shipped default** — then the assertion measures something the
  case put there. Restore in `afterEach` as well; both halves are needed, for different reasons.
- **A "rejected write changed nothing" assertion must read the value BEFORE the attempt.** Pinning it to
  the shipped default encodes the order the suite happened to run in. Read-before/compare-after costs one
  query and removes the dependency. Applies to every negative-path persistence check: rejected submits,
  failed uploads, 409s, permission denials.

Note that the usual defence against a persistent dev database — unique RUNID-suffixed rows — is exactly
what does **not** help here. A singleton has no RUNID to scope to, so it is the one shape where
set-and-restore is the only option.

---

#### A roll-up written after its children is a race that fixture size hides

**2026-08-08, Forge.Translation.** A worker completed each document inside a loop and finalised the
owning parent row **after** the loop. The spec polled the child to `Completed`, then read the parent
once, and caught the window between the two writes.

- **Poll every level of a roll-up, not just the leaf you happened to wait on.**
- With one child the window is milliseconds and reads as flake; with a realistic batch it is seconds and
  reads as a defect. **Open the worker and find where in the pass each write happens** rather than
  assuming a status change and its roll-up are atomic.

---

#### Interrupting a run orphans the stack, and the next run adopts the corpse

**2026-08-08, Forge.Translation.** Killing the test-runner process left the orchestrator it had spawned
alive. The next run's global setup saw the port answering, took the `reuseExistingServer` path, attached
to a stack whose parent was gone, and when that orphan died mid-run every remaining test failed with
`ERR_CONNECTION_REFUSED`. Fifteen "failures", all one dead process, in specs with nothing wrong.

- **Two tells separate this from a real defect, both cheap to check first:** the errors are *connection*
  errors rather than assertion diffs, and they run **contiguously from some point to the end** rather
  than scattered.
- **After any interrupted run, check for a listener on the app and dashboard ports before re-running.**
  `reuseExistingServer` is a convenience that becomes a trap exactly when you are iterating fastest.

---

---

#### A shared-state assumption is a class of defect, not an instance

**2026-08-08, Forge.Translation.** Having diagnosed that one case assumed a workspace singleton's
default instead of setting it, the fix went into that case, the suite was re-run, and a further
six-minute run was lost to the **same flaw in a sibling case in the same file**, asserting the same
literal.

- **When a root cause is "this case assumed shared state", grep the suite for the literal it assumed**
  before re-running — here the default `3` and the rendered string `of 3 times`.
- On a suite whose feedback loop is minutes, the five-second grep is worth more than the fix: each
  missed instance costs a full run to rediscover, and each rediscovery presents as a *new* problem
  rather than the same one.

---

#### A card scoped by a global filter, with detail lines that are not

**2026-08-08, DrillLogify.** A dashboard driven by one period control per page rendered a chart that
obeyed the window over three summary figures that did not. On screen: *"No QC checks evaluated in this
period."* directly above *Standards: 100% · Blanks: 100% · Duplicates: 100%*. A second card did the same,
listing overdue items aged 578-582 days under *"No completed lab turnarounds in this period."*

- **The tell is a period-scoped empty state with any figure rendered outside its conditional.** For every
  card that can say "in this period", list what else it draws and ask which window each figure used.
- **No test could see it**, because each half was individually correct and no case asserted the two
  together. The assertion that catches it is the **pair**: with data outside the window, assert the empty
  sentence *and* that the detail figures are absent.
- **Scoping the detail can hide something real**, so a filter that removes rows says how many it removed
  ("11 more are overdue from before this period"). Otherwise narrowing a window looks like progress.
- Put the window predicate in **one** function shared by both halves. Computing it inline in the view is
  how the two drifted in the first place.

---

#### An all-clear that fires on an empty set

**2026-08-08, DrillLogify.** A data-completeness card branched on "no rows have gaps" and rendered
*"All **0** finished holes carry geology, surveys, samples and photos"* in success green. Nothing had been
checked: zero of 130 holes were in the state the card filters for.

- **The tell is `rows.length === 0` guarding a positive message** where the underlying population can also
  be empty. That is **three** states, not two: nothing to check, all clear, some gaps. Only the middle one
  earns a success tone.
- The case must cover the empty-population branch explicitly and assert the all-clear string is **absent**
  as well as asserting the right one is present. A presence-only assertion passes with the bug still there.

---

#### A chart label positioned from the data's own maximum lands outside the canvas

**2026-08-08, DrillLogify.** A bar chart placed each value label at `y = height − (value/max)·height − 4`.
For the tallest bar `value === max`, so `y = −4`: outside the `viewBox` and invisible. The chart could
never render its own largest number, which is the one number anyone opened it for.

- **Reserve headroom in the viewBox** rather than clamping the label, or it overlaps the bar it labels.
- **The measurement is one line and beats looking at it:** read the label's `y` and compare it against the
  `viewBox`. In a screenshot a missing label reads as a design choice.
- Same family for a min/max **normalisation**: two records carrying a placeholder coordinate of
  `(100, 100)` against 128 around E 500,000 / N 7,500,000 collapsed a scatter plot into four pixels while
  faithfully rendering all 130 points. **Frame on a Tukey fence (1.5 IQR beyond the quartiles), not on
  min/max, and not on a percentile** — a percentile frame throws the genuine edge of the data outside the
  box and marks good records as suspect, which a test written against it will happily confirm. Pin the
  true outliers to the edge, mark them, and say how many.
- All three belong to the "seed data hides every cap" family: **a defect whose trigger is a property of
  real data is structurally invisible at harness scale.** Drive the populated database once per area.

---

### A row's own control can be clipped out of existence, and only geometry finds it

A list row that puts text beside a control (a name and its delete button, a filename and its menu) is
usually a flex row. A flex item defaults to `min-width: auto`, so it **refuses to shrink below its
content**: a long value does not wrap and does not ellipsise, it pushes its siblings sideways. The card
around the list is normally `overflow-hidden`, so the control on the far end is **clipped away with no
scrollbar to reach it**. The action is not awkward to reach, it is gone.

Measured on a project-tag list at a 500px viewport (2026-08-17): the row overflowed its container by
**271px** and the delete button's right edge sat at **x=727** inside a `<ul>` 427px wide with
`overflow-x: hidden`. Eight rows could not be deleted at that width.

- It survives review because at desk-monitor width everything fits, every assertion passes, and the
  button is **still in the accessibility tree**, so an a11y sweep clears it too.
- **The check is arithmetic:** read `scrollWidth` against `clientWidth` on the row *and* on its
  container, at a narrow viewport. Walk the ancestor chain to find which level is doing the clipping.
- **Design for the longest value the *server* accepts**, not the longest one in the database today. If
  the endpoint caps a name at 100 characters, the row has to survive 100 characters.
- Fix: `min-w-0` + `truncate` on the text, `shrink-0` on the control. Same family as a hover-only
  control: an action that exists but cannot be reached, invisible to every non-visual check.

### A list capped with `Take(N)` and no paging makes a successful write invisible

A list route bounded for safety (`OrderBy(...).Take(200)`, no `skip`/`take`) is not a paged list, it is a
**truncated** one, and silence about the truncation reads as completeness. Two consequences, and the
second is the one that bites:

1. Rows past the cap are absent from every consumer of that endpoint, not just the admin screen.
2. If the order is alphabetical (or anything other than newest-first), a **newly created** row can sort
   past the cap and never appear. The `POST` returns `201` and the thing looks like it was never saved.

That second shape had already broken a harness at 240 rows, presenting as "Add silently did nothing",
which is not what it did, and the case that failed was three files away from the cause.

- **Mirror the server's bound as a named client constant and gate the pair mechanically**, so the
  screen's notice can never describe a limit the server no longer has.
- Have the screen **state its count**, and at the cap say the rest are missing *and from where*.
- Record in the module doc that the notice is a **warning, not a fix**: a deployment that needs more
  than the cap needs real paging.
- Coverage-map it honestly: reaching the cap is usually **not** e2e-reachable (creating N rows through
  the real write path is slow and leaves the shared database at the cap for every later run), so it is
  unit-owned. Say so, with the reason.

### A landmark selector goes ambiguous when data volume conjures a second landmark

Six assertions used a bare `getByRole("navigation")` to mean "the sidebar". That held for months, until
the shared database crossed one page of rows and the list's pagination rendered its own
`<nav aria-label="Pagination">`. A phone-width case then got `1` where it wanted `0`, and another failed
on strict mode with *resolved to 2 elements*. It reads as a mass shell regression and is nothing of the
kind.

- **Name every landmark of a repeated role.** The sidebar's `<nav>` had no accessible name at all, so a
  screen reader announced both identically: a real defect, not merely a selector problem. Fix the app,
  then scope the assertions to the name.
- **Chained uses are unaffected** (`getByRole("navigation").getByRole("link", ...)` resolves to one
  element because the child filter disambiguates), so the breakage lands only on assertions about a
  landmark's *presence*, the least-suspected place, and the reason the failure looks like something else.
- Generalises to any role a second component can also expose: `status`, `alert`, `dialog` (a popover is a
  dialog), `search`, `region`.
- **The trigger is worth internalising: a spec that passed for months can start failing because data
  volume crossed a threshold.** When a run fails in an area the diff never touched, check what the
  database has grown into before suspecting the change. Two independent instances in one review: this,
  and a queue whose "first card" stopped being the run's own.

### A cleanup helper only protects the paths that call it

A shared create-helper that registers what it creates for teardown protects nothing in the cases that
**deliberately bypass it**, and those are exactly the cases whose subject *is* the create control: one
types into the form because the form is under test, another posts to the endpoint because the endpoint
is. Measured (2026-08-17): **16 of 22** rows in a shared dev database had been leaked by two such cases,
one row per run each, walking a table toward the `Take(200)` cap described above.

- **Export an explicit `registerCreated<Thing>(id)` next to every create helper**, and treat "this case
  bypasses the helper" as the signal that it also bypassed cleanup.
- The tell is countable without running anything: list the rows a suite creates and diff against what
  its teardown drains.

### Read a focus ring off the live page, and get its SEVERITY right

A hand-rolled `<button>` with no `focus-visible:ring` is **not** indicator-less. The browser paints its
own `outline: auto`, and it adapts to the theme: measured `rgb(137,144,153)` on a dark row, **5.24:1**.
32 such buttons across 12 files were nearly reported as an accessibility failure; they were a
**consistency** defect, which is a different conversation with the user and a different priority.

- **Press Tab and re-read.** A programmatic `element.focus()` need not match `:focus-visible` after a
  mouse interaction, so measuring that way describes a state the user never sees.
- The genuine defect of this shape is `outline-none` **paired with a ring that paints nothing**: no
  indicator *and* a class list that reads as though there is one. Grep for `outline-none` and check each
  one has a working replacement.
- Ship the correct spelling as **one exported constant** so the right form is the easy one, the way a
  shared field-class constant already is for inputs.
- Note computed `box-shadow` can report all-transparent layers even for a ring that *is* painting, so
  confirm from the ring's own custom property or from an image.

### A panel that renders from defaults has no loading state, and its default is a confident wrong answer

`data?.x ?? 0` reads as defensive coding and is a **missing design**. Measured (2026-08-17): while its
fetch was in flight an admin card printed *"Index up to date."*, pressed **none** of its three mode
buttons, and left both action buttons enabled, so opening the screen on a badly-behind index reported
the index as current, and a click raced state the page had not read. Two sibling cards on the same
screen did the same thing with a settings input and a set of queue counters.

- **The suite structurally could not see it.** Every assertion reached the control through
  `findByRole(..., { pressed: true })`, which *waits*, so all of them sailed past the bad state. Two of
  the card test files even carried a `loaded()` helper whose comment **documented** the render-from-
  defaults behaviour as the mechanism it relied on: the "a test written around a bug will never catch
  it" shape, from the other direction.
- **Enumerate the four states from the component, then drive each one.** A delayed route stub for
  loading, a stubbed 5xx for error, an emptied payload for empty. Reading the JSX finds none of them.
- **The tell in review is a `?.`/`??` chain feeding text a reader will take as fact**, or feeding an
  input, where an empty box is indistinguishable from a saved value of nothing.
- Pair it with the standing rule that an empty state a *failure* can also produce is a lie: this is the
  same rule applied to the *pending* branch, which is the half people skip because it is transient.

### A help affordance's name matches by substring, so it can swallow the control beside it

Extends the "name a help tip after the question it answers" rule below. It is not only the *field's own*
caption that collides: **any sibling control's label appearing anywhere inside the tip's name** does.
A tip labelled *"when a purge can be started or stopped"* made `getByRole("button", { name: "Stop" })`
resolve to two elements, and every case using that button failed on strict mode rather than on its
assertion, which reads as a bug in the case rather than in the newly added tip.

- **Before adding a tip, list the accessible names of every control in the same container and check none
  is a substring of the new label**, case-insensitively, since name matching usually is. Renaming to
  "…or halted" was the whole fix.
- The reverse check is worth doing when a tip already exists: a *new* button whose label happens to sit
  inside an existing tip's name breaks the same way, and the diff that causes it touches neither.

### A selected state built from several visual cues hides the failure of any one of them

A pressed option was marked by a border, a soft background **and** a text colour. Two resolved; the
border token resolved to a near-invisible surface grey, so the *selected* border measured **fainter than
the unselected** one: 1.20 against 1.33 in dark, 1.11 against 1.28 in light. The control never looked
broken, which is precisely why it survived where a single-cue instance of the identical token bug had
already been found and fixed elsewhere in the same codebase.

- **Measure each cue separately against the surface behind it**, rather than judging the control whole.
- **When one instance of a mis-resolving token turns up, grep every other use of that token in a
  *state* position** (selected, active, current, pressed). Three instances were live here across two
  shared components and one screen.

### An area's runbook folder having one file is not evidence the area has one surface

A folder held only the index-maintenance runbook, whose Scope section deferred "using the results" to
another module's runbook. That file covered one narrow journey and nothing else, so five behaviours were
owned by **no case anywhere**, and one guard had no test at *any* level. This is the "a deferral that
names a destination and the reader stops" trap one level up: the pointer named a **file**, which cannot
be checked without opening it, rather than a **case ID**, which can be checked in seconds.

- **Enumerate an area's surfaces from the module's own endpoints and components, never from the count of
  files in its runbook folder.**
- Treat every cross-file deferral as unresolved until it names an ID, in both directions: the deferring
  file and the receiving one.

### A case that exists to prove a guard is designed so it CAN be mutation-checked, then is

Two new cases pinned wildcard escaping in a `LIKE` predicate, and both passed first run, which is when a
guard-protecting test is least trustworthy. Reducing the escape helper to the identity function made both
fail; restoring it made both pass.

- The design decision that made the check meaningful: rather than searching a bare `%` (which returns
  nothing whether or not the guard exists, so it is green and meaningless), each case searched a **real
  seeded identifier with one character replaced by the wildcard**, so the unguarded path matches the row
  and the guarded path cannot.
- **Construct the input so the unguarded code path produces a different, specific result, then delete the
  guard once and watch it fail.** Do it in the same sitting: the mutation is one line and the stack is
  already warm.

### The card got its loading state; the list inside it did not

Giving a panel its four states does not cover a **second fetch behind the same panel**, and that
sub-list is the one everybody forgets — including a pass that had just fixed the parent for exactly
this reason. A job card fixed the previous day to stop rendering from defaults still printed
*"No runs yet."* for its run history while that separate request was in flight **and** when it
returned 500, so a job that had run nightly for a year reported itself as never having run, with no
alert anywhere. Its case passed throughout, because the case drove the *card's* endpoint, not the
*list's*. The same shape one level out: a single "facets" call filling three filter dropdowns had no
failure state, so with it down all three rendered **enabled and empty** while the rest of the page
loaded normally and told the reader the workspace had no projects.

- **Enumerate the requests a screen issues, not the panels it draws**, and give each one its own
  "not yet" and "it went wrong". A coverage row for `state:<screen>.loading` is not evidence that a
  nested list has one.
- The tell in review is the same `?.`/`??` chain as the parent defect, one scope deeper:
  `sub.data?.items ?? []` beside a `total ?? 0` that an empty-state branch keys on.

### An error branch that names the wrong cause is worse than one that names none

`if (isError || !record)` is a tempting shape, and it collapses "the server said 404" with
"everything else". A detail page built that way answered a **500** with *"Document not found — this
document may have been removed"*: actionable and wrong, so the reader re-uploads or opens a ticket
about a deletion that never happened. Branch on the status actually returned; reserve the
does-not-exist sentence for the status that asserts it.

- This is the network-blaming rule (§8, "don't blame the reader's connection") aimed at a
  **specific** wrong cause rather than a vague one, and it is the more damaging of the two.
- Drive it by forcing a 500 from the record endpoint, not by reading the branch.

### Prose that restates a fetched list is a second source of truth nothing checks

Where a screen fetches a set and *also* describes it in a sentence, the sentence drifts and no gate
notices. Measured: a drop zone hand-listed its accepted file types while the provider accepted three
more, hiding them behind "& more" — so somebody holding one of those three would reasonably conclude
the product could not take it. The machine-readable half (the picker's `accept` attribute) was
correct the whole time, which is why nothing looked wrong. The same screen claimed a fixed number of
supported languages regardless of how many loaded, and named the vendor behind a config-switched
integration seam in end-user copy.

- **If the app already holds the data, render it** rather than summarising it.
- If a threshold lives server-side, publish it on an existing response instead of re-typing it in
  the client, so the explanation cannot describe a limit the server stopped using.
- Assert **both directions**: every value the response carries appears, and no value appears that
  the response does not carry.

### Naming a help tip after the field it explains is the natural mistake, and it breaks selectors

Accessible-name matching is **substring** and case-insensitive, so a tip named
`Help: how the source language is used` sitting beside a control named `Source language` makes
`getByLabelText(/source language/i)` match two elements. Notable because this was already written
down in the repo's own gotcha list and got re-introduced **within a day of it being read**: naming a
tip after the thing it explains is simply the obvious move.

- Write the name as **the question the panel answers**, not the caption of its neighbour:
  "how the original language is decided", "why nothing can be stored yet", "what the countdown in
  this column means".
- After adding tips, grep the file for every sibling control's accessible name and confirm none is a
  substring of a tip's name. Watch for morphology too: "…can be started or **stop**ped" collides
  with `button "Stop"`, and "…the **purge** countdown" with `button "Purge"`.

### Killing a harness run mid-flight can poison the next one

Stopping the runner can leave the orchestrator's containers running with nothing driving them. The
next run's readiness probe then reports the stack as already up, reuses it, and collapses a few tests
in as the abandoned process tree finishes dying.

- Presents as **many uniform, same-duration failures starting partway through** — which reads like a
  mass regression and is nothing of the kind. The tell is that the first few tests pass with varied
  timings and everything after fails at an identical duration.
- **Tear down leaked containers before re-running**, and check the readiness probe is not satisfied
  by a corpse (an SPA still serving while its API is gone will pass a naive check).

### Editing a source file while a run is in flight fails the run, and the failure looks like an app bug

A harness that drives a dev server with hot module replacement pushes every save straight into the
browser, mid-test. The resulting failure is in whatever test happened to be running, which is usually an
area the change never touched.

- **The signature:** a timeout whose log shows an action hanging *after* the element resolved ("element is
  visible, enabled and stable… done scrolling"), and a failure screenshot of a screen that has lost state
  it was just given (a picked file gone, a filled field empty). The component tree was re-rendered under
  the action. It is worse when the file saved is imported by the app shell, because then it reaches every
  screen.
- **A long-lived stack adds a second flavour.** A case that races a periodic background worker (an index
  sweep, a purge tick) is deterministic only on a stack that has not been sitting up long enough for
  several sweeps to fire.
- **Triage rule:** before investigating a failure in an area the change did not touch, ask whether
  anything was saved during the run, then re-run that case alone. Measured once: two such failures in a
  197/199 run, both passing in under three seconds in isolation.
- **Corollary:** do the documentation and comment edits before or after a run, never during it.

### An accessible-name lookup is a substring match, so a value set with one value inside another matches twice

Locator libraries match an accessible name by substring unless told otherwise, and a status vocabulary
routinely holds one value inside another: `Healthy`/`Unhealthy`, `Read`/`Unread`, `Complete`/`Completed`,
`Active`/`Inactive`. Asserting the four states of a services panel, `getByRole("img", { name: "Healthy" })`
also resolved the `Unhealthy` row and failed on a strict-mode violation naming both elements.

- **`exact: true` on every name lookup over such a set.** Same trap as naming a help tip after the field
  beside it, arriving from the other direction: here the *values* collide, not the labels.
- **A count assertion over the set is the dangerous form**, because it stays green for exactly as long as
  the set happens to hold only the shorter value. It then breaks the first time real data includes the
  longer one, somewhere that looks unrelated to the change that caused it.

### A hover hint stays open while the pointer crosses its own panel

Moving the pointer away is not a way to close a hint. The panel for a row in a left-hand sidebar opens
upward or sideways, which is exactly the path a move toward a corner travels, and the library reads that
as hovering the content rather than leaving the trigger. Two hints can also be open at once, since a
trigger that keeps focus after a click keeps its own hint open.

- **Assert a hint by filtering on its own text**, not on the bare `tooltip` role, so a hint left open
  elsewhere cannot make the locator ambiguous.
- **Close it with Escape**, which is deterministic, rather than with a pointer move whose effect depends
  on where the panel was placed.

### A glob route pattern spans partial path segments, so it stubs endpoints you did not name

`**` matches across `/`, so `**/api/access/users` also matches `/api/access/dev-users`. Stubbing what you
think is one list endpoint can silently replace a sibling whose suffix matches, and when that sibling is
the identity or persona roster, sign-in breaks for every case after it, far from the stub that caused it.

- **Use a URL predicate** (`(url) => url.pathname === "/api/access/users"`) whenever a sibling path ends
  with the same segment, and keep it in a `const` so `unroute` passes the same reference.

### Boot-time configuration must be stubbed before the first navigation, or the case passes for the wrong reason

An app that fetches its own configuration (branding, auth mode, environment name, build version) does so
before importing the rest of itself. A route registered after sign-in therefore never fires: the case runs
against the real values, asserts them successfully, and proves nothing about the branch it was written for.

- **Any case about boot config takes a fresh page and registers its route first**, which also means it
  cannot use a signed-in fixture.
- **Choose stub values the server would never send.** If the deployment serves "Acme DEV" and the bundle's
  built-in fallback is "Acme", a fallback case asserting "Acme" is provable; one asserting a value both
  could produce is not.

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

#### Grep the repo's own UI-CONVENTIONS document for the page's FILENAME before starting

**2026-08-07, DrillLogify Web.** Three of twelve defects found on one area review were already
written down, by name, in the repo's own conventions file: a text input whose `aria-label` named
the wrapper element instead of the input, seven floating-label dialog fields **with the exact
count**, and two hand-rolled snackbars where the app has a single toast channel. Each entry ended
"fix each as its area comes up for review", and the area review is the only thing that ever reads
them. Nothing gates any of it.

- **Do the grep in discovery, before the browser pass**, so known debt lands in the finding list
  instead of being rediscovered as if it were new. It is one command per page file name.
- **Resolving an entry means editing the paragraph too**, in the same change. Those lists carry
  hand-maintained counts ("8 sites", "the remaining seven"), and a hand-maintained list of sites
  goes stale in the direction that hides work.
- Where a repo has no such document, the equivalent is its design/standards doc, its ADRs, or the
  "known gaps" section of the profile. Ask what the repo writes debt down in, then read it.

---

#### A testability gap recorded as a locator workaround is often an A11Y DEFECT in disguise

**2026-08-07, DrillLogify Web.** A runbook's Testability-gaps table said, truthfully, *"code-type
nav: role-less list item (a div with an onClick); click it by its label text"*. What that sentence
describes is a page on which **no keyboard user could open a single one of its thirty lists**. It
had been written down, worked around, and re-read at every run for months, because the workaround
made the spec pass.

- **Read the gaps table as a defect list first and a selector list second.** Any row whose status is
  "role-less", "no accessible name", "addressed by text" or "no ARIA" is describing something
  assistive technology cannot use either.
- The fix usually costs one component swap (an inert container to the library's button variant) and
  turns the gap row green. ⚠️ It also changes every locator that reached the element, so the
  runbook, the spec and the gaps table move together.
- **Corollary for the run record:** a gap that has survived several runs is not a stable fact about
  the framework. It is an unfixed defect that the suite has learned to route around.

---

#### A boolean whose registry never contains `false` is dead code, and it costs review time on every read

**2026-08-07, DrillLogify Web.** A thirty-entry registry carried the same flag value on all thirty
rows. The unreachable arm gated an info banner, a lock icon, a tooltip and an entire alternative
data source; the reachable arm printed one word on thirty consecutive rows where it distinguished
nothing. A dead-code gate cannot see any of it, because the markup is inline and the flag *is*
read.

- **The tell is the registry, not the code.** When you meet a flag during discovery, look at every
  literal that sets it before reading the branch it guards.
- **Delete the flag with the branch.** Leaving a field nothing reads is a different flavour of the
  same debt, and the next reader has to re-derive that it is always true.
- Record the unreachable arm as `absent:<reason>` in the Coverage map, so the deletion is evidenced
  rather than merely asserted.

---

#### Ask what the DATA contains before trusting a hand-written registry of keys

**2026-08-07, DrillLogify Web.** A page rendered its sections from a hand-written list of thirty
keys. `SELECT DISTINCT <key column>` on the live database returned **thirty-one**: four rows sat
under a key the list did not carry, so they had no route to any screen, could not be edited or
deleted, and nothing told the reader they existed.

- **Run the DISTINCT before writing the Coverage map.** One query turned "the registry looks
  complete" into a defect with a row count attached.
- **The fix is the query, not a longer list**: render `registry ∪ (distinct − registry)`, label the
  remainder through the existing label map with a humanising fallback, and mark that section as a
  problem rather than a feature. A future orphan then surfaces on its own.
- Generalises to any surface rendering from a hand-written key list: table pickers, filter chips,
  tab sets, nav registries, status legends.

---

#### A component library can render a HEADING you did not write, and only a DOM read finds it

**2026-08-07, DrillLogify Web.** MUI's `AccordionSummary` wraps its content in a heading element of
its own, so a heading level set on the typography *inside* it renders **both**: seven categories
emitted fourteen headings, an `h3` around an `h6` with identical text. Every role-and-name query
passes against either one, and the page looks perfect in a screenshot.

- **Probe the outline directly**, scoped to the main landmark:
  `[...document.querySelectorAll('main h1,main h2,main h3,main h4,main h5,main h6')]
   .map(h => h.tagName + ':' + h.textContent.trim())`.
- **Assert it as a list equality for one section**, e.g. `expect(matches).toEqual(['H3:Geology
  Logging'])`. A presence check passes with the duplicate still there, which is how this survived.
- The same shape appears wherever a library owns a wrapper you cannot see in the JSX: stepper
  labels, card headers, dialog titles, tab panels. Check the outline once per area.

---

#### A message ASSEMBLED at runtime belongs in the copy gate's allow-list with a reason, never softened

**2026-08-07, DrillLogify Web.** A page appends an outcome clause to whichever action just
succeeded, because six actions times three outcomes would otherwise be eighteen literals. A gate
that asks whether the asserted phrase exists anywhere in the source correctly reported the joined
sentence as absent, and the joined sentence is still exactly what the reader sees.

- **Assert the composed string and register the exemption with its reason.** Weakening the
  assertion to the half that *is* a literal would have asserted the half that is a lie: "added"
  without ", but it has not reached the server".
- The reason matters more than the entry. A bare allow-list entry is indistinguishable from
  silencing a true failure the next time someone reads it.

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

---

## §11 Approved screens (the reference images)

**Every runbook stores screenshots of its final, user-approved UI**, in
`docs/runbooks/screenshots/<area>/`, and lists them in the runbook's **Approved
screens** section. They are committed, so a human running the runbook on any
profile sees what the page is supposed to look like instead of guessing.

They exist for the failure mode no assertion catches: **a case can pass while the
page looks wrong.** A locator confirms a string is present; it says nothing about
a control that scrolled off its card, a contrast ratio that fails in dark mode, or
a stepper whose last step sits past the viewport edge. The image is the only
artifact a human can check the layout against months later, and the only way a
reviewer can tell "this changed" from "this regressed".

### When to capture

**After the user signs off on the UI, never before.** These are the *approved*
screens, so the sequence is: review the area, make the fixes, screenshot, ask the
user, and only once they have accepted the look do the images land in `docs/`.
Shooting first commits a picture of something that is about to change, which is
worse than having no picture: it looks complete while being wrong.

Re-shoot the affected screens whenever a change alters what the page **looks like**
for that state, and note it in the Run record. **A copy or casing edit counts.** It
is one character in the diff and a different word on the button the reader actually
sees, and it is the class of change that most often ships unshot because it files
itself mentally as "not visual".

### What to shoot

One image per **state a case asserts against**, not one per case. Aim for the
smallest set covering the area's distinct renderings:

- The **primary surface** (the list, the form, the detail page) at a stated desktop width.
- Each **distinct non-happy state** the area owns: the error, the empty, the
  permission-denied, the mid-flow. These are where the defects live and where a
  written step is hardest to picture.
- Any state with a **known responsive or theme risk**, at the width or theme that is
  risky. Shoot the breakpoint that broke, not a comfortable one.
- Skip states that differ only in data. Two rows versus twenty is not a new screen.

### Naming and storage

`docs/runbooks/screenshots/<area>/<YYYY-MM-DD>-<nn>-<state>-<width>-<theme>.<ext>`,
e.g. `2026-08-04-01-idle-1440-dark.jpg`, `2026-08-04-04-idle-phone-dark.jpg`.

**The extension is whatever the capture tool writes, and `.jpg` is fine.** These are
reference images a human compares against, not pixel-diff baselines, so lossy
compression costs nothing that matters and keeps the repo smaller. Do not go looking
for a converter to force one extension: a repo whose folders end up mixed because the
tool changed is a non-issue, and adding an image-processing dependency to satisfy a
naming convention is a bad trade.

- **The date leads**, so the folder listing shows at a glance which states were
  re-shot in the latest pass and which are older vintage. On a partial re-shoot the
  mixed dates are exactly the signal you want.
- The **numeric prefix** fixes the reading order within a pass.
- `<state>` reuses the vocabulary the runbook already uses for that state, so the
  table maps to cases without explanation.
- **One current image per state: replace, do not accumulate.** The previous version
  lives in git history, which is where a before/after belongs; an accumulating folder
  grows without bound and forces every historical row into the table.
  ⚠️ The cost of the date prefix is that a re-shoot is a **rename**, so git records a
  delete plus an add rather than a modify. Most hosts detect the rename, and
  `git log --follow` on the new path still reaches the old one.

⚠️ **Put the screenshots in a sibling folder; do not move the runbook markdown into
a per-area folder to achieve the grouping.** A repo that has adopted this plugin
typically has a parity guard globbing `docs/runbooks/*.md` **non-recursively**, plus
a long tail of cross-references to `docs/runbooks/<area>.md` from other docs, specs
and CI config. A sibling `screenshots/<area>/` gets the same grouping for none of
that cost. Measure both numbers before proposing the restructure, and treat it as
its own change if it is genuinely wanted.

### The table

The runbook's **Approved screens** section carries one row per image: the file, the
state it shows, and the cases it backs. Pointing each image at its cases is what
keeps the set honest: an image no case references is either a missing case or a
stale screenshot, and both are worth knowing.

### Capturing them

Drive the **real running app**, never a mock or a component-test render.

**Drive it with the repo's own e2e browser library, in a script you write and keep.**
A repo that has Playwright or Cypress for its harness already has the library installed
and a browser binary downloaded, so a twenty-line script that launches it, signs in and
shoots a list of named states is the whole job. Take the state names as arguments
(`node shots.mjs <outDir> [state ...]`) so a re-shoot after one fix costs one state
rather than the full set.

⚠️ **Run it HEADED by default, and make headless the opt-in.** A headed run is watchable,
and someone watching catches things no assertion does: a step going somewhere unexpected,
a control that flashes and vanishes, the page reloading between steps. Both of those were
found here by the person watching rather than by the script. Headless suppresses exactly
that feedback and buys only speed, which is the wrong trade in a review whose entire
purpose is looking at the UI. Gate it on an env var (`HEADLESS=1`) so an unattended
re-shoot can still be quiet, and add a small `slowMo` when headed so the run is followable
rather than a blur. **This applies to running the e2e suite during a review too**, not
only to the screenshot script.

⚠️ **Prefer that over an interactive browser plugin, and the deciding reason is
isolation, not convenience.** A plugin that attaches to *your* browser attaches to
**one shared browser**: one profile, one tab group, one page. The moment a second
review is running — another area, another repo, another person on the same machine —
the two fight over tabs and page state, and the failure is silent and confusing,
because the other session's navigation looks like your own page changing underneath
you. A script launches its **own** browser process with its **own** profile every
time, so any number run side by side. It is also the only capture method that is
**reproducible**: the same command a week later produces the same image, which is
exactly what a reference image is for. (2026-08-09, DrillLogify: a review was driving
the shared Chrome when a second review started on another repo.)

The interactive plugin still earns its place for **exploration** — dumping the
accessibility tree, hovering something to see what happens, poking at a live page
mid-diagnosis. Use it to find things out; use a script to capture what you found.

### Three ways a capture script quietly produces the wrong picture

All three were live in one area's first capture runs (2026-08-17) and all three exited **0**.

**1. Photographing whatever the database happens to hold.** The first list image was 22 leaked harness
rows, eight of them 100 characters of "x". That is not what the screen looks like in use, so the image
is useless as the thing a tester compares against. **Seed plausible, realistic rows through the real
UI**, shoot, then remove them: the module owns its own data, exactly as an area that has nothing to
photograph until data exists already seeds itself.

**2. Not restoring the viewport after a narrow shot.** `shoot(state, {width})` takes the width as a
*label*, not as an instruction. A phone-sized shot taken after `setViewportSize(PHONE)` with no restore
filed a 390px image under `...-1440-light.png`. **That is worse than a missing image**: the filename
asserts a baseline the picture cannot serve, and the next reviewer compares against it. Restore the
desktop viewport immediately after any narrow shot, and prefer ordering narrow states last so a missed
restore cannot contaminate anything.

**3. Tearing down through the UI.** Deleting seeded rows by clicking each one leaked two of four: the
list re-fetches after every delete, so a defensive `count()` guard on the next row reads 0 mid-render
and returns early on a row that is still there. **Seed through the real UI, since that is the state
being photographed, but tear down through the API**, and have teardown *report what it removed* so a
silent skip cannot pass for success. Generalises past captures: any loop that mutates a list and
re-queries it between iterations is racing its own refetch.

### Refusal states are the highest-value images in the set

A refusal screen ("access required", "not found", "unavailable") that renders an icon, a heading and one
sentence **looks finished**. When the shared panel component accepted an `action` and the
Administrator-gate wrapper never passed one, five admin screens were dead ends: no way back, no way to
ask for access. Nothing catches it, because the heading and copy are correct and present, so every
assertion passes; the accessibility tree is correct; and each screen reads as complete in code review.
The image is the only place the absence is visible.

Shoot every refusal state an area can produce, and when a fix lands in the **shared** component, the
re-shoot list crosses areas: fixing that wrapper invalidated another area's approved gate screen.

⚠️ **Load the page ONCE, then navigate inside the app** — the same rule §2 states for
specs, and it matters at least as much here, because a screenshot run is watched. One
`goto` at the start, then click the app's own nav, links and buttons. Where a shot needs
a record, click through to it from the list rather than reconstructing a URL. Wait on a
**control that only exists in the destination state**, never on a timer.

Two more notes when the app is offline-first or otherwise stateful. A fresh browser
profile starts with an **empty local database**, so either launch a persistent profile
directory that survives between runs, or have the script sign in and sync before it
shoots. And **wait on a real signal after boot, racing the two outcomes**: an auth gate
that redirects only once the database has booted has rendered neither the login control
nor the signed-in shell when the script first looks, so a single `count()` sees nothing,
skips the login, and every later step then fails on a control that was never going to
be there.

Then two things to get right:

- **Set the viewport explicitly** before shooting and put the width in the filename.
  A screenshot with no stated width cannot be compared to anything later. Note the
  filename width is the **nominal window width** you asked for; the image itself is the
  viewport, so it is legitimately a little narrower and shorter.
- **Clear the client-side state that leaks between shots.** `sessionStorage` and
  `localStorage` survive navigation, so a marker left by a previous capture silently
  renders a *different state* than the one you meant to shoot. This has already
  produced a screenshot of the wrong state filed under the right name.
  ⚠️ **Clear the markers, not the store.** In a real signed-in session the same storage
  holds the user's own preferences and, in an offline-first app, the local database
  itself. Remove the specific keys the states you are shooting branch on, and where an
  area reads no storage marker at all, there is nothing to clear: say so in the run
  notes rather than wiping a developer's working data to satisfy a checklist item.
