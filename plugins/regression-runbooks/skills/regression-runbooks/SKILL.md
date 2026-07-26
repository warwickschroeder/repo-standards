---
name: regression-runbooks
description: Use when creating, updating, or running an exhaustive per-area regression runbook for a web app — discovering all functionality (routes, fields, validation, branches, actions, states, lists), writing tiered manual+automated cases, verifying persistence, and self-improving after every run.
---

# Regression Runbooks

## Overview

A regression runbook is the **single source of truth** for testing one area of
a web app. The same file is used three ways (the "tri-purpose" rule):

1. **Manual** testing in local dev against the local backend/DB.
2. **Automated** testing — the e2e spec is generated 1:1 from it and runs every
   case against the repo's harness.
3. **Manual** testing on a second environment (staging, review app, etc.).

Every case must be both **human-runnable** and **automatable**. The goal: after
any FE or backend change, running the relevant area runbook is a safety net
proving nothing regressed — UI, **persistence**, and **verification** included.

## When to use

- Authoring a new area runbook (`docs/runbooks/<area>.md`, the default path — configurable via the per-repo profile).
- Updating one after a feature or schema change in that area.
- Running one as a regression pass (manual) or generating its e2e spec.

## The 6-phase workflow

### Phase 1 — Profile (once per repo, then reused)

Fill out `template-profile.md` and save the result to
`.claude/regression-runbooks/profile.md` in the target repo. Detect: FE
framework + component library; e2e runner (Playwright/Cypress/etc.) or "none
yet"; the **source-of-truth** for fields and enums (schema package, TS types,
OpenAPI spec, Zod module, or the form components themselves — nothing is
hand-written when a canonical source exists); **verification lanes** (DB query,
API read-back, browser storage — at least one lane must be automatable); how to
drive auth/login and reset state; the area inventory (all routes/nav); selector
conventions. See `template-profile.md` for the skeleton.

**Detect the app's persistence architecture first — it selects which parts of
the template apply.** This template was first written for an offline-first app,
so several of its mechanics (sync buttons, dirty/unsynced badges, local stores,
two-profile conflict, tombstone propagation) exist **only** for that
architecture. Pick one and record it in the profile:

| Architecture | How a write reaches the server | Write-proof is | Delete from the template |
|---|---|---|---|
| **Online CRUD** (request → server → response, no local store) | immediately, on submit | the server's success signal + a read-back of the real row | sync trigger, dirty/unsynced badge, local-state reset, two-profile sync conflict, tombstone propagation |
| **Offline-first / sync** (local store + sync engine) | on an explicit sync or background flush | pending badge → sync → badge clears | — (all of it applies as written) |
| **Realtime / push** (server pushes to connected clients) | immediately; peers converge via push | success signal + a **second session converging without a reload** | sync trigger, dirty badge, conflict-on-sync |
| **Eventual consistency** (queue/worker/projection behind the write) | immediately, but the read model lags | success signal + poll-until-consistent (`expect.poll`) | sync trigger, dirty badge |

Then apply the **architecture-fit rule** (Non-negotiables): a mechanic the app
does not have is **deleted** from the runbook, not carried as an "absent"
placeholder case.

### Phase 2 — Discover (exhaustive, parallel)

For the target area, fan out parallel `Explore` agents (and codebase search
tools where available) to build the **coverage ledger**: routes, fields (control
type, required, bounds, enum/code-list source), validation rules (+ message +
where it surfaces), conditional branches, actions/buttons, state/lifecycle
transitions, list features (filter/sort/search/pagination), and persisted
columns. Cross-check against the source-of-truth **and** any legacy or manual
test docs — a green new suite is not proof of parity with what an older doc
guaranteed. Full ledger schema in `discovery.md`.

### Phase 3 — Write the runbook

From `template-runbook.md`: cases in **three tiers** — Smoke (critical path),
Targeted (per-feature), Full (exhaustive). Fields **derived from the
source-of-truth, never hand-written**. Every mutating case **proves + verifies
persistence**. The Full tier must carry the every-field both-ends round-trip
and per-field validation. Use stable `TC-<AREA>-<S|T|F><n>` IDs; never
renumber.

### Phase 4 — Reconcile (the "miss nothing" gate)

Map every ledger item to ≥1 test case. Anything unmapped **blocks completion**
unless it is genuinely non-existent in the app (stated absence) or
**user-approved** deferred (never a unilateral descope). Write the compact
coverage map (ledger item → TC IDs) as a section inside the runbook deliverable
(`docs/runbooks/<area>.md`) — not in a separate ledger file — so proof travels
with the deliverable.

