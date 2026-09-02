# pr-body plugin

Draft a pull request body from what a branch actually changed, for a reviewer deciding whether the change is right.

The diff already says what changed. The body has to say **what was wrong, what is true now, and how you know**. This plugin scopes from the diff rather than the commit subjects, verifies every "why it was broken" claim against source before asserting it, and writes three sections of dense bullets with no filler.

## What it does

A **5-phase workflow**:

1. **Scope from the diff.** `git diff <base>...HEAD`, three dots, against the merge base. Commit subjects are a hypothesis, not a source: they over-claim, mis-attribute, and omit the one-line fix that mattered most.
2. **Verify every claim.** An ordering or override claim means reading the order; a "this was untestable" claim means confirming there was no seam. Where verification narrows a claim, the narrow one gets written.
3. **Find the four things that earn a bullet.** A defect fixed in passing, a deliberate non-change, a test-infrastructure change that looks arbitrary, and a shape repeated across backends.
4. **Write it.** Three headings, bullets with bold lead-ins that carry the claim.
5. **Put the leftovers somewhere real.** Related work the branch did not do goes to a dated `.local/Analysis/` note, not a "not in this PR" paragraph nobody actions.

## The three headings

| Heading | Holds |
| --- | --- |
| **What is wrong today** | The defects, each stated as a claim, with what they cost someone. |
| **What it looks like afterwards** | What is true now, grouped by area rather than by backend, including anything deliberately left alone and why. |
| **Test coverage** | What the tests prove, and which of them would have caught the defects above. |

Nothing else. No Size section, no Motivation, no checklist, no acceptance-criteria mapping, and no heading per module for one change repeated three times.

## Install

```
/plugin marketplace add warwickschroeder/repo-standards
/plugin install pr-body
```

## Use

```
/pr-body                   # infer base and topic
/pr-body master            # explicit base
/pr-body timeprovider      # explicit topic for the filename
```

Or just ask: *"write a PR body for this branch"*.

## What it creates in a target repo

| Path | Purpose |
| --- | --- |
| `.local/PRBodies/YYYY-MM-DD-pr-body-<topic>.md` | The draft, for the author to read before it goes near GitHub. |
| `.local/Analysis/YYYY-MM-DD-<topic>.md` | Related work the branch did not do, ranked and with the sites listed, written only when there is some. |

Nothing is pushed. The plugin does not run `gh pr create` or `gh pr edit` unless asked.

## House rules it follows

- Headings and bold lead-ins are **claims, not labels**.
- **Cost over mechanism**: not "the validator omits the query terms" but "page 2 could carry page 1's version, so the client keeps the wrong rows".
- **Never claim a green test suite that was not run.**
- No em dashes, full-width prose, repo-relative paths, nothing confidential.
