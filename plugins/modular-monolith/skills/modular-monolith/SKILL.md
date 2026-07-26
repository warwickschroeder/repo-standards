---
name: modular-monolith
description: Use when working in a repo that follows all or part of the modular-monolith blueprint — checking whether a change respects the rules that actually bind there, auditing an existing codebase against the blueprint, or recording which areas the repo has adopted, declined or deferred in docs/ROADMAP.md. Trigger this whenever the user mentions the blueprint, modular monolith architecture, module isolation, schema-per-module, events and read models, the R-numbered rules (R1–R35), blueprint alignment or adoption — or asks whether a change is allowed, conforms to the repo's standards, or should be flagged in review. Trigger it before flagging any architecture deviation, because a deviation from an area this repo declined is not a defect and must never be "fixed" in passing.
---

# Modular Monolith Blueprint

## Overview

The blueprint (`blueprint/`) specifies a modular monolith: one host process, many isolated modules, one shared database with a schema per module, one web client. Modules never call each other — they publish events and each consumer keeps its own local read model.

**For a new app the blueprint is a mandate. For an existing app it is a menu.** That distinction is the whole reason this skill exists. §16 is explicit that the value of some parts (the testing strategy, the static gates) can be had without touching the architecture at all, while others (module isolation, events) are multi-week re-architecture projects — and **which parts are worth it is the user's decision, made per area, never the agent's.**

So the rules an agent must obey in any given repo are not R1–R35. They are **R1–R35 as scoped by that repo's adoption register**. Finding out what that scope is comes before doing the work, not after.

| File | What it holds | Read it when |
| --- | --- | --- |
| [`blueprint/README.md`](blueprint/README.md) | The full blueprint, one file per section, with a read-when index | You need any section's detail |
| [`blueprint/01-rules-digest.md`](blueprint/01-rules-digest.md) | R1–R35 verbatim — the contract | Before judging any change against the rules |
| [`areas.md`](areas.md) | The 17 adoption areas: which rules each covers, what "adopted" means, how to audit it | Auditing, recording decisions, or resolving "does R*n* bind here?" |
| [`alignment.md`](alignment.md) | The audit → pick → align process in operational detail | Running `/blueprint-align` |
| [`template-roadmap.md`](template-roadmap.md) | The register, plus the surrounding ROADMAP | Creating or restructuring `docs/ROADMAP.md` |
| [`template-gap-report.md`](template-gap-report.md) | The audit deliverable | Writing the gap report |
| [`template-profile.md`](template-profile.md) | Repo mechanics: stack idiom mapping, gate commands, where things live | Once per repo, then reused |

## The register is the contract

Every repo that follows any part of this blueprint keeps an **adoption register** — a table in `docs/ROADMAP.md` under a *Blueprint alignment* heading, one row per area, recording one of five states:

| State | What it means for your change |
| --- | --- |
| **Adopted** | Binding. Part of the Definition of Done for every change, exactly like a rule in a greenfield app. |
| **Adopting** | Transitional. New code uses the new pattern; existing code may still use the old one until the recorded end state is reached. Never let a *new* feature use the old pattern. |
| **Deferred** | Not binding. A revisit trigger is recorded. Deviations are not defects — don't flag them. |
| **Declined** | Not binding, permanently. A **standing decision**: do not re-litigate it, do not raise it in review, and do not quietly fix a deviation because it looked wrong. |
| **N/A** | The area does not apply to this repo's shape (e.g. `push-channel` in an app with no realtime feature). |

The distinction that carries the most weight in practice is **Declined vs. Adopted**, because the failure it prevents is invisible: an agent that finds a cross-module call in a repo which declined `module-isolation` and "helpfully" refactors it has broken a decision the user made deliberately, and has done it in a commit that looks like an improvement.

### Reading the register

Read the *Blueprint alignment* section of `docs/ROADMAP.md` — not the whole file, which is usually long. If `.claude/modular-monolith/profile.md` exists it names the exact location.

### When there is no register

**Do not guess, and do not default to "everything binds."** A repo with no register is in an unknown state, and both possible assumptions cause harm: assume everything binds and you flag deviations the user never signed up for; assume nothing binds and you let real regressions through.

Say so plainly and offer the audit:

> This repo has no blueprint adoption register, so I can't tell which of the blueprint's rules are meant to bind here. I can run the alignment audit (`/blueprint-align`) — it reads the codebase and produces a gap report without changing anything, then you pick per area. Or tell me which areas apply and I'll record them.

Then do the work the user actually asked for, applying ordinary good judgement rather than blueprint rules. Being unable to cite the register is not a reason to stop.

## The three jobs

