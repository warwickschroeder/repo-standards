---
name: pr-body
description: Use when asked to draft, write or update a pull request body or PR description for a branch. Scopes from the branch diff rather than the commit subjects, verifies every claim against source, and writes three sections (what is wrong today, what it looks like afterwards, test coverage) as dense bullets. Work the branch leaves undone goes to a separate analysis note, never a "future work" paragraph.
---

# PR Body

## Overview

A PR body is written for a reviewer who has not read the branch and is deciding **whether the change is right**, not what it contains. The diff already says what changed. The body has to say what was wrong, what is true now, and how you know.

It is a **document**, not a commit log. It explains itself in everyday words before the first identifier appears, and it keeps every file path, count and identifier exactly as precise as the diff made them.

## When to use

- Asked for a PR body, PR description, or "write up this branch".
- Finishing a branch and about to open a PR.

**Do not write one unprompted.** Finishing a branch does not imply a PR body. Offer, and let the user decide.

## The 5-phase workflow

### Phase 1: Scope from the diff, never the commit subjects

```
git log --oneline <base>..HEAD          # the story the author thought they were telling
git diff --stat <base>...HEAD           # what actually changed (three dots: against the merge base)
```

**Three dots, not two.** `<base>..HEAD` on a diff shows the base's own commits as reversals when the branch is behind; `<base>...HEAD` diffs against the merge base, which is what a reviewer sees.

Commit subjects are a starting hypothesis, nothing more. They routinely claim more than the diff does, claim it about the wrong component, or omit the fix that took ten minutes and mattered most. Read the diff before you believe any of them.

Split the stat by test and production, and read the production half in full. On a large branch, read the tests too: they are usually the majority of the lines and they are where the actual claims about behaviour live.

### Phase 2: Verify every claim against source

Anything the body asserts about **why** something was broken has to be checked, not inherited from a commit message.

- **A registration, ordering or override claim means reading the order.** "X overwrote Y" is only true if X runs after Y; open the file and confirm the line numbers.
- **A "this was untestable" claim means confirming there was no seam**, not assuming it.
- **A "this is the only caller" claim means grepping for callers.**
- **A claim taken from a commit message and not verified gets softened**, not repeated with confidence. Say what you know.

When a commit message's claim turns out to be broader than the code supports, write the narrower true thing. The reviewer will check.

### Phase 3: Find the four things that earn a bullet

Beyond the headline change, sweep the diff for these. They are what reviewers actually want and what a body written from commit subjects always misses.

| What | Why it earns a bullet |
| --- | --- |
| **A defect fixed in passing** | The reviewer needs to know it was deliberate and not collateral. |
| **A deliberate non-change** | A site that looks like it should have been changed and was not. Give the reason, so nobody "finishes the job" later. |
| **A test-infrastructure change that looks arbitrary** | A magic constant, a widened timeout, a changed default. Without its reason it reads as a fudge. |
| **A repeated shape across backends or modules** | Say it once with the sites listed, not once per backend. |

### Phase 4: Write it

Copy `template.md`. **Three headings, and no others:**

1. **What is wrong today**
2. **What it looks like afterwards**
3. **Test coverage**

Above them, a **two or three sentence opener** in plain language: what the problem class is, what the change does about it, and what stays the same in production. That is the only prose in the document.

Everything else is a **bullet with a bold lead-in**:

```markdown
- **Document expiry.** `ExpirationManager` computes `@expires` from the injected clock.
```

The bold lead-in is the claim. The rest is the evidence. A reviewer skimming only the bold text should come away with the change.

**Do not add these sections**, however tempting:

- **Size.** Line and file counts are on the PR page already. A percentage split of tests to production is a vanity metric.
- **Not in this PR / Future work.** See Phase 5.
- **Motivation, Background, Context.** That is what *What is wrong today* is.
- **Checklists, acceptance criteria mapping, ticket restatements.**
- **A per-module or per-backend heading each.** Same change repeated across three stores is one bullet naming the three, not three headings.

### Phase 5: Put the leftovers somewhere real

A branch almost always leaves related work undone. It does **not** go in the PR body as a "not in this PR" paragraph: nobody reads it, nobody actions it, and it dilutes the review.

Write it as a dated note in `.local/Analysis/` instead: the sites, grouped by seam, with which ones are genuinely worth doing, which are cosmetic, and which should deliberately stay as they are. Then say to the user that you have written it. That paragraph becomes a document someone can pick up.

The one exception is a **deliberate non-change inside the branch's own scope**, which stays in the body as a bullet under *What it looks like afterwards*. The distinction is whether a reviewer of *this* diff will wonder about it.

## Output

`.local/PRBodies/YYYY-MM-DD-pr-body-<topic>.md`, where the date is the day it was written.

Draft to the file first and let the user read it. Do not push it to GitHub, and do not run `gh pr create` or `gh pr edit`, unless asked.

## Non-negotiables

- **Three headings.** What is wrong today, what it looks like afterwards, test coverage.
- **Headings and bold lead-ins are claims, not labels.** "The EF persister overwrote the host's choice" tells the reviewer where to look. "Registration" makes them read the bullet to find out.
- **Bullets, not paragraphs.** The opener is the only prose. If a bullet needs three sentences, it is two bullets or it is over-explained.
- **Verified, not remembered, and not inherited from a commit message.**
- **Never claim tests pass unless you ran them.** Describe the coverage as written. If the suite was not run, say so to the user, outside the document.
- **No em dashes, and no en dashes as punctuation.** Comma, colon, brackets, full stop or semicolon.
- **Full width.** Never hard-wrap prose. Code inside a fenced block wraps however it reads best.
- **Repo-relative paths**, never absolute ones.
- **Nothing confidential.** No internal ticket URLs, no customer names, no credentials.

## Quick reference

| Need | Where |
| --- | --- |
| Blank PR body | `template.md` |
| Scoping commands and what the three-dot diff buys you | `reference.md` §1 |
| Verifying a claim before asserting it | `reference.md` §2 |
| Worked bullets, good against bad | `reference.md` §3 |
| What goes in the analysis note instead | `reference.md` §4 |

## Common mistakes

- **Writing from the commit subjects.** They over-claim, mis-attribute, and skip the small fix that mattered. The diff is the source.
- **Two-dot diff on a stale branch**, which shows the base's commits as reversals and produces a body describing work the branch never did.
- **A heading per backend or module** when it is one change repeated. The reviewer reads the same sentence three times and learns nothing on the second.
- **A "Size" section.** The PR page has the numbers.
- **A "not in this PR" paragraph** that nobody will ever action.
- **Inheriting an unverified "why".** A commit message saying a registration came from YARP is a hypothesis until you open the file.
- **Claiming a green suite you did not run.**
- **Explaining the mechanism instead of the cost.** Not "the validator omits the query terms" but "page 2 could carry page 1's version, so the client keeps the wrong rows".
