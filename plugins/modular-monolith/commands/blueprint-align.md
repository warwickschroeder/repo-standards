---
description: Audit this repo against the modular-monolith blueprint, then let the user pick what to adopt — per area, with a recommendation. Writes a gap report and records the decisions in docs/ROADMAP.md.
argument-hint: "[optional: an area slug, or 'recheck' to re-review an already-aligned repo]"
---

Run an alignment review of this repository against the modular-monolith blueprint.

Use the `modular-monolith` skill. Read [`alignment.md`](../skills/modular-monolith/alignment.md) for the process and [`areas.md`](../skills/modular-monolith/areas.md) for the area catalogue and its per-area *Audit by* guidance.

**Argument:** `$1`

- **empty** — full review of every area.
- **an area slug** (e.g. `testing`, `module-isolation`) — audit that area only, and present its decision on its own.
- **`recheck`** — the repo already has a register: verify it against reality before looking for anything new, per *Re-running a review* in `alignment.md`.

## What to do

1. **Establish this repo's idiom** for each blueprint concept before reading code for findings — what a module is here, what plays the shared kernel's part, the migrations tool, the test runner. Record it in `.claude/modular-monolith/profile.md` from `template-profile.md`. Auditing a repo against the reference stack's implementations rather than the blueprint's concepts invalidates the report.

2. **Audit — and change nothing.** Not the typo, not the unused import. Keep a list of small fixes and offer it separately at the end. The report's credibility rests on the tree being untouched, and a drive-by fix inside an area the user is about to decline is the specific harm this whole process exists to prevent.

3. **Write the gap report** to `docs/specs/<today>-blueprint-alignment.md` from `template-gap-report.md`. Lead with what already aligns. Cite every finding to a path or symbol, preferring symbols over line numbers. Record, don't judge.

4. **Present the menu and ask per area**, grouped by blast radius, cheapest tier first, each with a recommendation and its reason — **including the areas you would decline**. Never ask "should we align to the blueprint?"; that bundles decisions with wildly different costs into one unanswerable question.

5. **Offer the two §17 optional practices separately**, after the menu. They are not alignment areas — an app that declines both is fully aligned.

6. **Record the decisions in `docs/ROADMAP.md`** in the same session, from `template-roadmap.md` — state, date and **reason** per area. A decision left in the conversation does not survive it. For declined areas the reason is the load-bearing part: it is what stops a future agent reopening the question or "fixing" the deviation.

Stop after recording the decisions. Actually adopting an area is Step 3 — separate work, one area at a time, in dependency order.
