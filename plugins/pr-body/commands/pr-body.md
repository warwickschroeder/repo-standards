---
description: Draft a PR body for this branch from its diff
argument-hint: "[<base-branch> | <topic>]"
---

Invoke the `pr-body` skill and follow its 5-phase workflow.

Argument: `$ARGUMENTS`

- **A branch name** (`master`, `main`, `develop`, or another feature branch) → use it as the base.
- **Anything else** → the topic for the filename; work out the base as below.
- **Empty** → work out both.

Find the real base before diffing. Check `gh pr list --state open` for a branch this one is stacked on: a branch cut from another branch still in review has that branch as its base, and diffing against the default branch claims the parent PR's work as this one's. When it stacks, open the body with a one-line note naming that PR.

Scope from `git diff <base>...HEAD`, three dots, never from the commit subjects. Read the production half of the diff in full, then the tests, since the `## Tests` bullets are written from what they actually assert.

Verify every claim against the source before asserting it, including any the commit messages assert, and especially any "nothing uses this yet" limit. Where verification narrows a claim, write the narrow one.

Open with a short PR title as an `H1`, for the author to paste into the title field: one line, sentence case, an imperative verb and the thing it acts on, naming the headline change rather than the branch. Check `gh pr list --state all --limit 20 --json title` for the repo's own convention first.

Then write two sections and no others: **What this adds** (or fixes, or changes) and **Tests**. Above them one short paragraph saying what the change is for and, in bold, what it deliberately does not do yet. Everything else is a bullet with a bold plain-words lead-in and one to three sentences with real identifiers in backticks. No design-doc headings, no Size section, no checklist, no per-backend heading for one repeated change, no attribution footer.

Work the branch leaves undone goes to a dated note in `.local/Analysis/`, not a "not in this PR" paragraph. Say so when you have written it.

Save to `.local/PRBodies/YYYY-MM-DD-pr-body-<topic>.md` and let the user read it. Do not run `gh pr create` or `gh pr edit` unless asked.
