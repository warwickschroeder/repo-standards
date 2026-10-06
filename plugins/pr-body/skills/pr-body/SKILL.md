---
name: pr-body
description: Use when asked to draft, write or update a pull request body or PR description for a branch. Scopes from the branch diff against its real base rather than the commit subjects, verifies every claim against source, and writes two sections (what this adds, tests) as a short opener plus dense bullets. Work the branch leaves undone goes to a separate analysis note, never a "future work" paragraph.
---

# PR Body

## Overview

A PR body is read **once, before the diff**, by a reviewer deciding where to look. Anything longer gets skimmed, so the whole thing is a short opener and dot points.

It is **not a design doc**. No current-state and future-state headings, no motivation essay, no history of how the branch got here. If the change needs that much explaining, the explanation belongs in the repo's docs and the body links to it.

**A repo's own PR template wins over this one.** Check for `.github/PULL_REQUEST_TEMPLATE.md` before writing.

## When to use

- Asked for a PR body, PR description, or "write up this branch".
- Finishing a branch and about to open a PR.

**Do not write one unprompted.** Finishing a branch does not imply a PR body. Offer, and let the user decide.

## The 5-phase workflow

### Phase 1: Find the real base, then scope from the diff

**The base is not always the default branch.** A branch stacked on another open PR has that PR's branch as its base, and diffing against the default branch instead describes work the reviewer is not being asked to review. Check before diffing:

```
gh pr list --state open --json number,title,headRefName,baseRefName    # is a sibling branch already in review?
git log --oneline <default-branch>..HEAD                               # commits attributed to this branch
```

If the branch name ends in `-2` or `-part2`, or shares a prefix with an open PR's head branch, assume it stacks until you have checked. When it does, say so in a one-line note at the top of the body naming the PR it sits on, and scope everything else to the real base.

```
git log --oneline <base>..HEAD          # two dots: the commits on the branch
git diff --stat <base>...HEAD           # three dots: the change against the merge base
```

**Three dots, not two.** `<base>..HEAD` on a diff shows the base's own commits as reversals when the branch is behind; `<base>...HEAD` diffs against the merge base, which is what a reviewer sees.

Commit subjects are a starting hypothesis, nothing more. They routinely claim more than the diff does, claim it about the wrong component, or omit the fix that took ten minutes and mattered most. Read the diff before you believe any of them.

Split the stat by test and production, and read the production half in full. On a large branch, read the tests too: they are usually the majority of the lines and they are where the actual claims about behaviour live.

### Phase 2: Verify every claim against source

Anything the body asserts has to be checked, not inherited from a commit message.

- **A registration, ordering or override claim means reading the order.** "X overwrote Y" is only true if X runs after Y; open the file and confirm the line numbers.
- **A "nothing uses this yet" claim means grepping for callers**, which is exactly the claim the opener's limit clause rests on.
- **A "this is the only caller" claim means grepping for callers.**
- **A claim taken from a commit message and not verified gets softened**, not repeated with confidence. Say what you know.

When a commit message's claim turns out to be broader than the code supports, write the narrower true thing. The reviewer will check.

### Phase 3: Find what earns a bullet

One bullet per **piece of the change**. Beyond the obvious pieces, sweep the diff for these. They are what reviewers actually want and what a body written from commit subjects always misses.

| What | Why it earns a bullet |
| --- | --- |
| **A limit a reader would assume away** | The strongest sentence in the body. "The table is created empty and nothing writes to it yet" stops a reviewer hunting for a write path that is not there. |
| **A defect fixed in passing** | The reviewer needs to know it was deliberate and not collateral. |
| **A deliberate non-change** | A site that looks like it should have been changed and was not. Give the reason, so nobody "finishes the job" later. |
| **A file changed for a reason its folder does not explain** | A migration PR touching an embedded-database helper reads as scope creep until the bullet says why. |
| **A repeated shape across backends or modules** | Say it once with the sites listed, not once per backend and never a heading each. |

### Phase 4: Write it

Copy `template.md`. It opens with a **short title** as an `H1`, which is what the author pastes into the PR's title field rather than into the body. One line, sentence case, an imperative verb and the thing it acts on, and it names the headline change rather than trying to cover every bullet. Match the repo's own convention where it has one: `gh pr list --state all --limit 20 --json title` settles whether it uses a ticket prefix, a conventional-commit prefix, or neither.

```
Good:  Add a migration checkpoint table to SQL Server and PostgreSQL
Weak:  Migration engine part 2
Weak:  feat: Implement Migration Checkpoint Entity and Configuration
```