### Phase 5 — Automate (if the repo has/wants e2e)

Generate the spec 1:1 from the runbook against the repo's harness. Run it and
triage every failure as **test-bug / app-bug / flake** — never rewrite an
assertion just to go green; fix the root cause. If the repo has no harness,
stop at a manual-runnable runbook and flag the gap. See `reference.md` for
selector conventions and form-control gotchas.

### Phase 6 — Self-improve (last step, always)

Classify each lesson: repo-specific or generalizable? When in doubt, treat it
as generalizable.

- **Repo-specific** lesson → append to the repo's `.claude/regression-runbooks/profile.md`
  (Repo-specific gotchas) **and** to the runbook's Self-improving log.
- **Generalizable** lesson → **two targets:**
  1. **Sidecar (always):** append to `~/.claude/regression-runbooks/lessons.md`
     regardless of whether the plugin git source is reachable.
  2. **Plugin git source (when reachable):** edit the relevant skill file — usually adding the gotcha to `reference.md` §8 (the gotcha catalogue); see the full procedure in `reference.md` §10. Skip this step if the source is not on this machine — the sidecar entry is the permanent record.
- If nothing generalizes, record "Skill reviewed — no generalizable lesson this
  run" in the runbook's Self-improving log.

For the full dual-target procedure (sidecar entry format, fold-in step, file
paths): see `reference.md §10`.

Net effect: runbooks converge toward green-on-clean and surface real
regressions — and the skill compounds so each area is cheaper than the last.

## Non-negotiables

- **Tri-purpose:** a case that can't be run by a human on a second environment
  *and* expressed as an e2e step is incomplete. Use `getByRole(role, { name })`
  targets; flag missing accessible names as testability gaps.
- **Fit the architecture — delete what the app cannot have.** This template
  originated in an offline-first app; its sync/dirty-badge/local-store/
  two-profile-conflict/tombstone mechanics apply **only** to that architecture
  (Phase 1 table). When the app doesn't have a mechanic, **delete the section**.
  Never keep it as an "Absent — not applicable" placeholder case: a `### TC-…`
  heading whose entire body explains why it doesn't apply is a phantom test that
  inflates the case count and gets re-read and re-skipped on every pass. Record
  the absence **once**, as a row in the **Coverage map** (`absent:<reason>`) —
  that is what the Phase 4 reconciliation gate reads. Where the app has a
  *different* real behaviour in that slot (a duplicate-key 409, two users racing
  a decision, a second session converging by push), point the coverage row at
  the case that already covers it instead of inventing a new one. Retired IDs
  are never reused or renumbered — the numbering just skips them.
- **Plain language is mandatory — a non-technical tester must be able to run
  it.** Purpose #1 and #3 are *humans*, and a wall of `getByRole` is unreadable
  to them. Every case opens with a two-line plain-English block (what you're
  doing; what breaks for a real user if it fails), and every step table carries
  an **`In plain English`** column alongside `Expected`. **Add the column — never
  reword `Expected`:** `Expected` is the exact contract the spec is generated
  from (element roles, DB columns, error strings, `exact:` notes), and loosening
  it to read nicely silently weakens the automated test. The two columns say the
  same thing at two levels of precision. Put the shared legend (columns, verbs,
  Lanes, personas, `{RUNID}`) once in the runbooks README and link it.
- **Persistence is part of every mutation case** — not a separate afterthought.
  Upload/write proof minimum; read-back + conflict proof in the Full tier.
- **The Full tier carries the every-field both-ends round-trip** (fill every
  field → verify each value in persistence after the write → verify each back
  in the form after a reset/reload) and **per-field validation** (each required
  field + each validator rule blocks save with its message). A Full tier without
  them is not exhaustive.
- **Verification is required** via at least one lane (DB query / API read-back /
  browser storage). At least one lane must be automatable.
- **Derive from the source-of-truth**, never hand-write field/enum lists.
  Distinguish canonical enums (fixed set — assert it) from backend-seeded code
  lists (tenant-extensible — assert it reflects the loaded set, not a hard list).
- **Stable IDs:** `TC-<AREA>-<S|T|F><n>`; never renumber, only append.
- **Never defer or descope unilaterally — ask the user.** An area's runbook
  covers everything that area's UI/entities actually implement. When you find a
  sub-flow, route, action, edge case, or enum you'd be tempted to mark
  "deferred / out of scope / follow-up," **STOP and ask the user** (do now /
  defer with their approval / drop it). The *only* thing you may record without
  asking is a sub-part that **genuinely does not exist** in the app — state that
  absence. Everything that exists but you're not covering is a question for the
  user, not a unilateral decision.
