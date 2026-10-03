# Running a Smoke Test: Reference

Mechanics for the run workflow in `SKILL.md`. A run takes an existing smoke-test file, executes every step against a live app, proves each `**Expect:**` with evidence, and ends with three things: a report file, an evidence folder, and a published evidence page the user can open anywhere.

---

## §R1: Before the first step

**Read the smoke test, the profile and the runbook profile in full.** The profile's §6 says where reports go, how the tracker works and whether this session may start servers.

**Record what is actually under test.** `git describe --tags` for every repo involved, the dependency that matters (a schema contract, an SDK) as installed, not as pinned, and whether either working tree is dirty. A stale `node_modules` runs an older contract than the lockfile names; install first when the smoke test says so, and say you did.

**Decide what this environment cannot reach, before running anything.** Production pre-flight queries, a staging sign-in, real identity providers. Ask the user once, as a multi-select, with the recommended handling first: run a production query against the local database as a proxy and mark it `LOCAL … prod NOT RUN`, or mark it `NOT RUN`. Never silently skip, never silently substitute.

**Servers.** Default to the profile's rule. When this session starts them, start each as a background process with its log redirected to a scratchpad file (the API log is evidence). Never start a second instance of something already listening; check the port first. If a dev server watches the repo, **nothing large goes into the repo while it runs** (see §R6).

**Settings the smoke test needs changed** (an env var unset, a feature flag): back the file up to the scratchpad, change it, and restore it at the end. A settings file with comments is not JSON; edit it as text.

## §R2: Driving the browser

Use `scripts/driver.mjs`: one long-lived Playwright browser with its own persistent profile, driven one step at a time. Copy it to the session scratchpad and start it in the background; never run it from inside the repo.

- **Its own profile, never the user's shared Chrome.** Browser-plugin tools attach to the one Chrome the user may be using elsewhere.
- **Headless unless the user asks to watch.** `HEADED=1` when they do.
- **One step per call.** A failure then costs one step's retry, not a whole script's, and you read each result before the next action.
- **Navigate the way a user does.** One `goto` to boot; after that click the sidebar, the row, the breadcrumb. A `goto` on an offline-first app re-initialises its local database and costs seconds per step. Use `goto` only when the step itself types an address (a deep link under test).
- **Screenshot every state the Expect line describes**, named `stepNN-<letter>-<what it shows>`, so the files sort into the order they happened. Setup a step needs gets `stepNN-setup-<what>` on the first step that needs it. A failed call's `error-<ts>.png` is evidence too: look at it, then rename it to its step or delete it.
- **The console is captured continuously** into `browser-console.log`. Use `seqNow()` before an action and `consoleSince(seq, /pattern/)` after it to count exactly what that action caused (writes, sync cycles, errors).
- **Toasts vanish.** Start a poller on `role=alert` before the click that raises one, then read what it collected. A single read after the action misses most of them.

## §R3: Proving each Expect

Every step gets the **strongest evidence its claim allows**, and usually more than one kind:

| Claim is about | Evidence | How |
| --- | --- | --- |
| What the screen says or allows | screenshot + exact text | the driver; quote the rendered text, never paraphrase |
| What reached the server | a database query | the profile's DB lane; save the query and its output as `stepNN-sql.txt` |
| What the API answers | the raw call | `curl -i` (or `curl.exe` in PowerShell), saving status, headers and body as `stepNN-curl.txt` |
| What the server did on its own | the server log | grep the log for the exact line the Expect names; save the excerpt |
| What the client did | the browser console | `consoleSince`, counting lines (writes, sync cycles) where the Expect gives a number |
| What the device holds locally | the app's local store | query it from the page (`page.evaluate` on the app's own data module) |
| That nothing reloaded | a window marker | set `window.__marker = 1` before the action; it survives only if the page did not reload |
| A setting or flag | the stored row before and after | two queries, both saved |

Rules that make the evidence trustworthy:

- **Quote, don't summarise.** The notes column carries the observed values (`8 / 1028198713 / 20 / 1`, `HTTP 207`, the toast text). "Matches" is not evidence.
- **Re-run in isolation when the literal step is polluted.** If an earlier step contaminated this one (a logout that resets a counter, auto-sync splitting what the step expects in one cycle), first record the literal result, then run a clean A/B that isolates the claim. Report both.
- **Check your own instrument before blaming the app.** A regex that only matches the plural, a locator matching a hidden twin, an accessible name that differs from the visible label: each reads as an app failure. Confirm against the DOM or the source before writing FAIL.
- **Never adjust an expectation to match output.** If the app and the Expect disagree, read the source to decide which is right. Either it is a FAIL (app wrong) or a document correction (script wrong), and the report says which.

## §R4: Verdicts and deviations

One verdict per step, from the fixed vocabulary in `template-run-report.md`. The page builder colours by it.

- **PASS** when every Expect line holds as written.
- **PASS (deviation)** when the claim holds but the step could not run as written: setup data had to be repaired, a control was hidden somewhere else, values shifted because an earlier step changed state. The note says what changed and why.
- **FAIL** when any Expect line is not met, **even if the end state is right**. A gate that refuses once and converges on the next sync is still a FAIL of "neither sync logs a refusal".
- **NOT RUN** with the reason. **LOCAL … prod NOT RUN** for a production check run against a proxy.

**A deviation is investigated, not narrated.** When something blocks a step (a record that won't save, a button that is disabled), find the cause in the source before working around it. The cause is either a defect (a finding) or a script error (a document correction); the workaround goes in the note.

**Findings outside the release's scope still count.** A defect that blocked a step is raised even if it predates the release; the report says it predates it.

## §R5: The report and the page

1. **Write the report** from `template-run-report.md` into the profile's run-report folder. Every step present, findings sorted by priority, document corrections, what held up, state left behind.
2. **Verify each load-bearing finding once more against the server before writing it.** A finding that would change someone's plan (data rewritten, a gate refusing) gets one direct query proving it, saved as evidence (`finding-<topic>-sql.txt`).
3. **Shrink the screenshots and build the page**, both into a scratchpad folder outside the repo:
   ```bash
   node scripts/shrink-shots.mjs <evidence dir> <scratch>/page/img <repo>/package.json
   node scripts/build-evidence-page.mjs <report.md> <evidence dir> <scratch>/page/img <scratch>/page/smoke-run.html
   ```
   The builder also writes `<scratch>/page/files.json`, the list to pass as the Artifact tool's `files` with `root: <scratch>/page`.
4. **Publish the page as a private artifact** (load the `artifact-design` skill first) and give the user the link. A run is finished work someone else will read, so it gets a page, not just a file.
5. **Raise every finding** in the project's tracker per the profile (search first, one item per finding), before asking the user anything. Parallel sub-agents work well here; hand each the report path and its findings.

## §R6: Gotchas learned the hard way

- **A large file written inside a watched repo can crash its dev server.** A 112 MB backup saved into the repo's evidence folder made Vite's watcher fail with `EBUSY` and exit. Keep downloads, backups and fixtures in the scratchpad; only screenshots and small text belong in the evidence folder.
- **An unhandled promise in a step kills the driver and its browser.** `driver.mjs` guards against it, but a step that sets up `waitForEvent` must still `await` or `.catch` it.
- **Restarting the browser re-boots the app**, and an offline-first app syncs on boot. Unsynced work you were relying on for a later step is uploaded. Plan the step again from the new state and say so.
- **Auto-sync splits what a step expects in one cycle.** A step that creates two records then syncs gets two cycles if auto-sync fires between them. Turn auto-sync off for that step if the Expect depends on one cycle, and record that you did.
- **A visible label is not always the accessible name.** A dialog button reading "Restore" was named "Confirm restore from backup". Dump `getAttribute('aria-label')` when a role locator finds nothing.
- **Rows are not always rows.** Some lists are buttons labelled by their content (`0–10.18 m`), and an index can be off by a leading "Back" button. Locate by name, not position.
- **Seed data can fail today's validation.** If a record refuses to save for reasons unrelated to the step, find out why (it may be a real defect), then pick or repair data and note the deviation.
- **Steps can poison later steps.** A logout, a deactivation or a role change in one step changes the baseline of the next. Read ahead before running a step that changes global state.
