<!--
Copy to .claude/modular-monolith/profile.md in the target repo and fill it in. Once per repo,
then reused; re-validate when the stack, the layout or the gate commands change.

WHAT THIS FILE IS FOR — and what it deliberately is not.

It holds the repo MECHANICS: where things live, what this repo's idiom is for each blueprint
concept, and the exact commands that run the gates. It does NOT hold the adoption decisions.
Those live in docs/ROADMAP.md, and duplicating them here guarantees the two copies disagree
within a month — at which point an agent has no way to tell which is current.

So: this file points at the register. It never restates it.

If .claude/regression-runbooks/profile.md, .claude/smoke-tests/profile.md or
.claude/app-documentation/profile.md exist, read them first — they already carry the personas,
the route inventory, how to sign in, and the repo's gotchas. Link to them rather than copying.
-->

# Modular Monolith Profile — {{repo}}

**Adoption register:** {{`docs/ROADMAP.md` § "Blueprint adoption" — or wherever it actually lives}}
**Latest audit:** {{`docs/specs/YYYY-MM-DD-blueprint-alignment.md`, or "none yet"}}
**Sibling profiles:** {{paths to the regression-runbooks / smoke-tests / app-documentation profiles, or "none"}}

## 1. Blueprint concept → this repo's idiom

<!-- The blueprint is stack-agnostic; every rule is written against a concept, and this table is
     how those concepts land here. Fill it for the areas the repo has adopted; write "n/a — area
     not adopted" for the rest rather than inventing a mapping nobody uses.

     This is the table that stops an agent applying a rule in the reference stack's shape (a
     .NET DbContext, an IModule) to a repo that has never seen one. -->

| Blueprint concept | Here it is | Where |
| --- | --- | --- |
| A **module** | {{e.g. a Django app / an npm workspace package / a .NET class library / "no module seam — feature folders"}} | {{path pattern}} |
| The **shared kernel** (`Core`) | {{...}} | {{path}} |
| The **composition root** (Host) | {{...}} | {{path}} |
| A **data-access context** | {{e.g. a DbContext / a repository package / a Prisma client}} | {{path}} |
| **Logical isolation** per module | {{e.g. a Postgres schema / a table prefix / "none — shared tables"}} | |
| **Migrations** | {{the tool, and whether each module owns its own}} | {{path}} |
| The **event bus** | {{... or "none — direct calls"}} | {{path}} |
| **Endpoints** | {{the routing style, and the URL convention}} | {{path pattern}} |
| **Realtime push** | {{the transport, and which module owns it — or "none"}} | {{path}} |
| The **design-token home** | {{the single file, if adopted}} | {{path}} |

## 2. Where things live

| | |
| --- | --- |
| Module / feature source | {{path pattern}} |
| Test projects | {{path pattern, and the unit / integration / e2e split}} |
| Module docs | {{e.g. `docs/modules/<module>.md`, or "none"}} |
| Spec docs | {{e.g. `docs/specs/`}} |
| Regression runbooks | {{path, or "none"}} |
| CI workflows | {{path}} |
| Agent instructions | {{`CLAUDE.md` — and note which rules it claims to distil, so drift is visible}} |

## 3. The canonical commands

<!-- R25 requires running AND READING these before claiming a change is done, and R33 requires each
     static gate to be runnable locally with one command. Write the exact command, not a
     description of it — "the lint script" is not something an agent can run.

     Leave a row blank rather than guessing. A wrong command here costs more than a missing one:
     an agent will run it, see it pass, and report a gate as green that never executed. -->

| Gate | Server | Client |
| --- | --- | --- |
| Lint | `{{...}}` | `{{...}}` |
| Build / type-check | `{{...}}` | `{{...}}` |
| Unit tests | `{{...}}` | `{{...}}` |
| Integration tests | `{{...}}` | `{{...}}` |
| Duplication | `{{...}}` | `{{...}}` |
| Dead code | `{{...}}` | `{{...}}` |
| Dependency vulnerabilities | `{{...}}` | `{{...}}` |
| Coverage floors | `{{... and the current thresholds}}` | `{{...}}` |

**Targeted per-module run** (R25 — the modules a change touched): `{{how to select one module's integration tests + its e2e targeted tier}}`

**Full e2e harness** (excluded from CI per R34): `{{command}}` — run {{when: pre-release, pre-merge of a release}}

## 4. Prerequisites to run any of it

| | |
| --- | --- |
| Container runtime | {{needed for the real-engine integration tests (R32)}} |
| Database | {{how it comes up locally}} |
| Secrets / config | {{where they come from in dev — never the repo (R35a)}} |
| Shell | {{PowerShell / bash — commands above are written for this shell}} |

## 5. Repo-specific gotchas

<!-- The things that cost the last person an hour. Anything an agent would get wrong on its first
     attempt and only discover from a confusing failure. -->

- {{e.g. "integration tests need Docker running or they fail with a misleading timeout"}}
- {{e.g. "the build must run before the client type-check — generated types"}}
- {{e.g. "CI is the compile gate; there is no local SDK on the usual dev machines"}}
