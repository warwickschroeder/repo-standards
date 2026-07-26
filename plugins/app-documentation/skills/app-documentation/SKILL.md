---
name: app-documentation
description: Use when documenting how an application works — writing or refreshing a technical reference doc per part of the system (what it does, its data model, API, events, configuration, gotchas), deriving end-user or operator guides from those docs, or auditing existing docs for drift against the code. Trigger this whenever the user asks to document an app or a module, explain in writing how a system works, onboard someone new to a codebase, write a user guide / operator manual / admin handbook, or check whether the docs still match the code — including when they describe the job without using the word "documentation" ("someone new needs to understand this", "write up how the approvals thing works", "we need something to hand to customers").
---

# App Documentation

## Overview

Two deliverables, one chain.

| Deliverable | Answers | Written for | Default home |
| --- | --- | --- | --- |
| **Part docs** — one per part of the system | *How does this work?* | a technical person who has never seen the codebase | `docs/modules/<part>.md` |
| **Guides** — one per audience | *How do I use it?* | whoever actually uses the thing | `docs/guides/<audience>-guide.md` |

The chain runs one way: **part docs are written from the source; guides are written from the part docs and verified against the real UI.** That ordering is the whole method. A guide written straight from the screens documents what a button is called; a guide written from the part docs documents *why the button is there, what it costs, and what happens next* — because the part doc already worked out the thresholds, the state machine and the failure branches.

The reverse pressure matters as much. A capability you cannot describe in the guide because no part doc explains it is a **hole in the part docs**, not a gap in the guide. Phase 5 makes that explicit rather than letting it pass.

Both deliverables are **Diátaxis**: a part doc is *Explanation + Reference*, a guide is *How-to*. Neither is a tutorial and neither is a generated API dump. If a tool can emit it, don't hand-write it — hand-write what the tool cannot: intent, design decisions, invariants, and the traps.

## When to use

- Asked to document an application, a module, a service, or "how this works" for someone new.
- Asked for a user guide, operator guide, admin manual, or customer-facing handbook.
- A new part lands and needs its doc; an existing part changed and its doc must follow in the same change.
- Asked whether the docs still match the code (`/document-app audit`).

Unlike a smoke test, **documentation is part of "done"** — a change to a part updates that part's doc in the same change. Guides follow the same rule when roles, workflows or screens move.

## The 6-phase workflow

### Phase 1 — Profile (once per repo, then reused)

Fill `template-profile.md` and save it to `.claude/app-documentation/profile.md`. It records what the app is and who uses it, the shape of the codebase, where docs live, the audiences and role model, how to reach the running UI to verify labels, and the doc-publishing toolchain if there is one.

If `.claude/regression-runbooks/profile.md` or `.claude/smoke-tests/profile.md` already exist, **read them first** — they already carry the personas, the route inventory and the repo's gotchas. Link to them; don't restate them.

### Phase 2 — Partition (decide what "a part" is, then enumerate every one)

This is the decision the rest of the work hangs off, and it is the one that varies most between repos. A part is **the smallest thing that owns state and already has a name the team uses**.

| Codebase shape | A part is | The boundary you can see |
| --- | --- | --- |
| Modular monolith | a module | its own schema / DbContext / folder, referencing only the shared kernel |
| Microservices, or a repo of several services | a service | its own deployable and datastore |
| Layered / n-tier app with no module seam | a feature area (bounded context) | a cluster of tables plus the screens that write them |
| Monorepo | a package that ships independently; feature areas *inside* the large ones | `package.json` / `*.csproj` / `go.mod` |
| Library or SDK | a public surface area | an exported namespace consumers import |
| Frontend-only app | a feature area | a route group and the state it owns |

Two tests keep the partition honest: if two candidates can never change independently, they are **one** part; if a doc would have to explain two unrelated data models, it is **two**. Cross-cutting foundations (the shared kernel, auth, the platform host, the integration seams) get a doc of their own — they are what every other doc points at.

