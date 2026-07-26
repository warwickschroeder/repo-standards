---
description: Check work against the blueprint rules that actually bind in this repo — scoped by the adoption register, so deviations from declined areas are not reported as defects.
argument-hint: "[optional: what to check — a diff, a branch, a path, or a described change. Defaults to uncommitted changes.]"
---

Check work in this repository against the modular-monolith blueprint rules **that this repo has actually adopted**.

Use the `modular-monolith` skill.

**What to check:** `$1` — if empty, check the uncommitted changes (`git status` / `git diff`); if that is clean, check the commits on this branch that are not on the default branch.

## What to do

1. **Read the adoption register first** — the *Blueprint adoption* section of `docs/ROADMAP.md` (`.claude/modular-monolith/profile.md` names its exact location if it exists). The rules in play are those covered by areas marked **Adopted** or **Adopting**; [`areas.md`](../skills/modular-monolith/areas.md) maps area → rules.

   **If there is no register, stop and say so.** Do not fall back to "all 35 rules bind" — that reports findings the user never signed up for. Offer `/blueprint-align`, and meanwhile review the change on ordinary merits without citing rule numbers.

2. **Read [`blueprint/01-rules-digest.md`](../skills/modular-monolith/blueprint/01-rules-digest.md)** for the rules the adopted areas cover, plus the relevant blueprint section for anything needing a precise judgement.

3. **Judge the change against those rules only.**

4. **Report each finding with its rule and the area's state**, so the filter is visible:

   > **R24** (`testing`, adopted) — the migration adds `Submission.RetryCount` but `SubmissionPersistenceTests` doesn't read it back. R24 asks for every affected field proved by name through a real round-trip.

   Findings without a rule number are fine when they are ordinary review comments — just don't dress them as blueprint findings.

5. **Say nothing about deviations in non-adopted areas.** If one is genuinely serious — a leaked credential, a data-loss path — raise it **on its own merits**, not as a rule violation. `security` being declined does not make a committed secret acceptable; it means you argue the secret, not R35.

6. **Check the Definition of Done** ([`blueprint/15-definition-of-done.md`](../skills/modular-monolith/blueprint/15-definition-of-done.md)), filtered the same way. Where `testing` is adopted, R25 asks that the repo's canonical gates were **run and read** — the commands are in the profile. Report honestly whether that happened; don't infer it from the code looking correct.

Finish with a one-line verdict: does this change satisfy the rules that bind here? If the answer is no, the blocking findings come first.
