# PR Body reference

Worked detail behind `SKILL.md`. Read the section you need.

## §1 Scoping from the diff

### Finding the real base

A branch is often stacked: it was cut from another branch that is itself still in review, so the PR's base is that branch and not the default one. Diffing against the default branch then produces a body that claims the parent PR's work, which is the single most misleading thing a body can do. The reviewer cannot tell which half of it they are being asked to approve, and the parent's reviewer sees the same work described twice.

```
gh pr list --state open --json number,title,headRefName,baseRefName
git log --oneline <default-branch>..HEAD
git branch -a --list '*<shared-prefix>*'
```

The tells, in order of reliability:

- **An open PR whose head branch is an ancestor of yours.** Decisive. `git merge-base --is-ancestor <their-branch> HEAD` confirms it.
- **The branch name ends in `-2`, `-part2`, `-followup`**, or shares a prefix with another branch that exists.
- **`git log <default>..HEAD` returns far more commits than the author described.** Two commits of work and ten in the log means eight belong to something else.

When it stacks, open the body with a one-line note naming the PR it sits on and saying to review against that branch. Then scope everything, the diff, the stat and the test reading, to that base.

### The commands

```
git log --oneline <base>..HEAD          # two dots: the commits on the branch
git diff --stat <base>...HEAD           # three dots: the change against the merge base
git diff <base>...HEAD -- <paths>       # read the production half in full
git status                              # uncommitted work that is also shipping
```

### Why three dots on the diff

`git diff A..HEAD` compares the two tips. If the branch is behind, every commit that landed on the base since the branch started shows up as a **reversal**, and a body written from it describes work the branch never did and undoing it claims it did.

`git diff A...HEAD` compares against the merge base, which is the change the branch actually introduces, and what the PR page shows. Always three dots for the diff. Two dots is correct for `git log`, where you do want the commits since the base.

### Splitting test from production

```
git diff --numstat <base>...HEAD | awk '{ if ($3 ~ /Test/) t+=$1+$2; else p+=$1+$2 } END { print "test", t, "prod", p }'
```

Adjust the pattern to the repo's naming. Read the production half in full. On a branch that is mostly tests, read those too: they carry the actual behavioural claims, and the `## Tests` bullets are written from them, not guessed.

### What the commit subjects are good for

Ordering and intent, nothing else. They tell you what the author thought they were doing, which is a useful hypothesis and a bad source. In practice they:

- **Over-claim.** "Standardise X across the codebase" when three of eleven sites moved.
- **Mis-attribute.** Name a component the change did not touch.
- **Omit.** The one-line fix that a reviewer most needs to see rarely gets its own commit.
- **Assert an unverified cause.** "Rather than relying on YARP" is a theory about where a registration came from. Open the file.

## §2 Verifying a claim before asserting it

Every claim in the body is one a reviewer can check in thirty seconds. Check it first.

| Claim shape | How to verify |
| --- | --- |
| "Nothing writes to it yet" | Grep for the type and every method on it. This is the opener's limit clause; getting it wrong is worse than omitting it. |
| "X overwrote Y" | Read the registration or call order. Confirm X runs after Y, with line numbers. |
| "This came from Z" | Grep for Z's registration. If several things could have supplied it, say the set, not one name. |
| "This is the only caller" | Grep for callers, including tests. |
| "This never worked" | Check the history, or soften to "does not work today". |
| "No existing caller changed" | Grep for callers of the member you added to, and say it only when the list is unchanged. |

**When verification narrows the claim, write the narrow one.** If a commit says the clock came from YARP, and reading the file shows telemetry, HTTP logging and YARP each register one and any of them could have won, the honest bullet names the set and says which won in the default configuration.

**When verification cannot settle it**, say what you know and stop. Never dress a hypothesis as a finding.

## §3 Worked bullets

### The opener carries the limit, in bold

```markdown
Bad:   Adds checkpoint storage for the migration engine.

Good:  Somewhere for the migration engine to keep its progress, so a copy that stops part way can be picked
       up rather than started again. **Nothing writes to it yet**: no persister implements `IMigrationTarget`,
       so the table is created empty and only the tests put rows in it.
```

The bad one invites a reviewer to go looking for the write path and file the branch as incomplete when they cannot find it. Two sentences of prose, and the limit in bold, is the whole opener.

### The bold lead-in carries the claim

```markdown
Bad:   - **Registration.** The clock is now registered in `AddServiceControl`.
Good:  - **The host never registered a clock.** One arrived anyway, from telemetry, HTTP logging or YARP, whichever was switched on.
```

The first makes the reviewer read the sentence to learn anything. The second is legible from the bold text alone.

### Say the cost, not the mechanism

```markdown
Bad:   - **Validator change.** The validator omits the query terms.
Good:  - **Page 2 could carry page 1's version.** The client is told nothing changed and keeps rows from the wrong page.
```

### Group a repeated change, do not repeat it

```markdown
Bad:   - **SQL Server.** The lifecycle store takes the clock.
       - **PostgreSQL.** The lifecycle store takes the clock.
       - **RavenDB.** `ExpirationManager` takes the clock.

Good:  - **Every persister stamps its timestamps from an injected clock.** On EF Core, so SQL Server and
         PostgreSQL, the lifecycle store does it across all five transitions; on RavenDB `ExpirationManager`
         computes `@expires` from it and the four archive managers take it.
```

### Explain a file whose folder does not explain it

```markdown
Good:  - **An embedded migration source waits for the server it started.** `EmbeddedDatabase.WaitUntilReady`
         wraps `GetServerUriAsync`, which is why a migration branch touches `src/ServiceControl.RavenDB`.
         `Start` only queues the server up, so connecting by the configured URL reached whatever already held
         the port. No existing caller of `EmbeddedDatabase` changed.
```

Without the reason, the reviewer reads it as scope creep and asks for it to be split out.

### Name the deliberate non-change with its reason

```markdown
Good:  - **Deliberately still on the machine clock.** `CheckRavenDBIndexLag` subtracts `LastIndexingTime`,
         which the server reports against its own clock, so an injected one would make the lag meaningless.
```

Without this the next reader files it as an oversight and "fixes" it.

### The Tests bullets say what is proved, per project

```markdown
Weak:   - `ServiceControl.Persistence.Tests`: new checkpoint tests.
Strong: - `ServiceControl.Persistence.Tests/EFCore` (new files): the table round-tripping every column, every
          timestamp coming back as UTC, and five transaction cases including a rollback leaving the previous
          cursor in place and a save from an out-of-date copy being refused. Runs on SQL Server and PostgreSQL.
```

One bullet per project or folder. Mark a new project `(new)` and say why it had to be separate, because that is the question a reviewer will ask.

## §4 What goes in the analysis note instead

A "not in this PR" paragraph is where good findings go to die. Write them as a dated note in `.local/Analysis/` and tell the user it exists.

The note earns its place by doing what the paragraph could not:

- **List the sites**, with file and line, grouped by seam rather than by file.
- **Rank them.** Which seam makes real behaviour verifiable, which only makes an assertion exact, which should deliberately stay as it is.
- **Say what each one buys.** "A fake clock here lets a test advance past the grace period and assert an endpoint flips to dead" is actionable. "Monitoring still uses UtcNow" is not.
- **Suggest an order**, so the follow-up is a task and not a survey.

Keep in the PR body only the deliberate non-changes **inside the branch's own scope**, the ones a reviewer of this diff will actively wonder about.