Write the **index** (`docs/modules/README.md`) before the first part doc. It lists every part, one line each, plus the *How the parts fit together* section that is the only place cross-part flows get narrated. The index is the contract for what Phase 4 owes.

### Phase 3 — Discover (per part, from source, never from memory)

Build the part's **ledger** — purpose and boundary, entry points, data model, constrained value sets and limits, events in and out, configuration, auth gates, background work, failure behaviour, user-facing surfaces, and the non-obvious invariants. Full schema and the sourcing order in `discovery.md`.

Fan out parallel `Explore` agents (or the repo's code-graph tools) for breadth, then read the files that matter yourself. Everything that will appear in the doc as a fact — a route, a status, a limit, a config key, a default — is **read at this point and cited to a file**, so Phase 4 is transcription rather than recall. This is the single largest failure mode of written-by-AI documentation: a doc that is 90% right is worse than no doc, because the reader cannot tell which 10%.

### Phase 4 — Write the part doc

From `template-part-doc.md`. Eight sections: *At a glance → What it does → How it works → Reference → Configuration → Extending & gotchas → Where to look in the code*, under a short audience/source header.

Two rules carry most of the value:

- **"What it does" is written so a guide writer can lift it.** Describe capabilities in observable terms — what a person or caller can make happen, with the branches (held, throttled, rejected, retried) named. This is the section Phase 5 reads.
- **"How it works" earns the doc its keep.** Anyone can list tables and endpoints. The Explanation half — why it is built this way, what invariant the guarded update protects, what happens when the third-party call fails, what an idempotent handler is defending against — is what a new developer cannot get from reading the code in an afternoon.

**Delete the sections the part does not have.** A part with no background worker gets no "Background work" heading; it does *not* get a heading whose body says "none". State genuine absences once, where they are surprising, in *Extending & gotchas* ("no background service here — the queue is drained by event handlers"). A template section apologising for itself in every file is pure maintenance cost.

### Phase 5 — Derive the guide

Guides are organised **by workflow, never by part** — a user's job crosses parts (upload → held → approved → download spans three modules), and a guide with a chapter per module is the org chart, not the job.

1. **Name the audiences.** One guide per *audience type*, not per role: the people who do the work, the operators who run the platform, the developers who call the API. Roles within an audience become **badges**, not separate guides.
2. **Where roles are cumulative, document each task once, under the lowest role that can do it** — `[Reviewer+]` means Reviewer and everything above. This is the difference between one maintainable guide and three drifting copies of the same workflow.
3. **Draft each workflow from the part docs**, then **verify every label against the running UI or the component source**. The part doc is authoritative for behaviour, thresholds and branches; the source is authoritative for what the button says. Never quote a control from memory.
4. **Cover the branches that surprise people** — the hold, the throttle, the rejection, the soft-delete window, the "you can't approve your own" guard. Skip the exhaustive field-by-field tour; that is what the part docs are for, and the guide should link to them rather than absorb them.
5. **Close the coverage map.** Every capability in every part doc's *What it does* maps to a guide section or is marked `internal:<reason>`. An unmapped user-facing capability blocks completion — see `reference.md` §6.

Diagrams and screenshot placeholders belong here more than in the part docs: `reference.md` §3 for what earns a diagram, §5 for the screenshot-key convention.

### Phase 6 — Currency (and self-improvement)

Docs rot silently, and a stale doc is trusted exactly as much as a fresh one until it burns someone. Run the mechanical gates first — every path the doc names exists, every constant it quotes is still declared, every route in its API table is still registered, every part has a doc and every doc has a part — then the judgement pass: does *How it works* still describe the current design, or the one from two refactors ago? Report drift as a table (**Doc says / Code says / Fix**) before changing anything, so the user sees the scale. Full procedure in `reference.md` §8.

Then classify what this run taught you. **Repo-specific** → the repo's `.claude/app-documentation/profile.md` gotcha log. **Generalizable** → `~/.claude/app-documentation/lessons.md` always, and the plugin's own `reference.md` §9 when the `repo-standards` checkout is on this machine. If nothing generalised, say so — silence is indistinguishable from skipping the phase.

## Non-negotiables

- **Grounded, never recalled.** Every route, status, constant, limit, config key, default and control label is read from source as it is written. Uncertainty is resolved by opening the file, not by hedging the sentence.
- **Say what is *not* there when the absence is surprising.** "There is no retry — a failed translation stays Failed until resubmitted" is one of the most useful sentences in a doc. A doc that simply omits it reads identically to one that never checked.
- **Explain the why, not only the what.** A Reference section with no Explanation is a schema dump with a nicer font. If a design choice would make a reader ask "why not the obvious way?", answer it.
- **Delete inapplicable template sections.** Never carry a heading whose body is "not applicable".
- **One part, one doc; one doc, one part.** No orphan docs, no undocumented part, and the index lists exactly what exists.
- **The guide never invents a screen** — if a capability has no UI, the guide says how it is actually reached (a support request, an API call, an operator action) or does not claim it.
- **Guides are for the reader they name.** No internal type names, table names, event names or class names in a user guide; the operator guide may use them where an operator genuinely sees them.
- **Update in the same change.** A change to a part updates its doc; a change to roles, workflows or screens updates the guides. Same commit, like tests.
- **Full width — never hard-wrap prose.** One line per paragraph, bullet, table row. Code inside fenced blocks wraps however it reads best.

## Quick reference

| Need | Where |
| --- | --- |
| Choosing the parts — worked examples, cross-cutting concerns, sizing | `reference.md` §1 |
| The part doc, section by section (what each must answer, good vs bad) | `reference.md` §2 |
| Diagrams — which kind, when one earns its place, keeping them true | `reference.md` §3 |
| The index doc + *How the parts fit together* | `reference.md` §4 |
| The guide — audiences, badges, voice, depth, screenshots | `reference.md` §5 |
| Capability coverage map (part doc → guide) | `reference.md` §6 |
| Publishing to Word / PDF (pandoc + mermaid + screenshot keys) | `reference.md` §7 |
| Auditing for drift — mechanical gates then judgement | `reference.md` §8 |
| Gotcha catalogue (accumulated lessons) | `reference.md` §9 |
| Self-improvement procedure (dual target, sidecar format) | `reference.md` §10 |
| Per-part discovery ledger + sourcing order | `discovery.md` |
| Blank part doc | `template-part-doc.md` |
| Blank guide | `template-user-guide.md` |
| Per-repo profile skeleton | `template-profile.md` |

## Common mistakes

- **Documenting from memory of the code you just read.** By the time you are writing section 4 you are recalling section 1. The ledger exists so the doc is transcribed, not remembered.
- **A part doc that is only Reference.** Tables of endpoints and columns, no explanation of the design — the reader finishes knowing the shape of the thing and nothing about how it behaves or why.
- **Partitioning by folder instead of by ownership.** Three folders that share one table are one part; one folder holding two unrelated data models is two.
- **A guide with a chapter per module.** The user does not know your modules and their job crosses them. Organise by what they are trying to do.
- **Duplicating a workflow under every role that can perform it.** Cumulative roles mean one badged section; three copies drift within a month.
- **Quoting a control label from memory** — "Submit" when the button says "Start translation". One wrong label and the reader stops trusting the file.
- **Carrying "not applicable" headings** so every doc in the repo apologises for the same absent feature.
- **Writing the guide first** because it is more fun, then discovering the thresholds and branches were guessed.
- **Leaving the index stale** — a part list that no longer matches `src/` is the first thing a new reader tests, and the first thing that tells them the docs cannot be trusted.
- **Silent drift after an audit** — finding six stale claims, fixing four, and not saying which two were left.