The weak ones name the branch or the commit rather than the change, which leaves a reviewer scanning a PR list with nothing to go on.

Then **two sections, in this order, and no others:**

1. **`## What this adds`**, or `## What this fixes`, or `## What this changes`, whichever is true.
2. **`## Tests`**

Above them, **one short paragraph in plain words**: what the change is for, then what it deliberately does not do yet, **in bold**, so nobody reviews it for something it never claimed. That is the only prose in the document.

Everything else is a **bullet led by a bold plain-words name**, then one to three sentences on what it does, with the real identifiers in backticks:

```markdown
- **A stale save is refused rather than silently winning.** `MigrationCheckpoint` gains a `Version` concurrency token, so the expected value goes into the `UPDATE` statement's `WHERE` clause and a save built from an out-of-date copy matches no row.
```

The bold lead-in is the claim. The rest is the evidence. A reviewer skimming only the bold text should come away with the change.

**`## Tests` is one bullet per test project or folder** and what it covers, marking any new project `(new)`. Name what the tests prove, not what they are called, and name the backends they run on where that varies.

**Do not add these sections**, however tempting:

- **What is wrong today / What it looks like afterwards.** That is a design doc. This is read once, before a diff.
- **Motivation, Background, Context, Summary.** The opener is all of it.
- **Size.** Line and file counts are on the PR page already.
- **Not in this PR / Future work.** See Phase 5.
- **Checklists, acceptance criteria mapping, ticket restatements.**
- **A file-by-file walkthrough**, and no restating the diff.
- **An attribution footer.** The body ends at the last test bullet.

### Phase 5: Put the leftovers somewhere real

A branch almost always leaves related work undone. It does **not** go in the PR body as a "not in this PR" paragraph: nobody reads it, nobody actions it, and it dilutes the review.

Write it as a dated note in `.local/Analysis/` instead: the sites, grouped by seam, with which ones are genuinely worth doing, which are cosmetic, and which should deliberately stay as they are. Then say to the user that you have written it. That paragraph becomes a document someone can pick up.

The one exception is a **deliberate non-change inside the branch's own scope**, which stays in the body as a bullet. The distinction is whether a reviewer of *this* diff will wonder about it.

## Output

`.local/PRBodies/YYYY-MM-DD-pr-body-<topic>.md`, where the date is the day it was written.

Draft to the file first and let the user read it. Do not push it to GitHub, and do not run `gh pr create` or `gh pr edit`, unless asked.

## Non-negotiables

- **A short title, then two sections.** The title as an `H1`, then What this adds (or fixes, or changes), then Tests.
- **The opener says what the change does not do yet, in bold.** A branch that lands a seam nothing calls, a table nothing writes to, or a command covering one case of three has to say so in its first three lines.
- **Bold lead-ins are claims, not labels.** "The EF persister overwrote the host's choice" tells the reviewer where to look. "Registration" makes them read the bullet to find out.
- **Bullets, not paragraphs.** The opener is the only prose. A bullet past three sentences is two bullets or it is over-explained.
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
| Finding the real base, and what the three-dot diff buys you | `reference.md` §1 |
| Verifying a claim before asserting it | `reference.md` §2 |
| Worked bullets, good against bad | `reference.md` §3 |
| What goes in the analysis note instead | `reference.md` §4 |

## Common mistakes

- **Diffing against the default branch when the branch is stacked.** The body describes the parent PR's work as though this branch did it, and the reviewer cannot tell which half to review.
- **Writing from the commit subjects.** They over-claim, mis-attribute, and skip the small fix that mattered. The diff is the source.
- **Two-dot diff on a stale branch**, which shows the base's commits as reversals and produces a body describing work the branch never did.
- **A title taken from the branch name or the last commit subject.** "Migration engine part 2" tells a reviewer scanning a PR list nothing about what changed.
- **An opener with no limit clause.** A reviewer goes looking for the caller, the UI or the write path, finds nothing, and files the branch as incomplete.
- **Design-doc headings.** Current state and future state belong in the repo's docs, linked from a bullet.
- **A heading per backend or module** when it is one change repeated. The reviewer reads the same sentence three times and learns nothing on the second.
- **A "not in this PR" paragraph** that nobody will ever action.
- **Claiming a green suite you did not run.**
- **Explaining the mechanism instead of the cost.** Not "the validator omits the query terms" but "page 2 could carry page 1's version, so the client keeps the wrong rows".
