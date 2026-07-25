# Smoke Tests — Reference

Mechanics for the `smoke-tests` skill. The workflow and the rules are in `SKILL.md`; this file is the detail behind each phase.

---

## §1 — Scoping from the diff

### A change smoke test

The branch or PR diff. Nothing more — resist widening it to "while we're here".

### A release smoke test

```bash
git tag --sort=-creatordate | head -5          # find the last release tag
git log -1 --format='%ci %s' <lasttag>         # when it was cut
git diff --stat <lasttag>..HEAD -- <src>       # what actually changed in product code
git status --short                             # uncommitted work that is ALSO shipping
```

Three rules:

1. **Product code only.** A test-only or docs-only commit changes nothing a tester can observe. Excluding it is correct; **saying you excluded it** is what stops the reader wondering whether you missed something. One line in *What changed* is enough: "the rest is tests, docs and dependency bumps".
2. **Include the working tree when it is shipping.** `git status` before you scope. A release cut from a branch with uncommitted work in it includes that work.
3. **Read the diff, not the subjects.** Commit messages describe intent; the diff describes behaviour. Contract changes — a response shape, a default page size, an auth policy — frequently arrive inside a commit whose subject says something else entirely.

### Classifying what you find

| Class | Recognise it by | Where it lands |
| --- | --- | --- |
| **User-observable** | a control's state, a new message, a changed layout | a step |
| **Operator-observable** | a log line, a counter, a job state, a health signal | a step, usually with SQL or a log check |
| **Contract** | a response shape, a status code, a paging default, an auth policy | *Watch out for* — no screen shows it, and non-UI callers break silently |
| **Invisible but risky** | migrations, constraints, security headers, rate limits, startup guards | a step, and often step 1 |

The class that gets missed is **contract**. A response that changed from an array to `{ items, total }` looks fine in the app — the app was updated with it — and breaks every script, report and integration that wasn't.

### Dependency upgrades

A framework major (a router, a UI library, a test runner) rarely gets its own step, but it decides **which existing journeys are worth re-walking**. A router upgrade means sign-in, sign-out, redirects and guards; a UI-library major means the controls it renders. Copy in the click paths from the runbook cases that already cover those, and say why they are in scope.

---

## §2 — What changed: the summary and the risk table

### The summary is a list

One sentence of lead-in, then **a dot point per distinct change**. A paragraph that runs four changes together reads as one thing, and the reader who only wanted to know whether their area moved has to parse the whole thing to find out. Prose is right for exactly two cases: the lead-in sentence, and a smoke test covering a single change.

| | |
| --- | --- |
| **Good** | `- Sign-in is stricter: no email in the token means no profile, and a taken email gets a 409 instead of an empty 500.` |
| **Bad** | `Responses now carry security headers, every filter is capped, sign-in is stricter, and the SPA moved to Router v8.` |

One point per change a tester would recognise — not one per commit, and not one per file. Related behaviour that ships together and is proved by the same step is one point. The excluded churn (test-only, docs-only, dependency bumps) is a point of its own, so its absence isn't mistaken for an oversight.

### The risk table

Six rows. Each answers one question a person deploying this needs answered.

| Row | Answers | Gets it wrong by |
| --- | --- | --- |
| **Scope** | what is reached | listing files instead of areas |
| **Migration** | can the deploy fail? | saying "yes" without saying whether existing rows are normalised first |
| **Config** | what must be set before deploying | listing keys that changed internally but need no action |
| **Runbooks** | what standing coverage exists, and did it move | naming files without saying "unchanged" or which cases were added |
| **Watch out for** | the adjacent thing most likely to break | repeating *What changed* instead of naming a side effect |
| **If it breaks** | how to get back | "revert" — when the migration doesn't revert with it |

**A cell that enumerates gets dot points too.** *Scope* pairing eight modules with what moved in each, or *Watch out for* naming four contract changes, is a list — write it as `<ul><li>…</li></ul>` inside the cell, which every renderer handles and which lets a reader find their own module at a glance. This is the one place HTML belongs in a smoke test. Two tests: does each item carry its own clause, and are there three or more of them? A bare run of names with nothing attached (the runbook files covering the change) reads fine inline, and a row holding one answer (*Migration: No*, *Config: None*) stays one line.

**Risk levels.** `low` — contained, reversible, no data touched. `medium` — a shared path or a visible surface many people use. `high` — the deploy itself can fail, data is rewritten, or a security boundary moved. `critical` — data loss or a breach is on the table if it's wrong. One sentence of why, on the same line.

