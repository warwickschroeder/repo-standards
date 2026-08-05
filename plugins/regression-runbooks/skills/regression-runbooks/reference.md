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

**Use the same browser automation the rest of the review used**, which in Claude Code
means the `claude-in-chrome` plugin. It drives the session that is already signed in
and already on the right tenant, so there is nothing to set up, and its screenshots
land as `.jpg`, which is fine (see the naming note above). Reaching for a second
browser plugin purely to control the output format is not worth the extra moving part:
it runs its own profile, so you re-authenticate, re-navigate, and shoot a session that
is not the one you just reviewed.

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
