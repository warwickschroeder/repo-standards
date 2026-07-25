---
description: Write a smoke test — for the current change, or for everything since the last release
argument-hint: "[release | <topic>]"
---

Invoke the `smoke-tests` skill and follow its 6-phase workflow.

Argument: `$ARGUMENTS`

- **`release`** (or empty when a release is clearly what's being asked for) → a **release smoke test** covering everything since the last tag. Scope it from `git diff <lasttag>..HEAD` over the repo's product-code paths, plus any uncommitted work that is also shipping (`git status`). Name it `YYYY-MM-DD-release-since-<tag>-smoke-test.md`.
- **anything else** → a **change smoke test** for that topic, scoped from the current branch or PR diff. Name it `YYYY-MM-DD-<topic>-smoke-test.md`.

Before writing a single step: read `.claude/smoke-tests/profile.md` (create it from the skill's `template-profile.md` if absent), then the regression runbooks covering every surface the diff touches. Copy the click path of any case that already walks the journey **into the smoke test** — mark it `*(from TC-…)*`, never tell the tester to go and run it — and flag any permanent behaviour the change leaves uncovered as a *Runbook gap*.

Then verify every control, route, field and error string against the source as you write it, and finish with the skill's Phase 6 format gates.