| The user wants | Do this | Command |
| --- | --- | --- |
| To know whether a change is allowed / conforms | [Check against the adopted areas](#job-1--checking-a-change) | `/blueprint-check` |
| To find out where the repo stands against the blueprint | [Audit, then let them pick](#job-2--aligning-a-repo) | `/blueprint-align` |
| To write down what was decided | [Create or refresh the register](#job-3--recording-the-register) | `/blueprint-roadmap` |

---

## Job 1 — Checking a change

The most common job, and the one where the scoping matters most.

1. **Read the register first.** Which areas are Adopted or Adopting? Those are the rules in play. Everything else is out of scope for this review — including rules you can see are being broken.
2. **Read [`blueprint/01-rules-digest.md`](blueprint/01-rules-digest.md)** for the rules the adopted areas cover ([`areas.md`](areas.md) maps area → rules), and the relevant blueprint section for anything you need to judge precisely.
3. **Judge the change against those rules only.**
4. **Report findings with their rule and area.** "R24 (`testing`, adopted): the migration adds `RetryCount` but no integration test reads it back" is actionable. "This needs more tests" is not.
5. **For a deviation in a non-adopted area:** stay silent in the review. If it is genuinely serious — a security hole, a data-loss path — raise it **as itself**, on its own merits, not as a blueprint violation. `security` being declined does not make a leaked credential acceptable; it just means you argue the credential, not the rule number.

**Definition of Done** for an adopted repo is [`blueprint/15-definition-of-done.md`](blueprint/15-definition-of-done.md), filtered the same way.

### The trap

The pull toward completeness is strong: you have read the rules, you can see six violations, listing all six feels like doing the job well. It is the opposite. A review that mixes binding findings with deviations from areas the user explicitly declined trains them to skim your reviews, and the one finding that mattered gets skimmed with the rest. **Cite the register state next to each finding** — it forces the filter and shows your work.

---

## Job 2 — Aligning a repo

Full process in [`alignment.md`](alignment.md). The shape, and the three hard rules that govern it:

- **Audit first, change nothing.** The first deliverable is a gap report, not a refactor. Deviations found along the way are recorded, not fixed — even trivial ones, because a "while I was in there" fix inside an un-adopted area is precisely the harm the register exists to prevent.
- **Adopt only what the user picked**, per area, with a recommendation — never as a bundle, never as a yes/no on "the blueprint".
- **The stack is never an alignment target.** The blueprint is stack-agnostic (§3). "Align" never means migrating to the reference stack (C#/React); it means mapping blueprint concepts onto whatever idioms this repo already has — its module notion, its migrations tool, its test runner. An audit that recommends a rewrite in a different language has misunderstood the job.

**Step 1 — Audit.** Review against the Rules Digest and the structural expectations (§2 layout, §12 tests, §12.10 gates, §13 conventions), one row per area, using the *Audit by* guidance in [`areas.md`](areas.md). Write the gap report to `docs/specs/<date>-blueprint-alignment.md` from [`template-gap-report.md`](template-gap-report.md). **Record, don't judge** — "no integration tests; unit tests use an in-memory DB substitute (R32 gap)" rather than "the tests are bad". Note the areas that already align: adopted-by-accident costs nothing to formalise and anchors the rest.

**Step 2 — The user picks.** Present grouped by blast radius, cheapest tier first, with a recommendation per area. Then offer the two §17 optional practices **separately** — they are not alignment areas, and an app that declines both is fully aligned.

**Step 3 — Align incrementally.** One area at a time in dependency order (the *Depends on* column in [`areas.md`](areas.md)): testing before anything needing its safety net, static gates early with a baseline that only burns down, architectural areas last and strangler-style — build the new seam, move one consumer, verify, repeat. Every alignment change is a normal change: it ships tests, docs, and gate-green proof.

**Partial alignment is a stable end state, not a failure.** An app that adopts only the testing strategy and the static gates is aligned — to exactly what its user chose. Nothing in a later review should treat it as half-finished.

---

## Job 3 — Recording the register

The register is only worth what its currency is worth. Write it from [`template-roadmap.md`](template-roadmap.md) into `docs/ROADMAP.md`, and keep it true:

- **Every adoption decision lands in the register in the same change that makes it.** A decision agreed in conversation and not written down does not survive the session.
- **When an area finishes adopting, move it from Adopting to Adopted** and record the date. A register full of stale *Adopting* rows tells the next agent nothing.
- **Record the why, especially for Declined.** "Declined — the app is one deployable with three teams on it; module extraction was costed at six weeks against no delivery pressure" survives a change of mind far better than "Declined". The next agent will find the deviation and want to fix it; the sentence is what stops them.
- **Transitional states get an end state**, not just a status. "Adopting — Upload and Approvals extracted; five modules still coupled; end state is all seven behind the event bus."

Record the **stack decisions** (§3) in the same file — persistence engine, auth mechanism, client framework, and the rest. They are the other half of what a future agent needs and has no way to infer safely.

### Point the repo's CLAUDE.md at the register

A register nobody loads changes nothing. This skill triggers on the description, and the commands are explicit, but the file guaranteed to be in context every session is the repo's own `CLAUDE.md` — so that is where the pointer belongs. Three lines are enough:

> This repo follows the modular-monolith blueprint **selectively**. Which areas bind is recorded in `docs/ROADMAP.md` § *Blueprint adoption* — read it before enforcing a rule or flagging a deviation. A deviation from a **declined** area is not a defect: don't raise it in review, and don't fix it in passing.

Add it when you first write the register, and keep it accurate — a CLAUDE.md that claims rules the repo does not enforce is worse than one that says nothing, because agents trust it. (That currency requirement is part of the `docs` area.)

---

## Why this skill exists — the failure modes it prevents

Worth keeping in mind, because each of these looks like good work while it happens:

| Failure | What it looks like | What the register does |
| --- | --- | --- |
| **Drive-by fixing** | Refactoring a cross-module call found while doing something else | Declined areas are off-limits, permanently |
| **Re-litigating** | "Have you considered extracting these into modules?" — for the fourth time | A standing decision with its reasoning attached |
| **Audit creep** | The audit starts fixing things it finds | Audit first, change nothing |
| **Bundle framing** | "Should we align to the blueprint?" — a question with no good answer | Per-area choice with a recommendation |
| **Stack migration** | An audit that recommends rewriting a Python app in C# | The stack is never an alignment target |
| **Phantom enforcement** | Blocking a PR on R24 in a repo that never adopted `testing` | Findings cite their area's state |
| **Silent staleness** | The register says Adopting; it finished eight months ago | Currency is part of the adopted `docs` area |

The through-line: **the blueprint's authority in an existing repo is delegated by the user, one area at a time, and the register is where that delegation is written down.** An agent that treats the blueprint as self-authorising will do damage in exactly the repos that were most careful about what they signed up for.