- **Every run is a maintenance pass.** A run that exposes a wrong, stale, or
  incomplete step must end with the runbook (and/or the app) updated — fix the
  app or the runbook, never rubber-stamp broken behaviour.

## Quick reference

| Need | Where |
|---|---|
| Execution profiles (local / automated / second-env) | `reference.md` §1 |
| Area inventory + routes/tables (this repo's discovered profile) | `.claude/regression-runbooks/profile.md` |
| **Persistence architecture → which sections apply** | this file, Phase 1 · `reference.md` §2 preamble · repo profile §1a |
| Persistence mechanics (per architecture) | `reference.md` §2 |
| Upload / read-back / concurrency recipes | `reference.md` §3 |
| Every-field both-ends round-trip | `reference.md` §4 |
| Per-field validation | `reference.md` §4 |
| Verification lanes + type mappings | `reference.md` §5 |
| FK / dependency creation order | `reference.md` §6 |
| Selector conventions + step→verb mapping | `reference.md` §7 |
| Harness run command, fixtures API, form-control gotchas | `reference.md` §8 |
| Test-case ID scheme | `reference.md` §9 |
| Self-improvement procedure (dual target, sidecar format, fold-in) | `reference.md` §10 |
| Coverage ledger schema + discovery procedure | `discovery.md` |
| Blank area template | `template-runbook.md` |
| Per-repo profile skeleton | `template-profile.md` |

## Common mistakes

- Writing UI-only cases that skip persistence verification — the safety net is
  the round-trip; UI-only cases miss dropped/mis-mapped columns entirely.
- A "Full" tier that checks only a few fields, or only the write half — the
  every-field **both-ends** round-trip (write + read-back) is what catches
  silent data-loss and download-only regressions.
- Skipping per-field validation cases — each required field and each validator
  rule must block save with its expected message.
- Hand-listing fields or enum options — drifts from the source-of-truth; derive
  or the list silently goes stale on a rename/addition.
- Brittle selectors (nth-child, CSS class) — use role+name; flag the gap for an
  `aria-label` or `data-testid` fix in the app.
- Fixed `sleep` waits — assert on observable state (toast, URL change, row
  count, status field) rather than waiting an arbitrary duration.
- Renumbering TC IDs when editing — breaks the spec mapping; only append.
- **Checking 1:1 in one direction only.** "Every case has a spec test" is the half
  everyone polices. The reverse — a spec asserting a rule **no case owns** — is
  invisible to it, and happens whenever a fix lands its assertion inside an
  existing test instead of adding a case. The rule then has no owner: nobody
  reviews it, whichever parts of it nobody happened to assert stay uncovered, and
  a later reader of the case text correctly concludes the behaviour is untested
  and files a duplicate. When a fix adds an assertion, check it lands in a
  **case**, not just in a test; and periodically diff the other way — for each
  behaviour a spec asserts, name the case that owns it.
- Not diffing against a legacy manual runbook — a new tiered runbook that passes
  its own suite can still silently drop whole field groups, derived-UI,
  conditional-display flows, and exact validation strings that the older doc
  guaranteed. Diff and slot every concrete behaviour.
- **Carrying template scaffolding the app cannot have** — the commonest failure
  of this skill. Symptom: every runbook in the repo has the same `F2 — sync
  conflict + soft-delete propagation` heading whose body says "Absent, this app
  is online CRUD". Thirteen files each apologising for the same missing feature
  is thirteen copies of a maintenance burden and zero test coverage. Detect it
  with `grep -rn "Absent" docs/runbooks/` — every hit that is a **case heading**
  rather than a coverage-map row is one of these.
- **Writing runbooks only a developer can read** — if a case's only description
  of intent is its `getByRole` steps, the manual profiles (purposes #1 and #3)
  can't actually be run by the tester they were written for.
- **Rewording `Expected` to make it friendlier** — that column is the spec's
  contract. Add the plain-English column beside it; never soften it.
- **Letting per-runbook automation notes drift from reality** — a trailing
  "pending the first green harness run" that survives three green runs makes the
  whole file untrustworthy. Worse, it can contradict the same file's own Run
  record a few lines above. Re-derive these notes from the specs (which TC IDs
  do they actually reference?) rather than editing them by hand.
- Not feeding run learnings back into the skill — each run's generalizable
  gotchas go into `reference.md` (and `~/.claude/regression-runbooks/lessons.md`)
  so the next area and the next repo benefit.
