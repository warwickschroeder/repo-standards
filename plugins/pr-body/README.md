# pr-body plugin

Draft a pull request body from what a branch actually changed, for a reviewer about to read the diff.

A PR body is read **once, before the diff**, so it is a short opener and dot points, not a design doc. This plugin finds the branch's real base, scopes from the diff rather than the commit subjects, verifies every claim against source before asserting it, and writes two sections with no filler.

## What it does

A **5-phase workflow**:

1. **Find the real base, then scope from the diff.** A branch stacked on another open PR has that branch as its base; diffing against the default branch claims the parent PR's work as this one's. Then `git diff <base>...HEAD`, three dots, against the merge base. Commit subjects are a hypothesis, not a source: they over-claim, mis-attribute, and omit the one-line fix that mattered most.
2. **Verify every claim.** An ordering or override claim means reading the order; a "nothing uses this yet" claim means grepping for callers. Where verification narrows a claim, the narrow one gets written.
3. **Find what earns a bullet.** A limit a reader would assume away, a defect fixed in passing, a deliberate non-change, a file whose folder does not explain it, and a shape repeated across backends.
4. **Write it.** A short title, two sections, a short opener, and bullets with bold lead-ins that carry the claim.
5. **Put the leftovers somewhere real.** Related work the branch did not do goes to a dated `.local/Analysis/` note, not a "not in this PR" paragraph nobody actions.

## The shape

```markdown
# <Short title: sentence case, an imperative verb and the thing it acts on.>

## What this adds

<One or two plain sentences: what it is for.> **<What it deliberately does not do yet.>**

- **<A piece of the change.>** <What it does, with `Identifiers`, and any limit a reader would assume away.>
- **Docs.** <Where they live.>

## Tests

- `<TestProject/Folder>`: <what it covers>.
- `<NewProject>` (new): <what it covers>.
```

The **limit clause in the opener** is the part that earns its place: a branch landing a seam nothing calls, or a table nothing writes to, says so in its first three lines, and the reviewer stops hunting for a write path that is not there.

Nothing else. No What is wrong today, no Motivation, no Size section, no checklist, no acceptance-criteria mapping, no heading per module for one change repeated three times, and no attribution footer.

## Install

```
/plugin marketplace add warwickschroeder/repo-standards
/plugin install pr-body
```

## Use

```
/pr-body                   # work out base and topic
/pr-body master            # explicit base
/pr-body timeprovider      # explicit topic for the filename
```

Or just ask: *"write a PR body for this branch"*.

## What it creates in a target repo

| Path | Purpose |
| --- | --- |
| `.local/PRBodies/YYYY-MM-DD-pr-body-<topic>.md` | The draft, for the author to read before it goes near GitHub. |
| `.local/Analysis/YYYY-MM-DD-<topic>.md` | Related work the branch did not do, ranked and with the sites listed, written only when there is some. |

Nothing is pushed. The plugin does not run `gh pr create` or `gh pr edit` unless asked. A repo's own `.github/PULL_REQUEST_TEMPLATE.md` wins over this shape.

## House rules it follows

- Bold lead-ins are **claims, not labels**.
- **Cost over mechanism**: not "the validator omits the query terms" but "page 2 could carry page 1's version, so the client keeps the wrong rows".
- **Never claim a green test suite that was not run.**
- No em dashes, full-width prose, repo-relative paths, nothing confidential.
