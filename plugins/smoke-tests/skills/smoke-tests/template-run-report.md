<!--
Copy to <run-report-dir>/YYYY-MM-DD-smoke-run-<release-or-topic>.md (the profile's §6 names the folder).
Evidence goes in a sibling folder YYYY-MM-DD-smoke-<release-or-topic>-evidence/, every file prefixed stepNN-.
Prose is full width, never hard-wrapped. No em or en dashes anywhere, including quoted app text: write "a dash".
Delete these comments.
-->

# Smoke test run: <what was run, e.g. web v1.20.0 with API v1.15.1>

Run of [`<smoke test file>`](<relative link>) on <YYYY-MM-DD>, against <local stack | staging>. Every step was driven in a real browser (<headless or headed> Playwright, own profile) and checked against <the database, the API log, the browser console, the app's local store>. Evidence for each step sits in [`<evidence folder>/`](<link>), named `stepNN-*`.

**Result: <N> of <total> steps pass, <F> fail, <X> not run<, and steps a to b ran against a proxy only>.** <One sentence: are the failures real defects, environment, or the script? One sentence: does the release's headline behaviour hold?>

## What this release changes, in one paragraph

<Plain language, from the smoke test's What changed, so a reader of this report alone knows what was under test.>

## What was actually run

- **<App>** `<git describe>` (<anything past the tag, and whether it matters>). <Install or build steps run first, and why (a stale dependency, a pinned contract).>
- **<API or backend>** `<git describe>`, <how it was started and with which settings the smoke test requires>. <Migrations applied, with the log file.>
- **<Database>** <where, which tenant or schema>.
- **Browser** <headless or headed> Chromium via the Playwright driver with its own persistent profile. Full console log: `browser-console.log`.
- <Any restart, role switch or setting change made mid-run, and that it was put back.>
- <What was NOT run: test suites, staging, production. Say it plainly.>

## Step results

<!--
One row per step, in order, every step present. Result is exactly one of:
  PASS
  PASS (<short deviation>)        the claim holds but the step had to change, or something else was noticed
  FAIL                            any Expect line not met, even if the end state was right
  NOT RUN                         with the reason in the notes
  LOCAL PASS, prod NOT RUN        a production pre-flight run against a local proxy
  LOCAL INFO, prod NOT RUN        a sizing query with no pass condition, run locally
Notes quote the observed values, then name the evidence files. The page builder reads this table.
-->

| # | Step | Result | Evidence and notes |
| --- | --- | --- | --- |
| 1 | <step title> | **PASS** | <observed values quoted exactly>. `step01-<file>`. |

## Findings, highest priority first

<!--
Every defect found, in or out of the release's scope, highest priority first; within a priority, costlier first.
Heading is a claim with its priority: "### High: <what goes wrong, in plain words>". Scale: Critical, High, Medium, Low.
Then three short paragraphs. Low-priority copy slips may share one heading as a bullet list.
Environment or seed-data problems get their own heading starting "Environment, not this release:".
-->

### <Priority>: <claim>

**What goes wrong.** <Symptom, then the mechanism with file:line, then the measured evidence.>

**What it costs.** <In terms the reader already understands. Say whether it predates this release.>

**How to fix.** <The smallest fix that addresses the root cause.>

## Smoke test document corrections

<!-- Every place the script was wrong or ambiguous: a hidden control, a missing button, a step whose own setup breaks a later one. One bullet each, naming the step. -->

- Step <n>: <what the script says, what is actually true, and the fix>.

## What is genuinely good

<!-- Not padding: the behaviour that measured well, with the numbers. -->

- <Measured strength>.

## State left behind

- **Restored:** <every setting, row and file changed for the run and put back>.
- **Left in place (test data):** <every record the run created, by name>.
- **Still running, started by this session:** <servers, containers, the driver>.
