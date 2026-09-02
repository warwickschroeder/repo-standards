---
description: Draft a PR body for this branch from its diff
argument-hint: "[<base-branch> | <topic>]"
---

Invoke the `pr-body` skill and follow its 5-phase workflow.

Argument: `$ARGUMENTS`

- **A branch name** (`master`, `main`, `develop`) → use it as the base.
- **Anything else** → the topic for the filename; infer the base from the repo's default branch.
- **Empty** → infer both.

Scope from `git diff <base>...HEAD`, three dots, never from the commit subjects. Read the production half of the diff in full, then the tests, since the coverage section is written from what they actually assert.

Verify every "why it was broken" claim against the source before asserting it, including any the commit messages assert. Where verification narrows a claim, write the narrow one.

Write three headings and no others: **What is wrong today**, **What it looks like afterwards**, **Test coverage**. Dense bullets with bold lead-ins that carry the claim. No Size section, no checklist, no per-backend heading for one repeated change.

Work the branch leaves undone goes to a dated note in `.local/Analysis/`, not a "not in this PR" paragraph. Say so when you have written it.

Save to `.local/PRBodies/YYYY-MM-DD-pr-body-<topic>.md` and let the user read it. Do not run `gh pr create` or `gh pr edit` unless asked.