**Migrations deserve the most care.** Answer three things: what it does, when it runs, and whether it normalises existing rows before tightening. A constraint added without a normalising step ahead of it fails on real data — and if migrations run at app startup, that is not a bug report, it is a container that won't boot. That migration is step 1 of the smoke test, with the query that proves the data is clean, run **before** the deploy.

---

## §3 — Runbook interplay

If the repo has regression runbooks (see the `regression-runbooks` plugin), they are the **standing** coverage and the smoke test is the **delta**. Getting this boundary right is most of what makes a smoke test short.

### Inline the steps — never send the tester away

Where a runbook case already walks the journey, **copy its actions into the smoke test**. Name the case as provenance so the two can be kept in sync, but the ID is a footnote, not the instruction:

```markdown
14. **The reshaped responses didn't break the ordinary path.** *(from `TC-DEL-S1`, `TC-DEL-T3`)*
    Upload a file → **Library** → open it → **Delete** → confirm **Delete document** → **Deleted documents**: it is listed → **Restore** → **Library**: it is back.
    Then delete two more, tick both on **Deleted documents**, and use the selection bar's **Restore**.
    **Expect:** the row leaves and returns each time; the bar reads "2 documents selected" and both come back. Both responses changed shape this release, so a clean pass here **is** the test.
```

Not this:

```markdown
    Run `TC-DEL-S1` end to end, then a bulk restore (`TC-DEL-T3`).      ← a redirection, not a step
```

A step that names a case instead of an action costs the tester the thing the format exists to protect: they lose their place, open a second document written for a different audience, read past selector tables and pass/fail boxes meant for someone else, and come back unsure what they were proving. The smoke test is **self-contained** — a tester who never opens a runbook can still run every step in it.

**Copy the run, not the apparatus.** A runbook case carries selectors, verification lanes, automation pointers, "in plain English" glosses and result boxes. Take the click path and the observable outcome; leave the rest behind. A seven-row case usually inlines to one or two lines.

The cost is a second copy of the journey that can drift from the runbook's. That is accepted deliberately: the case ID in the step is what makes the drift findable, and a smoke test is read once and then it is history — the runbook is what has to stay right.

### Push permanent behaviour back up

A smoke test is read once and then it is history. If the change introduces behaviour a tester should check **forever**, it belongs in the runbook. Flag it inline, right where you noticed it:

```markdown
> *Runbook gap:* `document-library.md` `TC-LIB-T3` doesn't cover which controls disable during a search. Add it.
```

Then offer to write the case. If the repo keeps runbook cases 1:1 with e2e specs, the case ships with its spec test — a documented case nothing runs is silent rot.

### The smell

A release smoke test whose steps are **all** novel means one of two things: the runbooks are thin (so the gaps list should be long), or nobody read them (so the steps are inventing wording for journeys that already have some). Either way the wording drifts from what the standing coverage says, and the two descriptions of the same click path start disagreeing.

---

## §4 — Writing a step

Three lines. Title, action, Expect.

```markdown
9. **An over-long project tag is refused.**
   **Admin › Project tags** → paste 101 characters into **New tag name** → **Add tag**.
   **Expect:** `name must be at most 100 characters.` No tag created. 100 characters still works.
```

- **Title** — what it *proves*, in plain words. Not "test the tag cap"; a claim that can be true or false.
- **Action** — a click path (`**A › B** → **C**`) or a command, written out in full. Exact control names. No prose around it, and **never a pointer to a case in another document** — if a runbook already walks it, copy the path in (§3).
- **Expect** — the one observable outcome. Quote exact error strings; name the column if the check is in the database.

### Commands are one line

A tester selects a command and pastes it. Anything that needs assembling first is a step they get wrong, and a line that only runs in the shell *you* had is a step they can't run at all.

