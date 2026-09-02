# PR Body reference

Worked detail behind `SKILL.md`. Read the section you need.

## §1 Scoping from the diff

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

Adjust the pattern to the repo's naming. Read the production half in full. On a branch that is mostly tests, read those too: they carry the actual behavioural claims, and the coverage section is written from them, not guessed.

### What the commit subjects are good for

Ordering and intent, nothing else. They tell you what the author thought they were doing, which is a useful hypothesis and a bad source. In practice they:

- **Over-claim.** "Standardise X across the codebase" when three of eleven sites moved.
- **Mis-attribute.** Name a component the change did not touch.
- **Omit.** The one-line fix that a reviewer most needs to see rarely gets its own commit.
- **Assert an unverified cause.** "Rather than relying on YARP" is a theory about where a registration came from. Open the file.

## §2 Verifying a claim before asserting it

Every "why it was broken" sentence in the body is a claim a reviewer can check in thirty seconds. Check it first.

| Claim shape | How to verify |
| --- | --- |
| "X overwrote Y" | Read the registration or call order. Confirm X runs after Y, with line numbers. |
| "This came from Z" | Grep for Z's registration. If several things could have supplied it, say the set, not one name. |
| "This was untestable" | Confirm there was no seam. A hard-to-reach seam is not the same as none. |
| "This is the only caller" | Grep for callers, including tests. |
| "This never worked" | Check the history, or soften to "does not work today". |

**When verification narrows the claim, write the narrow one.** If a commit says the clock came from YARP, and reading the file shows telemetry, HTTP logging and YARP each register one and any of them could have won, the honest bullet names the set and says which won in the default configuration. That is a better bullet anyway: it explains why the bug was invisible.

**When verification cannot settle it**, say what you know and stop. Never dress a hypothesis as a finding.

## §3 Worked bullets

### The bold lead-in carries the claim

```markdown
Bad:   - Registration. The clock is now registered in AddServiceControl.
Good:  - **The host never registered a clock.** One arrived anyway, from telemetry, HTTP logging or YARP, whichever was switched on.
```

The first makes the reviewer read the sentence to learn anything. The second is legible from the bold text alone.

### Say the cost, not the mechanism

```markdown
Bad:   - The validator omits the query terms.
Good:  - **Page 2 could carry page 1's version.** The client is told nothing changed and keeps rows from the wrong page.
```

### Group a repeated change, do not repeat it

```markdown
Bad:   ## RavenDB
       - ExpirationManager takes the clock.
       ## SQL Server
       - The lifecycle store takes the clock.
       ## PostgreSQL
       - The lifecycle store takes the clock.

Good:  - **Raven:** `ExpirationManager` computes `@expires` from it; the four archive managers take it, with `MessageArchiver` passing its own down.
       - **EF Core, so SQL Server and PostgreSQL:** the lifecycle store stamps both timestamps from it across all five transitions.
```

### Name the deliberate non-change with its reason

```markdown
Good:  - **Deliberately still on the machine clock:** `CheckRavenDBIndexLag` subtracts `LastIndexingTime`, which the server reports against its own clock, so an injected one would make the lag meaningless.
```

Without this the next reader files it as an oversight and "fixes" it.

### Connect a test to the defect it would have caught

```markdown
Weak:   - **Registration tests.** Two new acceptance tests.
Strong: - **Registration:** a host-registered clock survives `AddServiceControl`; a persistence-only host still resolves one. These catch the `AddSingleton` override.
```

### Explain a test-infrastructure constant that looks like a fudge

```markdown
Good:  - **365 day retention on SQL Server and PostgreSQL.** Advancing the clock wakes the live retention sweeper, which then deletes rows a test is still using. Retention now outruns any advance; tests that care set their own.
```

A reviewer who sees a 365 in a test context and no reason assumes someone was making a failure go away.

## §4 What goes in the analysis note instead

A "not in this PR" paragraph is where good findings go to die. Write them as a dated note in `.local/Analysis/` and tell the user it exists.

The note earns its place by doing what the paragraph could not:

- **List the sites**, with file and line, grouped by seam rather than by file.
- **Rank them.** Which seam makes real behaviour verifiable, which only makes an assertion exact, which should deliberately stay as it is.
- **Say what each one buys.** "A fake clock here lets a test advance past the grace period and assert an endpoint flips to dead" is actionable. "Monitoring still uses UtcNow" is not.
- **Suggest an order**, so the follow-up is a task and not a survey.

Keep in the PR body only the deliberate non-changes **inside the branch's own scope**, the ones a reviewer of this diff will actively wonder about.
