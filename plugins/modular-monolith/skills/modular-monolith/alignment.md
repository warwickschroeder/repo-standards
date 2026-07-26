# Running an alignment review

The operational detail behind blueprint §16. Read this when running `/blueprint-align`; the area catalogue and its per-area *Audit by* guidance is [`areas.md`](areas.md).

## Contents

- [Before you start](#before-you-start)
- [Step 1 — the audit](#step-1--the-audit)
- [Step 2 — the user picks](#step-2--the-user-picks)
- [Step 3 — align incrementally](#step-3--align-incrementally)
- [Re-running a review](#re-running-a-review-on-an-already-aligned-repo)

## Before you start

Three hard rules govern the whole process. They are worth stating to the user up front, because each one contradicts an instinct they may reasonably expect you to follow:

- **Audit first, change nothing.** The deliverable is a gap report. Not a refactor, not a branch with "obvious" fixes.
- **Adopt only what the user picked**, per area, with a recommendation — never as a bundle.
- **The stack is never an alignment target.** "Align" never means migrating to the reference stack.

### Establish what you are auditing against

The blueprint's rules are written against **concepts**, not the reference stack's implementations. Before reading any code, work out this repo's idiom for each concept — what a "module" is here, what plays the part of the shared kernel, what the migrations tool is, what the test runner is. Record it in `.claude/modular-monolith/profile.md` from [`template-profile.md`](template-profile.md).

Getting this wrong is the most expensive mistake available, because it invalidates the whole report: an audit that measures a Django app against `IModule` and a `DbContext` produces gaps that are artifacts of the mapping rather than findings about the code, and the user will — correctly — stop reading.

Where a concept genuinely has no counterpart ("there is no module seam at all"), that is itself the finding for the relevant area. Record it as *no counterpart*, not as a forced mapping onto the nearest thing.

## Step 1 — the audit

### Gather before you judge

Work through the areas in [`areas.md`](areas.md), using each one's *Audit by* line. A few artifacts are worth building early because several areas key off them:

- **The dependency graph between modules/packages.** The single most informative artifact in the whole review — it settles `module-isolation` outright and informs `events` and `data-isolation`.
- **The test inventory.** Which suites exist, what each actually touches, and whether anything reaches a real database. Settles most of `testing`.
- **The CI workflow, read step by step.** Settles `ci-shape` and most of `static-gates`.
- **The list of data contexts and schemas.** Settles `data-isolation`.

Parallel `Explore` agents (or the repo's code-graph tools) are well suited to the breadth here; read the decisive files yourself.

### Cite evidence, and cite it precisely

Every finding names a path or a symbol. A reader who cannot verify a claim in under a minute will argue with it instead of acting on it, and one unverifiable claim makes the whole report negotiable.

Prefer naming a **symbol** over `file.ext:line` — line citations rot silently, and a report is read months later.

**Open every file a grep pointed at before the hit becomes a finding.** Search is how you find candidates, never how you confirm them. The failure this prevents is specific and embarrassing: a repo that has already done the work is often the one whose files mention the banned pattern most — in the comment explaining the migration, in the test named after what it replaced, in an unrelated API that merely shares the word. Reporting that as a gap tells a team you have not read their code, and it discredits the findings that were real.

### Record, don't judge

The register that comes out of this review is a decision document, and decisions are made worse by adjectives. Compare:

| Judgement | Finding |
| --- | --- |
| "The tests are inadequate" | "No integration tests. Unit tests use an in-memory DB substitute (R32 gap) — `TestDbFactory`, 14 call sites." |
| "CI is a mess" | "One `build.sh` step runs lint, build and tests together (R34 gap: gates are not individually visible; a lint failure and a test failure are indistinguishable in the run log)." |
| "Modules are tangled" | "Six of seven modules reference at least one sibling; `Billing` references four (R1 gap). Graph in the detail block." |

The right-hand column is not softer — it is more damning, because it is specific. It is also what lets the user decline the area without feeling they are defending bad work, which is the conversation you want in Step 2.

### Lead with what already aligns

Open the report with the areas that already match. This is not diplomacy: adopted-by-accident areas are free to formalise, they anchor the sequencing, and a report that opens with six paragraphs of gaps misrepresents a codebase that is usually doing many things right.

### Do not fix anything

Not the typo, not the unused import, not the obviously-wrong constant. Two reasons, and the second is the one that bites:

1. The audit's credibility rests on the codebase being unchanged when the user reads it.
2. A drive-by fix inside an area the user is about to **decline** is precisely the harm the register exists to prevent — and you cannot know which areas those are until Step 2.

Keep a list of the small things. Offer it at the end of Step 2 as a separate, optional cleanup.

Write the report from [`template-gap-report.md`](template-gap-report.md) to `docs/specs/<date>-blueprint-alignment.md`.

## Step 2 — the user picks

### Present by blast radius, cheapest tier first

Group the areas as standalone → contained → architectural, and give each a **recommendation with its reason**. The tiers are about how much of the app a change touches, not how long it takes, and that is the framing the user needs: a two-week standalone change is a much easier decision than a two-day architectural one.

### Ask per area, never as a bundle

"Should we align to the blueprint?" is a question with no good answer — yes commits to weeks of re-architecture nobody scoped, no throws away the static gates that would have cost an afternoon. Every real decision here is per area.

Batching the *question* is fine; batching the *decision* is not. Presenting six standalone areas together and asking which of them to take is a per-area choice in one turn. Asking "shall we do the standalone tier?" is a bundle wearing a tier's clothing.

### Recommend, including where to decline

An audit that recommends adopting everything has recommended nothing. The areas worth **declining** are usually the most valuable advice in the report — say plainly where the cost does not land for this app, and why. A user who sees you argue against an area will trust the ones you argue for.

### Offer the §17 optional practices separately

End-user guides and hand-run smoke tests are **not** alignment areas — an app that declines both is fully aligned. Offer them after the menu, in their own turn, so they are not mistaken for a tier.

### Write the decisions down in the same session

Record the outcome in `docs/ROADMAP.md` from [`template-roadmap.md`](template-roadmap.md) — adopted, adopting, deferred, declined, N/A, each with its reason and date. A decision that stays in the conversation does not survive it, and the next agent starts from the same unknown state the audit was run to resolve.

**The reason matters more than the status**, particularly for declined areas. "Declined" invites a future agent to reopen it; "Declined — module extraction costed at six weeks against no delivery pressure; revisit if a second team joins" closes it.

## Step 3 — align incrementally

- **One area at a time**, in dependency order (the *Depends on* column in [`areas.md`](areas.md)). `testing` before anything that needs its safety net; `static-gates` early, with a baseline that only burns down; architectural areas last.
- **Every alignment change is a normal change.** It ships the tests, docs and gate-green proof that the *adopted* rules require — an alignment commit is not exempt from the rules it is adopting.
- **Architectural areas go strangler-style**: build the new seam, move one consumer, verify, repeat. Never a big-bang rewrite, and never more than one module in flight.
- **Transitional states are allowed but tracked.** Record the transition and its end state in the register; never let a *new* feature use the old pattern once its replacement is adopted.
- **Update the register as each area lands** — move it from Adopting to Adopted with the date. This is the step most likely to be skipped, and skipping it converts the register from a contract into a historical document.

**Partial alignment is a stable end state, not a failure.** An app that adopts only `testing` and `static-gates` is aligned — to exactly what its user chose. Nothing in a later review should treat it as half-finished, and no future audit should re-present the declined areas as outstanding work.

## Re-running a review on an already-aligned repo

Repos drift, and the register goes stale in a way that is invisible until someone checks. A re-review is narrower than a first audit:

1. **Check the register against reality first.** Areas marked Adopted that no longer hold are the highest-value finding in the whole review — a rule everyone believes is enforced but is not is worse than one nobody claimed, because it has been trusted.
2. **Check Adopting rows for staleness.** A transitional state with no movement since its start date is either finished (update it) or abandoned (say so, and let the user re-decide).
3. **Check Deferred revisit triggers.** Has any fired?
4. **Only then look for new gaps**, and only in adopted areas — plus any area whose circumstances changed (a realtime feature arrived, so `push-channel` is no longer N/A).

**Do not re-present declined areas.** They were decided. Re-raising them each review is the exact behaviour the standing-decision rule exists to stop, and it teaches the user that writing a decision down does not make it stick.
