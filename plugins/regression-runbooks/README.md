# regression-runbooks plugin

An exhaustive regression runbook system for web apps. One skill, one runbook
per area, every regression covered — and the skill gets smarter after every run.

## What it does

The plugin runs a **6-phase loop** for each area of a web app:

- **Phase 1 — Profile (once per repo):** Detect the FE framework, e2e runner,
  source-of-truth for fields/enums, verification lanes, auth/reset method, area
  inventory, and selector conventions. Persist to `.claude/regression-runbooks/profile.md`.
- **Phase 2 — Discover (exhaustive):** Fan out parallel agents over the target
  area and build a full **coverage ledger** — every route, field, validation
  rule, conditional branch, action, lifecycle state, list feature, and persisted
  column.
- **Phase 3 — Write the runbook:** Produce `docs/runbooks/<area>.md` in three
  tiers (Smoke / Targeted / Full). Fields derived from the source-of-truth, never
  hand-listed. Every mutating case proves and verifies persistence.
- **Phase 4 — Reconcile:** Map every ledger item to ≥1 test case. Anything
  unmapped blocks completion unless it is a stated absence or user-approved defer.
- **Phase 5 — Automate (if repo has/wants e2e):** Generate the spec 1:1 from
  the runbook. Triage every failure as test-bug / app-bug / flake — never
  rewrite an assertion just to go green.
- **Phase 6 — Self-improve (last step, always):** Feed lessons back to the
  repo profile, the runbook log, the global sidecar
  (`~/.claude/regression-runbooks/lessons.md`), and the plugin git source when
  reachable. See `reference.md §10` for the dual-target procedure.

## Install

```
/plugin marketplace add warwickschroeder/repo-standards
/plugin install regression-runbooks
```

## What it creates in a target repo

| Path | Purpose |
| --- | --- |
| `.claude/regression-runbooks/profile.md` | Repo-specific profile (framework, lanes, conventions, repo-specific gotchas). Committed once; updated on drift. |
| `docs/runbooks/<area>.md` | One runbook per area — the human-browsable deliverable and the spec source. Committed with implementation. |
| `<e2e-dir>/<area>.spec.ts` (optional) | Generated e2e spec, 1:1 with the runbook (`<e2e-dir>` from the repo profile). Only if the repo has/wants an e2e harness. |

## Where cross-repo lessons go

Generalizable lessons are written to **two targets** (see `reference.md §10`):

1. **Always:** `~/.claude/regression-runbooks/lessons.md` — the global sidecar,
   reachable from any session on this machine.
2. **When reachable:** The relevant plugin file(s) in this repo's git source
   (e.g. `skills/regression-runbooks/reference.md`), plus a `plugin.json`
   version-bump note. Fold into the plugin when you next commit.

Repo-specific lessons stay in `.claude/regression-runbooks/profile.md` (the
per-repo profile) and the relevant runbook's Self-improving log — they are not
promoted to the global sidecar or plugin.
