# App Documentation — reference

Detail behind the SKILL.md workflow. Read the section you need; you rarely need all of it at once.

| § | Topic |
| --- | --- |
| [§1](#1--choosing-the-parts) | Choosing the parts |
| [§2](#2--the-part-doc-section-by-section) | The part doc, section by section |
| [§3](#3--diagrams) | Diagrams |
| [§4](#4--the-index-doc) | The index doc |
| [§5](#5--the-guide) | The guide |
| [§6](#6--the-capability-coverage-map) | The capability coverage map |
| [§7](#7--publishing-to-word--pdf) | Publishing to Word / PDF |
| [§8](#8--auditing-for-drift) | Auditing for drift |
| [§9](#9--gotcha-catalogue) | Gotcha catalogue |
| [§10](#10--self-improvement) | Self-improvement |

---

## 1 — Choosing the parts

A part is **the smallest thing that owns state and already has a name the team uses**. Both halves matter: "owns state" is what makes a boundary real, and "has a name" is what makes a doc findable. If the team says "the approvals thing", the doc is `approvals.md` — not `submission-review-subsystem.md`.

### Finding the seams

Look for the places the codebase already draws a line, in descending order of reliability:

1. **A datastore boundary** — its own schema, database, collection prefix or table cluster. The strongest signal there is; data ownership is the hardest boundary to violate accidentally.
2. **A deployment boundary** — its own service, container, package or lambda.
3. **A dependency rule the codebase enforces** — a module that may only reference the shared kernel, a package whose imports are linted.
4. **A team boundary** — who gets the PR review. Real, even when the code shows no seam.
5. **A route group plus the state behind it** — the fallback for a layered app with no seams at all.

If none of these produce a clean answer, the app has no internal structure to document and the partition is a judgement call. Make it by **user-visible capability** ("uploading and translating", "reviewing", "budget") and say in the index that the boundaries are documentation-only, not enforced by the code. That sentence saves the next reader from hunting for a module that does not exist.

### Cross-cutting parts get a doc too

The shared kernel, the host and its composition, auth, the integration seams, the platform's cross-cutting configuration. These are what every other doc points at, and leaving them undocumented forces every part doc to re-explain the event bus. One doc, referenced by all the others.

### Sizing

Rough, but reliable enough to act on:

- **Under ~80 lines** and you are padding: the part is a component of something else. Fold it into its parent's doc as a section.
- **Over ~600 lines** and it is two parts, or the Reference half wants a sub-file (`docs/modules/<part>-api.md`) with the explanation staying in the main doc.
- **A doc with no *Extending & gotchas* content** usually means Phase 3 stopped at the shape of the code and never got to its behaviour. Go back to `discovery.md` §12.

### Worked examples

| Repo | Parts | Why |
| --- | --- | --- |
| Modular monolith, seven modules, schema each | one doc per module, plus one for the shared kernel and one for the host | the enforced dependency rule *is* the boundary |
| Rails/Django monolith, one database, no modules | one doc per bounded context (billing, catalogue, fulfilment), boundaries stated as documentation-only | table clusters and the screens that write them |
| Repo of six microservices | one doc per service, plus one for the shared contracts package and one for the platform (gateway, auth, observability) | deployables |
| React SPA + thin BFF | one doc per feature area, one for the BFF, one for the design system | route groups + owned state |
| Published SDK | one doc per public namespace, one for auth/transport | what a consumer imports |

---

## 2 — The part doc, section by section

Template: `template-part-doc.md`. What each section must answer, and how it fails.

### Header block

Four lines: intended reader, Diátaxis type, source path, datastore or namespace owned. It exists so someone who opened the wrong file knows within two seconds.

### At a glance

One or two paragraphs. What this part is for, where it sits in the flow, **what it owns and what it deliberately does not**. A reader who stops here should be able to say what the part is responsible for and name the thing next to it.

> **Good:** "The Approvals module is the human gate in the translation pipeline. When a submission exceeds a size threshold, Translation holds it and fires an event; Approvals records it, shows it in the reviewer queue, and publishes the decision. All approval state is owned here; Translation owns the submission state and reacts to the decision events."
>
> **Bad:** "This module handles approvals. It contains entities, services and endpoints for the approval workflow." — true of any approvals module ever written, and tells the reader nothing they could not guess from the folder name.

### What it does (functionality)

Numbered capabilities in observable terms, with the branches named. This is the section the guide is derived from, so write it for someone thinking about outcomes rather than types. Include the surfaces where they exist — which screen, which tab, what the user can do from there — because that is what saves Phase 5 from re-deriving it.

A capability line that mentions no branch is usually incomplete: what happens when it fails, when the caller is not allowed, when the thing is already in that state?

### How it works (design)

The reason the doc exists. Sub-headings per mechanism. What belongs here:

- **The flow**, end to end, with the handoffs named — including who publishes and who consumes.
- **Why this design and not the obvious one.** A guarded atomic update instead of read-modify-write; a local read model instead of a query across the boundary; an idempotent handler because the bus retries. Say what each choice protects against — that sentence is invisible in the code and expensive to rediscover.
- **The state machine**, drawn (§3).
- **Concurrency and ordering**: what two simultaneous callers do, what a replayed message does, what an out-of-order arrival does.
- **Failure behaviour**: what a dead dependency does to a request in flight.

Anti-pattern: narrating the call stack. "The endpoint calls the service which calls the repository" is the code with worse formatting. Write the *decisions*, not the *sequence*.

### Reference

Tables, exhaustive, skimmable. Data model; constants and constrained sets; API or entry-point table with auth gate per row; events in and out; the notable types and what each is responsible for. Every row derived from a declaration.

The Reference half is where a doc goes stale fastest and where staleness is most detectable — which is exactly why §8's mechanical gates target it.

### Configuration

Every key: name, default, when it is required, what it changes, who reads it. Separate start-up config from runtime-adjustable settings — the second kind is an operator task and lands in the operator guide. If the part has no configuration, say so in one line; it is a genuinely useful fact.

### Extending & gotchas

What someone about to change this part needs to know before they start. The best entries are the ones that read like a warning from someone who has been burned:

- What adding a new value to a constrained set actually requires (constant, migration, contract, subscribers) — the full list, because the partial list is how half-migrations happen.
- The invariant that looks removable and is not.
- The idempotency and concurrency guards, and the race each closes.
- The surprising absences: no retry, no cache, no cascade delete, no background service.
- The boundary rule: what you must not do to share data with a neighbouring part.

### Where to look in the code

An annotated file tree — path plus a half-line saying what lives there. Include the files in *other* parts that this one's behaviour depends on; that cross-reference is what stops a reader concluding the flow ends at the publish call. This section is also the cheapest mechanical drift check in §8, so keep paths exact.

---

## 3 — Diagrams

A diagram earns its place when the relationship is **not linear** — a state machine, a fan-out, a decision tree, a hierarchy. A sequence of three steps is a sentence; drawing it is decoration that now needs maintaining.

| The thing | The diagram | Notes |
| --- | --- | --- |
| Status lifecycle | mermaid `stateDiagram-v2` | The single highest-value diagram in most apps, and it belongs in **both** the part doc and the guide. |
| Event fan-out across parts | ASCII tree in the part doc, mermaid `flowchart` in the guide | ASCII survives any renderer and diffs cleanly; the guide's build renders mermaid to an image. |
| Decision with two outcomes | mermaid `flowchart TD` with a diamond | Approve/reject, pass/fail. |
| Role hierarchy | mermaid `flowchart LR` | Guides only — it is the badge legend made visual. |
| Escalating thresholds | mermaid `flowchart LR` | 50% → 75% → 90% → throttle. |
| Request/response across services | mermaid `sequenceDiagram` | Only when the ordering is genuinely the point. |

**Keep them true.** A diagram is a claim like any other, and it is the claim least likely to be re-checked in an audit. When a status is added, the state diagram changes in the same edit as the status table — if the two disagree, readers believe the picture.

**Label edges with the cause, not the effect.** `PendingApproval --> Queued: Reviewer approves` tells the reader who does it; `PendingApproval --> Queued: status change` tells them nothing.

---

## 4 — The index doc

`docs/modules/README.md`. Three things, and it is the first file anyone opens:

1. **One line on what these docs are** and the common shape they follow, so a reader knows what to expect in each.
2. **The table of parts** — doc link, part name, and one sentence on what it covers. Written so someone can pick the right file without opening three.
3. **How the parts fit together** — the paragraph that says how they communicate, what the dependency rule is, and where the cross-part contracts are catalogued. This is the only place in the doc set where the whole system is described at once, and it is what makes the individual docs comprehensible.

Add the maintenance rule ("any change to a part updates its doc in the same change") and a **See also** pointing at the guides, with one line on the difference: *these explain how the software is built; the guides explain how a person uses it*. Cross-link the guides' index back the other way. Readers arrive at the wrong one constantly.

---

## 5 — The guide

Template: `template-user-guide.md`.

### One guide per audience, badges within it

| Audience | Guide | Contains |
| --- | --- | --- |
| People who do the work in their own organisation | `user-guide.md` | every workflow, badged by the lowest role that can do it |
| Operators who run the platform | `operator-guide.md` | operator-only controls; **links** to the user guide rather than repeating it |
| Developers who call the API | `api-guide.md` (or the generated reference plus a "getting started") | auth, the happy path, the error contract, limits |

Never split a guide by role when roles are cumulative — you get three files that share 80% of their content and disagree within a month.

### Badges

State the convention once, in a table near the top, then badge every section heading or task:

`**[Uploader+]**` = Uploader and every role above it. A task is documented **once**, under the lowest role that can perform it. Where a role's *view* of a shared screen differs (a reviewer sees the whole queue, an uploader sees only their own), that is one section with a sentence about the difference — not two sections.

Badges are derived from the **auth gate per entry point** in the ledger (`discovery.md` §3), not from what seems reasonable. A guide that badges a screen `[Administrator+]` when the policy says Reviewer sends people to support for access they already have.

### Voice and depth

Second person, present tense, imperative for steps. The app's **real labels in bold**, quoted exactly. No internal names: no table names, no event names, no class names, no HTTP status codes. Say "the app blocks it", not "returns 409 Conflict".

Depth is *concise how-tos that cover the branches that surprise people*, not a field-by-field tour. The tests for whether a branch belongs:

- Can it happen without the user doing anything wrong? (held for review, throttled, auto-detect) → document it.
- Does it look like a bug when it happens? (their own submission cannot be approved by them; a deleted document is restorable for a window) → document it, with the reason.
- Is it a validation message they will read once and understand? → skip it.

Where a limit exists, give the number and where it applies. "Large submissions are held" is folklore; "more than 100 files, or more than 100 MB combined across the batch — separate from the 40 MB per-file cap" is a fact someone can plan around. Ambiguous scope is worse than no number: say whether it is per file or per batch.

### Structure of a workflow section

Heading with badge → one sentence of what this achieves → numbered steps with real labels → what success looks like → the branches. Then, where it helps, a note block for the thing that trips people up.

### Screenshot placeholders

Guides need pictures; capture usually happens later. Leave a keyed placeholder wherever a screenshot would help, in one consistent form so a build can find them:

```markdown
> 📸 **Screenshot `library`:** the library with the search box, filters, sort, and a few rows showing status badges.
```

The key is the filename the image will have. Maintain `docs/guides/screenshots/README.md` listing every key and what to capture, grouped by guide — it doubles as the shot list for whoever takes them. A placeholder with no image renders as a visible "screenshot needed" note in the built document, which is the correct behaviour: missing art should be obvious, not invisible.

### What the guide must not do

- Invent a screen for a capability that has no UI. Say how it is really reached — a support request, an operator action, an API call — or leave it out.
- Promise behaviour the part doc does not support ("your files are deleted immediately" when it is a soft delete with a retention window).
- Re-document deployment, infrastructure or auth setup. Link to those runbooks; they change on a different clock.
- Hard-code the product's brand name when it is configured per deployment — refer to it generically and say so once.

---

## 6 — The capability coverage map

The gate that keeps the two deliverables honest, and the analogue of a test-coverage check.

Take every row of every part doc's *What it does* and map it to a destination:

| Capability | Part doc | Destination |
| --- | --- | --- |
| Upload documents and choose languages | translation | user guide → *Upload a document* |
| Hold a large submission for review | translation, approvals | user guide → *When a submission is held for review* |
| Project the held submission into a reviewer read model | approvals | `internal: no user-visible behaviour of its own` |
| Adjust the monthly budget | budget | operator guide → *Adjust the budget* |

Rules:

- An **unmapped user-facing capability blocks completion.** Either write the section or agree explicitly with the user that it is deferred — never descope silently.
- `internal:<reason>` is for capabilities with no user-observable effect. Projections, idempotency handling, health checks. The reason is required, because "internal" with no reason is where things get quietly dropped.
- A guide section with **no** capability behind it is the other failure: it was written from an assumption. Delete it or find its grounding.

Keep the map wherever the repo prefers — a section in the guides' README, or a scratch file. It is most useful as a one-off gate during Phase 5 and again during an audit, so it does not need to be a maintained artifact unless the team wants one.

---

## 7 — Publishing to Word / PDF

Markdown stays the single source of truth; the built document is a view of it. The whole toolchain is Pandoc plus a mermaid renderer, and the only per-repo asset is a branded reference document.

### Conventions the Markdown must follow to survive the build

- **An in-page `## Contents` list** for reading on the web, which the build **drops** in favour of a real generated table of contents.
- **Mermaid in fenced ```mermaid blocks** — rendered to PNG and inserted; nothing else in the file needs to change.
- **Screenshot placeholders in the one keyed form** shown in §5, so the build can substitute images and flag missing ones.
- **One `# H1`**, promoted to the document title.
- **Tables that are actually tables** — a hand-aligned ASCII table renders as a code block.

### The build

```bash
# per guide:
#   1. strip the in-page Contents, promote the H1 to title metadata
#   2. render each ```mermaid block to PNG (2x scale, capped at ~6in wide, aspect preserved)
#   3. substitute screenshot placeholders with images from screenshots/<key>.<ext>
pandoc guide.proc.md -o dist/guide.docx --reference-doc reference.docx --toc --toc-depth=3
```

Dependencies: Pandoc, Node with `@mermaid-js/mermaid-cli` (which pulls a headless Chromium — pass `--no-sandbox` via a puppeteer config for CI). Stamp a version onto the cover page from an environment variable so a released document says which release it describes.

### What the reference document must supply

A Word template carries the theme, fonts, heading colours, page layout, running header and footer, and the embedded logo — hand-edited in Word, because that is the only sane way to do branding. Pandoc additionally needs styles a hand-made template will not have: a **table header** style, a **block-quote/callout** style, and the **cover** styles used by the generated title page. Generate the Pandoc-ready template from the branded one with a script rather than maintaining two by hand, and commit both so anyone can rebuild.

Git-ignore `dist/`, `node_modules/` and the intermediate directory; commit the tooling and the generated reference document.

A worked implementation of exactly this pipeline lives in `docs/guides/build/` in the Forge.Translation repo — cover page assembly, mermaid sizing, screenshot substitution and the reference-doc generator.

---

## 8 — Auditing for drift

Run the cheap gates first, report before fixing, and never fix silently.

### Mechanical gates

Each one is a script or a grep, and each catches a whole class of staleness:

1. **Every path the doc names exists.** Extract paths from *Where to look in the code* and the header block; `test -e` each. Highest yield of the lot — renames are constant and invisible.
2. **Every constant the doc quotes is still declared** with that name. Grep the name in source; a miss is a rename or a deletion.
3. **Every value the doc quotes matches the declaration.** The expensive one, so target it at the values that hurt: limits, thresholds, retention windows, page sizes, defaults.
4. **Every route in the API table is still registered**, and every registered route in the part appears in the table. Both directions — a new undocumented endpoint is as much drift as a documented dead one.
5. **Every config key is still read** by something.
6. **Every part has a doc, every doc has a part, and the index lists exactly those.**
7. **Every link resolves** — inter-doc links and anchors especially, since heading edits break them silently.
8. **Guide labels still exist in the UI source.** Grep each bolded control label; a miss is either a renamed control or a label that was never verified.

### The judgement pass

Gates cannot see the failure that matters most: a *How it works* section that describes the previous design accurately and the current one not at all. For each part changed since the doc was last touched (`git log -1 --format=%cd -- docs/modules/<part>.md` against the part's source), read the doc's design section beside the code and ask whether a reader following it would end up somewhere real.

Pay attention to the things that change without ceremony: an added status, a new event subscriber, a guard added after an incident, a seam that grew a second implementation, a threshold tuned in production.

### Report before fixing

```markdown
| Doc | Doc says | Code says | Fix |
| --- | --- | --- | --- |
| search.md | reindex runs nightly | reindex is signal-driven, no schedule | rewrite *Background work* |
| core.md | (event contracts section absent) | four new contracts since | add rows to the catalogue |
```

Then fix, and say plainly what was left — an audit that reports six problems and quietly fixes four is worse than one that fixes none, because the reader now believes all six were handled.

---

## 9 — Gotcha catalogue

Accumulated lessons. Add to this section when a run teaches something that generalises beyond one repo (§10).

- **A doc that is 90% accurate is worse than no doc.** The reader cannot tell which tenth is wrong, so they verify everything — and then they stop reading. This is why "grounded, never recalled" is the first non-negotiable rather than a nicety.
- **"Not applicable" headings breed.** One template section kept as a placeholder becomes thirteen copies of the same apology, one per part, each re-read and re-skipped forever. State absences once, in prose, where they surprise.
- **The file tree is the fastest-rotting section and the cheapest to check.** Automate gate 1 before writing any other check.
- **Cumulative roles are what make a single guide possible.** The moment someone documents a shared workflow twice "for clarity", the copies begin to disagree, and the reader who finds the stale one has no way to know.
- **Label drift is silent and lethal to trust.** A guide is judged on its first wrong button name.
- **Auth gates are the fact most often stale in an old doc**, because policies get tightened in a security pass that touches no feature and updates no documentation. Re-derive badges from policy declarations in every audit.
- **A per-file limit and a per-batch limit will be confused** unless the guide says explicitly which is which, every time it mentions either.
- **Write the index before the first part doc.** It forces the partition decision into the open, where it can be argued about cheaply.
- **Tests are the best source for the *why*.** A guard with a cryptic name usually has a test whose name is the sentence the doc needs.
- **Cross-part behaviour has no natural home.** Each part's doc describes its half and the flow appears nowhere whole. Narrate it once in the index's *How the parts fit together*, and have each part doc point there rather than half-explaining it.

---

## 10 — Self-improvement

Phase 6, last step, every run. Classify each lesson; when in doubt, treat it as generalizable.

- **Repo-specific** → append to `.claude/app-documentation/profile.md` (§9, the gotcha log), dated.
- **Generalizable** → **two targets:**
  1. **Sidecar, always:** append to `~/.claude/app-documentation/lessons.md`, regardless of whether the plugin source is on this machine. This is the permanent record.
  2. **Plugin source, when reachable:** add the lesson to §9 above in the `repo-standards` checkout, and **bump `plugins/app-documentation/.claude-plugin/plugin.json` `version` in the same edit** — an installed copy is considered stale only by that version string, so an unbumped edit reaches no other machine. Patch for a wording fix or a new gotcha, minor for a new rule or template section, major for a change that invalidates docs already written to the old shape. Say plainly that the change is uncommitted and needs pushing; do not commit or push it unasked.
- **Nothing generalised?** Say so: "Skill reviewed, no generalizable lesson this run."

Sidecar entry format:

```markdown
### YYYY-MM-DD — Short title
What happened, in one or two sentences. What to do instead.
```
