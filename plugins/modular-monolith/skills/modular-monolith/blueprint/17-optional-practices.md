> **Modular Monolith Blueprint — §17.** [Index](README.md) · [Rules Digest](01-rules-digest.md)

## 17. Optional practices — offer them, don't assume them

Everything above is either **mandatory** (the Rules Digest) or a **stack choice** (§3). Two further practices sit deliberately outside both, because each produces documents a human then has to keep true, and whether that maintenance is worth paying is the user's call rather than the agent's. **An app that adopts neither is fully aligned.**

**Ask once per practice**, at the point noted below, state the cost as plainly as the benefit, and record the answer in `docs/ROADMAP.md` beside the §3 stack decisions. A declined practice is a **standing decision**: future agents must not re-litigate it, and must not produce its artifacts anyway because a change "felt significant".

| Practice | Offer when | What it buys | What it costs | Plugin |
|---|---|---|---|---|
| **§17.1 End-user & operator guides** (`docs/guides/`) | the first user-facing slice ships (Phase 4), and again whenever a new audience appears (an operator console, a public API) | Something to hand a customer, an operator, or a new joiner on the business side. Also a forcing function: a capability nobody can describe in a guide is usually a capability nobody designed. | Guides join the same currency rule as the module docs — roles, workflows or screens change, the guide changes in the same commit. Screenshots go stale on any visual redesign. | [`app-documentation`](../../../../app-documentation/) |
| **§17.2 Manual smoke tests** (`docs/smoke-tests/`) | the first release is being planned, or the first time a change lands that only a human on a real environment can prove | A short hand-run script that targets **only what changed** — the one lane that reaches what the automated suite structurally cannot (real auth on a second environment, a real third-party, a migration against real data). | A person's time per release, and a standing temptation to let it stand in for the regression net. The files themselves are disposable, not maintained. | [`smoke-tests`](../../../../smoke-tests/) |

> **The plugins are optional separately from the practices.** Both practices are plain Markdown conventions that need no tooling; a plugin scaffolds and maintains them where one is available. Conversely, `app-documentation` earns its place even when guides are declined — it also automates the **mandatory** per-module docs (§2, §13.1) and audits them for drift against the code.

### 17.1 End-user & operator guides (`docs/guides/`)

Per-module docs are **mandatory** and explain how the software is **built**. Guides are optional and explain how a person **uses** it. They are different documents for different readers, and the second is derived from the first.

**The chain runs one way: guides are drafted from the module docs and verified against the running UI.** A guide written straight from the screens documents what a button is called; a guide written from the module docs documents why the button is there, what it costs, and what happens next — because the module doc already established the thresholds, the state machine and the failure branches. The reverse pressure matters as much: a capability that cannot be described in the guide *because no module doc explains it* is a hole in the module docs, not a gap in the guide.

Where the practice is adopted, these hold:

- **One guide per audience, not per role.** The people who do the work, the operators who run the platform, the developers who call the API. Roles within an audience become **badges** (`**[Reviewer+]**` = Reviewer and every role above), and where roles are cumulative a task is documented **once**, under the lowest role that can do it. Three copies of a shared workflow disagree within a month.
- **Badges derive from the auth policies in code** (R-digest "Security", §13.4) — never from what seems reasonable. A stale gate is the most common error in an old guide, because policies get tightened in security passes that touch no feature.
- **Organised by workflow, never by module.** A user's job crosses modules; a chapter per module is the org chart, not the job. This is the one place the module boundary that governs everything else in this blueprint must be invisible.
- **Real labels, quoted from source, never recalled.** A guide is judged on its first wrong button name.
- **Cover the branches that surprise people** — the held submission, the throttle, the retention window, the guard that looks like a bug — and skip the field-by-field tour, which is what the module docs are for.
- **Diagrams and screenshot placeholders.** Mermaid for the lifecycle, the role hierarchy and the decision flows; keyed screenshot placeholders (`> 📸 **Screenshot \`key\`:** what to capture`) plus an index of keys, so capture can happen later and a missing image is visible rather than silent.
- **Currency is the real cost.** Roles, workflows or screens change → the guide changes in the same commit, exactly like `docs/modules/<module>.md`. Adopting this practice without accepting that rule produces a guide that is worse than none.

Optionally, the Markdown can be published to **Word/PDF** — a mermaid renderer plus Pandoc with a branded reference document, with the Markdown remaining the single source of truth. Offer it separately; it is a second toolchain to keep working.

What it adds to the tree:

```
docs/
  guides/README.md                  # who each guide is for + the badge legend
  guides/<audience>-guide.md        # e.g. user-guide.md, operator-guide.md
  guides/screenshots/README.md      # every screenshot key and what to capture
.claude/app-documentation/profile.md   # what a "part" is here, where docs live, the role model
```

### 17.2 Manual smoke tests (`docs/smoke-tests/`)

A smoke test is a **short, plain-language script a human runs by hand** to prove a change works in the running app. It is the **delta**; the regression runbooks (§12.9) are the standing coverage. Two shapes: one **change** (`YYYY-MM-DD-<topic>-smoke-test.md`, written with the implementation), or one **release** (`YYYY-MM-DD-release-since-<tag>-smoke-test.md`, written before the tag is cut, scoped from `git diff <lasttag>..HEAD`).

**This is not the superseded per-change checklist** (§13.1). That rule made a hand-run markdown checklist a *requirement* of every significant change, standing in for executable coverage; it was rightly dropped. What is on offer here is the opposite: written **only when asked**, scoped from the diff rather than from a template, and explicitly **not** a substitute for the tests a change already owes (R23/R24) or for the module's runbook. Where the two overlap, the smoke test **copies the runbook case's click path in** rather than telling the tester to go and run it — every redirection is a place the run stalls.

The rules that make it worth doing:

- **Never write one unprompted.** Unlike tests and module docs, a smoke test is never implied by a change, however significant — not by auth, not by a migration, not by touching five modules. If a change looks like it warrants one, **say so and let the user decide.** This is the single most common way to get the practice wrong.
- **Scope from the diff, not from commit subjects** — and say plainly when the diff is test-only or docs-only, because "there is nothing for a tester to observe" is a finding, not an omission.
- **Every step has a stated pass condition.** Title, action, `**Expect:**`. A step whose expectation is "it works" is not a test.
- **A migration that can fail on existing data is step 1, always.** Where migrations run at host startup (R10), a bad one is not a degraded feature — it is a container that will not boot, so it is pre-flighted with a query before anything else is attempted.
- **Be honest about what a hand-run cannot prove** — a race needing real concurrency, a truncation needing hundreds of rows. Name it, name what covers it, and move on; silently omitting it reads as "covered".
- **Permanent behaviour belongs in the runbook.** Where a smoke test exposes a journey a tester should run *forever* rather than once, that is a runbook gap (§12.9) and ships as a case plus its 1:1 spec.

What it adds to the tree:

```
docs/smoke-tests/YYYY-MM-DD-<topic>-smoke-test.md   # dated, disposable once run
.claude/smoke-tests/profile.md                      # how the app runs, how to sign in, reach the DB/API, tag a release
```

---

*This blueprint is the architecture contract; the committed Claude Design
handoff bundle (§11) is the design contract. When a decision isn't covered by
either, ask before inventing — and when you extend the architecture, update this
document so it stays the single source of truth.*
