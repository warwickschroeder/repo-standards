# modular-monolith

The [modular-monolith blueprint](skills/modular-monolith/blueprint/README.md), packaged so a repo can install it, adopt the parts it wants, and have every future agent enforce exactly that — no more, no less.

## The problem it solves

The blueprint has always said that for an **existing** app its rules are a *menu, not a mandate*: adopt the testing strategy without touching the architecture, decline module isolation because extraction would cost six weeks, defer the push channel until there is a realtime feature. Which parts are worth it is the user's decision, made per area.

But a decision made in conversation and written into a paragraph somewhere doesn't bind anything. The next agent reads the blueprint, finds a cross-module call, and "helpfully" refactors it — in a commit that looks like an improvement and quietly overturns a deliberate decision. Or it flags six findings in a review where only one was ever in scope, and the user learns to skim.

This plugin makes the scope explicit: **an adoption register in `docs/ROADMAP.md`, one row per area, that says which rules bind here.**

## Install

```text
/plugin marketplace add warwickschroeder/repo-standards
/plugin install modular-monolith@repo-standards
```

## Commands

| Command | What it does |
| --- | --- |
| `/blueprint-align` | Audits the repo against every area, writes a gap report to `docs/specs/<date>-blueprint-alignment.md`, then asks per area — with a recommendation — and records the outcome. Changes no code. |
| `/blueprint-check` | Checks a change against the rules that actually bind, citing each finding's rule and its area's state. Silent on areas the repo declined. |
| `/blueprint-roadmap` | Creates or refreshes the register and the stack decisions. `refresh` checks an existing register against reality. |

The `modular-monolith` skill triggers on its own whenever blueprint rules are in play — you don't have to run a command to get the scoping.

## The register

One table in `docs/ROADMAP.md`, one row per area, five possible states:

| State | Effect on a change |
| --- | --- |
| **Adopted** | Binding — part of the Definition of Done. |
| **Adopting** | Transitional. New code uses the new pattern; the recorded end state says when it's finished. |
| **Deferred** | Not binding. A revisit trigger is recorded. |
| **Declined** | Not binding, permanently. Do not re-litigate, flag in review, or fix in passing. |
| **N/A** | Doesn't apply to this repo's shape. |

The **reason** matters more than the state. "Declined" invites a future agent to reopen the question; "Declined — module extraction costed at six weeks against no delivery pressure; revisit if a second team joins" closes it.

## The 17 areas

Every rule R1–R35 belongs to exactly one area, so *"does R24 bind here?"* always has an answer. Full catalogue with per-area audit guidance in [`areas.md`](skills/modular-monolith/areas.md).

| Tier | Areas |
| --- | --- |
| **Standalone** — no architectural impact | `testing` · `static-gates` · `ci-shape` · `code-quality` · `docs` · `deps` |
| **Contained** — real code changes, architecture untouched | `security` · `constrained-values` · `seams` · `queries-errors` · `no-poll` · `design-tokens` |
| **Architectural** — re-architecture projects | `module-isolation` · `data-isolation` · `events` · `api-shape` · `push-channel` |

**Partial alignment is a stable end state.** An app that adopts only `testing` and `static-gates` is aligned — to exactly what its user chose.

## What's inside

```text
skills/modular-monolith/
  SKILL.md              the operating skill — scoping, the three jobs, the failure modes
  areas.md              the 17 areas: rules covered, what "adopted" means, how to audit each
  alignment.md          the audit → pick → align process in operational detail
  template-roadmap.md   the register + the surrounding ROADMAP
  template-gap-report.md the audit deliverable
  template-profile.md   .claude/modular-monolith/profile.md — repo mechanics, gate commands
  blueprint/            the full blueprint, one file per section, with a read-when index
```

The blueprint's canonical home is `blueprint/` — [`Blueprints/MODULAR-MONOLITH-BLUEPRINT.md`](../../Blueprints/MODULAR-MONOLITH-BLUEPRINT.md) is a redirect kept so existing links resolve.

## Related plugins

The blueprint's two [§17 optional practices](skills/modular-monolith/blueprint/17-optional-practices.md) have plugins of their own. Neither is an alignment area — an app that declines both is fully aligned.

| Practice | Plugin |
| --- | --- |
| End-user & operator guides, plus the mandatory per-module docs | [`app-documentation`](../app-documentation/) |
| Hand-run smoke tests for a change or a release | [`smoke-tests`](../smoke-tests/) |
| The runbook-driven e2e system behind R23/§12.9 (part of `testing`) | [`regression-runbooks`](../regression-runbooks/) |
