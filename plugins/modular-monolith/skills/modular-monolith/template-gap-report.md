<!--
Copy to docs/specs/YYYY-MM-DD-blueprint-alignment.md in the target repo.

This is the STEP 1 deliverable of an alignment review, and it is a report — not a refactor and
not a plan. Nothing in the codebase changes while it is being written, including the trivial
things you are certain are wrong. That restraint is the point: a "while I was in there" fix inside
an area the user is about to decline is exactly the harm the register exists to prevent.

RECORD, DON'T JUDGE. "No integration tests; unit tests use an in-memory DB substitute (R32 gap)"
is a finding. "The tests are bad" is an opinion, and it makes the report harder to act on because
the reader now has to separate the evidence from the verdict.

Area catalogue, with per-area "Audit by" guidance:
  plugins/modular-monolith/skills/modular-monolith/areas.md
-->

# Blueprint alignment review — {{APP NAME}}

**Date:** {{YYYY-MM-DD}} · **Reviewed against:** the modular-monolith blueprint, R1–R35 · **Commit:** `{{sha}}`

> **This is an audit. No code changed.** It records where the codebase stands against each adoption area so the decisions in Step 2 can be made on evidence. A gap is **not** a defect: most of these areas the app never claimed to follow, and declining one is a legitimate outcome.

## What this app is

{{Two or three sentences: what it does, its architecture as it actually stands, its stack, its age, how many people work on it. This paragraph is what makes the rest of the report readable to someone who has not seen the codebase — and it is where the reviewer proves they looked.}}

**Stack:** {{server language/framework · data access · database · client · realtime · test tooling}}

**Shape:** {{e.g. "layered monolith: one project per tier, one database, no module seam" / "seven modules behind a shared kernel, one schema each"}}

## Already aligned

<!-- Lead with these, and mean it. Adopted-by-accident areas cost nothing to formalise, they anchor
     the rest of the conversation, and opening a report with six paragraphs of what is wrong
     misrepresents the codebase and puts the reader on the defensive. -->

| Area | What is already true | Formalising it costs |
| --- | --- | --- |
| `{{area}}` | {{what the repo already does that matches}} | {{usually "nothing — write it down"}} |

## Gaps by area

<!-- One row per area that is NOT already aligned. Blast radius is the column that drives Step 2 —
     it is about how much of the app a change would touch, not how long it would take.

     standalone    — touches no runtime behaviour (tests, gates, CI config, docs)
     contained     — touches code, not architecture
     architectural — changes how the app is put together

     Effort: rough order of magnitude only (hours / days / weeks). Precision here is false and
     invites the reader to treat it as a quote. -->

| Area (rules) | Current state | Gap | Blast radius | Effort | Depends on |
| --- | --- | --- | --- | --- | --- |
| `{{area}}` ({{R*n*}}) | {{what the code does today, cited to a path or symbol}} | {{what the blueprint asks for, and the distance}} | {{standalone / contained / architectural}} | {{hours / days / weeks}} | {{area, or —}} |

### {{`area`}} — detail

<!-- One block per area whose row above needs more than a cell. Keep the ones that carry a real
     finding; delete the rest rather than writing a paragraph that restates the table.

     Cite evidence by path and symbol. A finding a reader cannot verify in under a minute will be
     argued with instead of acted on. -->

**Today:** {{what the code does, with paths/symbols}}

**Blueprint:** {{the rule, in one sentence, and the section}}

**Distance:** {{what would have to change; the parts that are mechanical vs. the parts that need judgement}}

**Notable:** {{anything that changes the decision — a partial implementation, a blocker, a dependency on another area, a place where this repo's requirements argue against the rule}}

## Not applicable

<!-- Areas that do not apply to this app's shape, so the register can record N/A rather than
     leaving them unlisted (which reads as unknown). -->

- **`{{area}}`** — {{why it does not apply, e.g. "no realtime feature and none planned"}}

## Optional practices (§17)

<!-- Offered separately from the alignment menu — they are not adoption areas, and an app that
     declines both is fully aligned. Note only whether each already exists and what it would take. -->

| Practice | Exists today | Note |
| --- | --- | --- |
| End-user & operator guides | {{yes / no / partial}} | {{...}} |
| Manual smoke tests | {{yes / no}} | {{...}} |

## Recommended sequence

<!-- A recommendation, not a decision — the user picks per area in Step 2, and this section exists
     to make that choice informed rather than to pre-empt it. Order by dependency, not by value:
     the testing safety net before anything that needs it, static gates early with a baseline that
     only burns down, architectural areas last.

     Say plainly where you would NOT adopt. An audit that recommends everything has recommended
     nothing, and the areas worth declining are usually the most useful advice in the report. -->

1. **`{{area}}`** — {{why first; what it unlocks}}
2. **`{{area}}`** — {{...}}

**Would not recommend adopting:** `{{area}}` — {{why the cost does not land for this app}}

## What this report does not cover

<!-- Honesty about the audit's own limits. A reader who discovers a blind spot you did not name
     stops trusting the parts you did cover. -->

{{Anything not examined and why — a subsystem not read, a gate that could not be run locally, a judgement that needs someone with product context.}}
