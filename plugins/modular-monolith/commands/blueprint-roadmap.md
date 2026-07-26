---
description: Create or refresh docs/ROADMAP.md — the standing register of which blueprint areas this repo adopted, declined or deferred, plus its stack decisions.
argument-hint: "[optional: 'refresh' to check an existing register against reality, or an area slug plus its new state]"
---

Create or update this repository's `docs/ROADMAP.md` — the standing decision register.

Use the `modular-monolith` skill. Write from [`template-roadmap.md`](../skills/modular-monolith/template-roadmap.md); the area catalogue is [`areas.md`](../skills/modular-monolith/areas.md).

**Argument:** `$1`

- **empty** — create the register, or fill in what an existing `docs/ROADMAP.md` is missing.
- **`refresh`** — check the existing register against the codebase and report where it has gone stale.
- **an area slug and a state** (e.g. `static-gates adopted`) — record that one decision, with today's date and the reason.

## What to do

**Creating it.** If an audit exists (`docs/specs/<date>-blueprint-alignment.md`), build the register from its outcomes. If not, and the user knows what binds, take it from them. If neither — run `/blueprint-align` first rather than guessing; a register populated by inference is worse than none, because it will be trusted.

Every one of the 17 areas gets a row. An unlisted area reads as *unknown*, which is the single state this file exists to eliminate. Where an area genuinely doesn't apply, record **N/A** with the reason.

**Preserve what is already there.** An existing ROADMAP usually carries phase history, known defects and decisions that predate this template. Restructure around them; don't overwrite them. If the repo already records adoption decisions in prose (a "Blueprint alignment decisions" section is the common shape), convert it to the table **and keep the prose** — the reasoning is the part that has value, and the table is only a scannable index over it.

**Reasons, not just states.** For declined areas especially: "Declined" invites a future agent to reopen the question; "Declined — module extraction costed at six weeks against no delivery pressure; revisit if a second team joins" closes it. The reason is what makes a standing decision stand.

**Adopting rows get an end state**, not just a status — what is done, what "finished" looks like, and the rule that new code uses the new pattern.

**Deferred rows get a trigger**, and an event ("a second deployable", "the first realtime feature") is a stronger trigger than a date.

**Record the stack decisions too** (§3) — persistence engine, auth, client framework, and the rest. They are the other half of what a future agent cannot safely infer, and §3 requires them written down.

**Point `CLAUDE.md` at it.** A register nobody loads changes nothing, and the file guaranteed to be in context every session is the repo's own agent-instructions file — not this skill. When you first write the register, add a short pointer there: that the blueprint is followed selectively, that `docs/ROADMAP.md` § *Blueprint adoption* says which areas bind, and that a deviation from a declined area is not a defect. Keep it accurate afterwards — a CLAUDE.md claiming rules the repo doesn't enforce is worse than one that says nothing.

**Refreshing.** Check each Adopted area still holds — an area everyone believes is enforced but is not is the highest-value finding available, because it has been trusted. Check Adopting rows for movement, and Deferred triggers for whether any has fired. Report what you find and let the user decide; don't silently rewrite a state.

Note plainly if the register and the code disagree: the code wins, and the register entry is the bug.
