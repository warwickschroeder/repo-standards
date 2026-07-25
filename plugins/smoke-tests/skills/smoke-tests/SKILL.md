---
name: smoke-tests
description: Use when asked to write a smoke test — a short, plain-language script a human runs by hand to prove a change works, either for one change or for everything since the last release so a tester can target only what changed. Scopes from the diff, cites the repo's regression runbooks instead of restating them, and flags cases that belong in a runbook permanently.
---

# Smoke Tests

## Overview

A smoke test is a **short manual script** that proves a change actually works in the running app. It is written for someone picking the change up cold — technical hands, no memory of the PR — and it is the **delta**, not the standing regression suite.

It does not replace automated tests, and it does not replace regression runbooks. Runbooks say "this area still works". A smoke test says "**this change** works, and here is what to poke".

Two shapes:

| Shape | Covers | Named | Written |
| --- | --- | --- | --- |
| **Change** | one change | `YYYY-MM-DD-<topic>-smoke-test.md` | with the implementation, not after |
| **Release** | everything since the last tag | `YYYY-MM-DD-release-since-<tag>-smoke-test.md` | before the tag is cut |

## When to use

- Asked for a smoke test, by either name ("smoke test this", "what should we test before release", "/smoke-test").
- Asked what a tester should target for an upcoming release.

**Never write one unprompted.** A smoke test is a deliverable in its own right, not part of "done" — unlike tests and docs it is never implied by a change, however significant. If a change looks like it warrants one, **say so and let the user decide**. This is the most common way to get this skill wrong: producing an unasked-for document because a change touched auth, a migration, or several modules.

## The 6-phase workflow

### Phase 1 — Profile (once per repo, then reused)

Fill `template-profile.md` and save it to `.claude/smoke-tests/profile.md`. It answers: how the app runs locally and on what URL, how to sign in and switch roles, how to reach the database, how to call the API outside the browser, where the runbooks live, the release tagging scheme, and how migrations run.

**If `.claude/regression-runbooks/profile.md` exists, read it first** — it already carries personas, verification lanes, auth, the area inventory and the repo's gotchas. The smoke-test profile then only adds what is release-specific. Do not duplicate what the runbook profile already says; link to it.

### Phase 2 — Scope from the diff

Never scope from memory or from commit subjects alone.

- **Change:** the branch or PR diff.
- **Release:** `git diff <lasttag>..HEAD -- <src-paths>`, **plus the uncommitted working tree** if the release includes it. Check `git status` — unreleased work in progress is still shipping.

Filter to product code. A test-only or docs-only commit changes nothing a tester can observe; **saying so explicitly is part of the deliverable**, not an omission. Then classify what remains:

| Class | Example | Where it lands |
| --- | --- | --- |
| **User-observable** | a control disables, a new notice, a changed message | a step |
| **Operator-observable** | a new log, a job counter, a health signal | a step, usually with SQL or a log check |
| **Contract** | a response shape, an auth policy, a paging default | *Watch out for* — it breaks non-UI callers silently |
| **Invisible but risky** | migrations, constraints, security headers, rate limits | a step, and often step 1 |

**A migration that can fail on existing data is step 1, always**, with the pre-flight query that proves it won't. If migrations run at app startup, a failing one doesn't degrade the app — it stops it booting.

### Phase 3 — Read the runbooks

Open the runbooks covering every surface the change touches, **before writing a step**. Then work in both directions:

- **Copy down.** Where a case already walks the journey, reuse its personas, controls, lanes and wording, and **cite it** (`(follows TC-DEL-S1)`, `(extends TC-LIB-T3)`) rather than paraphrasing. A smoke step describing the same journey in different words is how the two drift apart.
- **Push back up.** Where the change means a runbook is now missing a case a tester should run **forever** — not once for this release — flag it inline as a *Runbook gap* and offer to write it. The runbook is the permanent record. If the repo keeps runbook cases 1:1 with e2e specs, a new case ships with its spec test.

A release smoke test whose steps are all novel is a smell: either the runbooks are thin, or the steps are restating coverage that already exists.

### Phase 4 — Verify every fact

Every control, route, field, error string, constant and limit is **read from source as you write it** — never recalled. A stale label is what makes a cold reader give up at step 2.

Note as you go:

- A **server guard above the client's own limit** (a cap the textarea already enforces) is unreachable in the browser — give the curl.
- A surface with **no UI at all** gets the SQL or API path, not an invented screen.
- Something **local dev cannot prove** (headers only applied by the production server, a policy only real TLS activates) is marked as a second-environment step, not silently asserted.

### Phase 5 — Write it

Copy `template.md`. Four sections, nothing else: the title + links line, **What changed**, **Before you start**, **Steps**.

**What changed lists, it doesn't narrate.** More than one distinct change → **dot points, one per change**, not a paragraph that runs them together. Prose is for the single sentence of lead-in and for the one-change case. The same goes inside the risk table: a cell holding three or more items that each carry their own clause — a module and what moved in it, four contract changes — uses `<ul><li>…</li></ul>` rather than a `·`-separated run-on.

Each step is **three lines**: a bold plain-language title saying what it proves, the action as a click path or command, and an `**Expect:**` line. Nothing else — no background, no "why this bug existed", no acceptance-criteria mapping. That belongs in the spec doc or the PR body.

### Phase 6 — Self-check

Mechanical gates, then one judgement call:

```bash
grep -c "## Results" <file>                    # 0
grep -n "^## " <file>                          # exactly What changed / Before you start / Steps
grep -cE '^[0-9]+\. \*\*' <file>               # == the next line
grep -c '\*\*Expect:\*\*' <file>               # one per step
```

Then read it as the tester: **could someone who has never seen this change follow it, and could they tell pass from fail on every step?** A step whose Expect is "it works" has no pass condition.

## Non-negotiables

- **Only on request.** Never write one because a change felt significant. Offer; let the user decide.
- **Every step has an `**Expect:**`.** A step with no stated pass condition is not a test.
- **Every command is one line, in the tester's shell.** No `\` continuations, no heredocs, no multi-line blocks — the tester pastes, they don't assemble. The profile names the shell; write for it, and don't leave bash idioms (`$(…)`, `/dev/null`, bare `curl`) in a script a Windows tester will run in PowerShell.
- **Short.** Title, action, Expect. No walls of text. Cut rationale unless it changes what you do.
- **Verified, not remembered.** Names of controls, routes and error strings come from the source, checked while writing.
- **One app instance, one signed-in session.** Never a second user, device, browser profile or tab. Anything a single session can't produce — a concurrent race, a row that predates the change, an identity the persona roster doesn't offer — is driven by an out-of-band database write or an API call. A scenario that genuinely needs two live sessions is a signal to cover it with an integration test instead: **say so** rather than writing an unrunnable step.
- **Be honest about what can't be tested by hand.** A truncation notice needing 200+ rows, a race needing real concurrency: mark it *Not testable by hand*, name what covers it, and move on. Silently omitting it reads as "covered".
- **The runbook is the permanent record; this is the delta.** Cite cases, don't restate them. Permanent behaviour goes in the runbook.
- **Full width — never hard-wrap prose.** Code inside a fenced block wraps however it reads best.

## Quick reference

| Need | Where |
| --- | --- |
| Blank smoke test | `template.md` |
| Per-repo profile skeleton | `template-profile.md` |
| Scoping a release from the diff | `reference.md` §1 |
| *What changed* — the summary list and the risk table, row by row | `reference.md` §2 |
| Runbook interplay — cite vs. push back | `reference.md` §3 |
| Writing a step (worked examples, good vs. bad) | `reference.md` §4 |
| Reaching what the UI can't (curl, SQL, test-auth headers) | `reference.md` §5 |
| Format gates | `reference.md` §6 |

## Common mistakes

- **Writing one nobody asked for.** The first and most common failure.
- **Writing *What changed* as a paragraph** when it is a list of four changes — the reader can't find their own area in it.
- **Scoping from commit subjects** instead of the diff — misses contract changes with no commit of their own, and pads the script with test-only churn.
- **Restating a runbook case in different words** instead of citing it, so the two drift.
- **Burying the pass condition** inside a paragraph of rationale — the format's whole point is that a tester can skim to the bold **Expect:**.
- **Inventing a screen** for a surface that has none, or quoting a control label from memory.
- **Silently dropping what can't be tested by hand** rather than naming it and what covers it.
- **Treating a migration as ordinary.** If migrations run at startup, a bad one is a boot failure, not a bug — pre-flight it as step 1.
