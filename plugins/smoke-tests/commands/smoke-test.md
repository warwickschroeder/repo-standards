---
description: Write a smoke test for the current change or for everything since the last release, or run an existing one
argument-hint: "[release | <topic> | run <smoke-test file>]"
---

Invoke the `smoke-tests` skill.

Argument: `$ARGUMENTS`

- **`run <file>`** (or any request to run, execute or verify an existing smoke test) → follow the skill's **run workflow** (R1 to R6 in `SKILL.md`, detail in `running.md`). Drive every step in a real browser with `scripts/driver.mjs`, prove each `**Expect:**` with saved evidence (screenshots, database queries, API calls, server-log excerpts, console counts), and finish with the run report from `template-run-report.md`, the `stepNN-` evidence folder, a published evidence page built by `scripts/build-evidence-page.mjs`, and every finding raised in the project's tracker.
- **`release`** (or empty when a release is clearly what's being asked for) → a **release smoke test** covering everything since the last tag, written with the 6-phase workflow. Scope it from `git diff <lasttag>..HEAD` over the repo's product-code paths, plus any uncommitted work that is also shipping (`git status`). Name it `YYYY-MM-DD-release-since-<tag>-smoke-test.md`.
- **anything else** → a **change smoke test** for that topic, scoped from the current branch or PR diff. Name it `YYYY-MM-DD-<topic>-smoke-test.md`.

When writing: before a single step, read `.claude/smoke-tests/profile.md` (create it from the skill's `template-profile.md` if absent), then the regression runbooks covering every surface the diff touches. Copy the click path of any case that already walks the journey **into the smoke test**, mark it `*(from TC-…)*`, never tell the tester to go and run it, and flag any permanent behaviour the change leaves uncovered as a *Runbook gap*. Verify every control, route, field and error string against the source as you write it, and finish with the skill's Phase 6 format gates.