- **One line, always.** No `\` continuations, no heredocs, no `for … ; do … ; done` spanning lines. A very long line is fine — the fenced block scrolls, and it pastes as one thing. Several *independent* commands may share a block, one per line, each runnable on its own.
- **Write for the shell the profile names**, not the one you happen to be in. `\` continuations, `$(…)` substitution, `/dev/null` and `seq` are POSIX idioms that fail in PowerShell and CMD. For PowerShell that means `NUL` not `/dev/null`, `1..70 | ForEach-Object { … }` not `for i in $(seq 1 70)`, and **`curl.exe`, never bare `curl`** — in Windows PowerShell 5.1 `curl` is an alias for `Invoke-WebRequest`, which takes entirely different flags and fails confusingly.
- **A JSON body inline is a trap on Windows.** PowerShell's quoting of native-command arguments differs between 5.1 and 7, so a `-d "{\"a\":1}"` may reach the exe with its quotes already eaten. Build the body and write it to a file in the same line, then pass `-d "@body.json"` — that behaves the same everywhere.
- **A command that reads a local file creates it first.** `-F "files=@sample.txt"` and `-d "@body.json"` die with curl's unhelpful *"(26) Failed to open/read local data from file/application"* the moment the tester's working directory doesn't hold that file. Produce the fixture on the line above. A placeholder is only right for something the tester genuinely already has — and then name it as one (`@<a document you uploaded earlier>`), so nobody pastes it verbatim.
- **SQL: one statement per line.** A block of several statements is fine; a single statement wrapped across lines is not.

### Good vs. bad

| Bad | Why | Good |
| --- | --- | --- |
| "Check that validation works" | no pass condition | "**Expect:** `name must be at most 100 characters.` No tag created." |
| "This was a bug because the endpoint never trimmed…" | rationale, not instruction | delete it; it belongs in the PR |
| "Click the Sync button" | invented from memory | read the component; it may be an icon button with a state-dependent tooltip |
| "Run `TC-DEL-S1` end to end" | sends the tester to another document | write the click path out; keep `*(from TC-DEL-S1)*` as provenance |
| "Press **Run now** three times" | the step's own setup greys the button out | read the `disabled` condition; drive it from the API instead |
| "Verify the list is correct" | unfalsifiable | name the row, the count, or the column value |

### When it can't be tested by hand

Say so, name what covers it, and move on:

```markdown
**Not testable by hand:** the truncation notice needs 200+ rows in one list — integration tests cover it.
```

This is not an omission, it is a finding. Silently dropping it reads as "covered".

### Order

Cheapest and most blocking first. A migration pre-flight that must run **before** the deploy is step 1. Then startup, then the areas, grouped under `###` headings when there are more than about eight steps — which a release smoke test usually has.

---

## §5 — Reaching what the UI can't

Three recurring cases. All are legitimate; inventing a screen instead is not.

**A server guard above the client's own limit.** A textarea with `maxLength=1000` means the server's 1000-character cap is unreachable in the browser. Give the API call. Say why in half a sentence — "the textarea stops you at 1000, so this one needs curl" — so the tester doesn't think they are being asked to do it the hard way for no reason.

**A surface with no UI.** Give the SQL or the API path. Never describe a screen that doesn't exist.

**Something one session can't produce.** A concurrent race, a row that predates the change, an identity the persona roster doesn't offer, a file that has become unreadable. Drive it with an out-of-band database write or a raw API call carrying whatever the repo's test-auth mechanism uses. Example — forcing a read failure without touching storage:

```sql
UPDATE search."Documents" SET "SourceBlobPath" = 'missing/nothing.txt', "ContentIndexedAt" = NULL WHERE "FileName" = '<your file>';
```

**One app instance, one signed-in session** stays the rule. Never a second browser, profile, device or tab. A scenario that genuinely needs two live sessions — a true concurrency race — is a signal to cover it with an integration test: say so rather than writing a step nobody can run.

**What local dev can't prove.** If production serves the app differently from dev — a real server applying security headers where a dev server doesn't, real TLS activating HSTS, a real identity provider — mark those steps as second-environment. Asserting them locally is worse than omitting them: it reports a pass that proves nothing.

---

## §6 — Format gates

```bash
grep -c "## Results" <file>                    # 0 — there is no Results section
grep -n "^## " <file>                          # exactly: What changed / Before you start / Steps
grep -cE '^[0-9]+\. \*\*' <file>               # step count
grep -c '\*\*Expect:\*\*' <file>               # must equal the step count
```

Hard-wrapping has no reliable automated check — long lines are the goal, so a max-line-length rule would fail the format by design. Confirm by eye that each paragraph, bullet and table row sits on one line. Code inside a fenced block is exempt: wrap it however it reads best.

Then the judgement call the greps can't make: **read it as the tester**. Could someone who has never seen this change follow it end to end, and could they tell pass from fail on every step? If a step's Expect could be argued either way, it isn't finished.
