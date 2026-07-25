# smoke-tests plugin

Short, plain-language test scripts a human runs by hand — for one change, or for everything since the last release so a tester can target only what changed.

Companion to [`regression-runbooks`](../regression-runbooks/README.md): runbooks are the **standing** coverage ("this area still works"), a smoke test is the **delta** ("this change works, and here's what to poke"). This plugin cites runbook cases instead of restating them, and pushes permanent behaviour back into them.

## What it does

A **6-phase workflow**:

1. **Profile (once per repo)** — how the app runs, how to sign in, how to reach the database and the API outside the browser, the release tagging scheme, how migrations run. Saved to `.claude/smoke-tests/profile.md`. Reuses `.claude/regression-runbooks/profile.md` where it exists rather than duplicating it.
2. **Scope from the diff** — never from commit subjects. For a release: `git diff <lasttag>..HEAD` over product code, plus uncommitted work that is also shipping. Test-only and docs-only churn is excluded, and *saying so* is part of the deliverable.
3. **Read the runbooks** — cite a case that already walks the journey; flag one that ought to exist.
4. **Verify every fact** — controls, routes, error strings and limits read from source as you write them, never recalled.
5. **Write it** — four sections; each step is title, action, `**Expect:**`.
6. **Self-check** — mechanical format gates, then: could a cold reader follow this, and tell pass from fail on every step?

## Install

```
/plugin marketplace add warwickschroeder/repo-standards
/plugin install smoke-tests
```

## Use

```
/smoke-test release        # everything since the last tag
/smoke-test <topic>        # one change, from the branch diff
```

Or just ask: *"write a smoke test for this"*, *"what should a tester target before this release?"*

## What it creates in a target repo

| Path | Purpose |
| --- | --- |
| `.claude/smoke-tests/profile.md` | Repo profile — how to run, sign in, reach the DB/API, tag a release. Written once, updated on drift. |
| `<smoke-test-dir>/YYYY-MM-DD-<topic>-smoke-test.md` | A change smoke test, committed with the implementation. |
| `<smoke-test-dir>/YYYY-MM-DD-release-since-<tag>-smoke-test.md` | A release smoke test, written before the tag is cut. |

## The rule that matters most

**Never write one unprompted.** A smoke test is a deliverable in its own right, not part of "done" — unlike tests and docs it is never implied by a change, however significant. If a change looks like it warrants one, say so and let the user decide.
