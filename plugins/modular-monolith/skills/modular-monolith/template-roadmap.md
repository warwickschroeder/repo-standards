<!--
Copy to docs/ROADMAP.md in the target repo and fill it in.

This file is the repo's STANDING DECISION REGISTER. Its job is to answer, for any future
agent or developer, two questions that the code cannot answer on its own:

  1. Which of the blueprint's rules bind here?  (§ Blueprint adoption)
  2. What did we already decide, and why?       (§ Stack decisions, § Deliberate deviations)

Delete the sections that do not apply — a heading whose body says "none" is pure maintenance
cost. The three sections that always earn their place are Blueprint adoption, Stack decisions,
and Open work.

Where a table row needs a paragraph of reasoning, put the paragraph under the table rather than
cramming it into a cell. The table is for scanning; the prose is for the "why" that stops the
decision being re-litigated in six months.
-->

# {{APP NAME}} — Roadmap

> **Last reviewed against the code: {{YYYY-MM-DD}}.** When an entry here and the code disagree, **the code wins and the entry is the bug** — fix it in the same change. Prefer naming a **symbol** over a `file.ext:line`: line citations rot silently.

## Status at a glance

<!-- The one table someone reads before anything else. Every row links to where it is detailed.
     If everything is shipped and nothing is open, say so in a sentence and delete the table. -->

| Open work | Tracked as | Detail |
| --- | --- | --- |
| {{what remains}} | {{#123, or "—"}} | [{{section}}](#{{anchor}}) |

---

## Blueprint adoption

<!-- THE REGISTER. This is what scopes the blueprint's rules to this repo.
     Areas and the rules each covers: plugins/modular-monolith/skills/modular-monolith/areas.md
     Every area gets a row. "Not listed" is not a state — an unlisted area reads as unknown,
     which is the one outcome this file exists to prevent. -->

**Reviewed {{YYYY-MM-DD}}.** Audit: [`docs/specs/{{YYYY-MM-DD}}-blueprint-alignment.md`]({{path}})

The blueprint is a **menu** for this repo, not a mandate. The rules that bind here are R1–R35 **as scoped by this table**. An **Adopted** area joins the Definition of Done for every change; a **Declined** area is a standing decision that must not be re-litigated, raised in review, or quietly "fixed" in passing.

| Area | Rules | State | Since | Note |
| --- | --- | --- | --- | --- |
| `testing` | R23, R24, R25, R32 | {{Adopted / Adopting / Deferred / Declined / N/A}} | {{YYYY-MM-DD}} | {{one line}} |
| `static-gates` | R33 | {{...}} | | |
| `ci-shape` | R34 | {{...}} | | |
| `code-quality` | R27, R29, R30 | {{...}} | | |
| `docs` | — | {{...}} | | |
| `deps` | — | {{...}} | | |
| `security` | R35 | {{...}} | | |
| `constrained-values` | R28 | {{...}} | | |
| `seams` | — | {{...}} | | |
| `queries-errors` | — | {{...}} | | |
| `no-poll` | R31 | {{...}} | | |
| `design-tokens` | R26 | {{...}} | | |
| `module-isolation` | R1, R2, R4, R5, R6, R20 | {{...}} | | |
| `data-isolation` | R7–R11 | {{...}} | | |
| `events` | R3, R12–R16 | {{...}} | | |
| `api-shape` | R17, R18, R19 | {{...}} | | |
| `push-channel` | R21, R22 | {{...}} | | |

### Adopted — what each one commits us to

<!-- One short block per adopted area, naming the concrete thing this repo does. This is where an
     adoption stops being a checkbox: "adopted static-gates" means nothing until someone can name
     the four commands. Cite the scripts, workflows and thresholds by path. -->

- **`{{area}}`** — {{what it concretely means here: the commands, the paths, the thresholds, the CI steps. Name them.}}

### Declined — standing decisions

<!-- The most valuable prose in this file. Each entry needs the REASON, because the next agent
     will find the deviation and want to fix it, and the reason is what stops them. -->

- **`{{area}}`** — declined {{YYYY-MM-DD}}. {{Why, in a sentence a stranger would find persuasive: what it would cost, what it would buy, and why the trade did not land here.}} A deviation from this area **is not a defect** — do not flag it in review.

### Adopting — transitional states

<!-- §16.3 allows an old and a new pattern to coexist mid-adoption, but only if the end state is
     written down. Without it, "Adopting" is indistinguishable from "drifted". -->

- **`{{area}}`** — started {{YYYY-MM-DD}}. **Now:** {{what is done}}. **End state:** {{what "finished" looks like}}. **Rule while transitional:** new code uses the new pattern; no new feature may use the old one.

### Deferred — revisit triggers

- **`{{area}}`** — deferred {{YYYY-MM-DD}}. **Revisit when:** {{the concrete trigger — a second team, a second deployable, the first realtime feature. A date is a weaker trigger than an event.}}

---

## Stack decisions

<!-- Blueprint §3. Every one of these must be confirmed with the user before the code that
     depends on it is written, and recorded here so no future agent has to guess or re-ask. -->

| Decision | Choice | Decided | Note |
| --- | --- | --- | --- |
| Persistence engine (§8) | {{e.g. PostgreSQL}} | {{YYYY-MM-DD}} | {{data-access layer; schema strategy}} |
| Authentication (§4.6) | {{e.g. Entra ID / OIDC}} | | {{what owns identity; how the user id is derived}} |
| Server language & framework | {{...}} | | |
| Client framework & styling | {{...}} | | |
| Realtime transport (§7.1) | {{... or "none — no realtime feature"}} | | |
| Local-dev orchestration (§9) | {{...}} | | |
| Test tooling (§12) | {{unit / integration / e2e runners}} | | |
| Root namespace / solution name | {{...}} | | |

---

## Deliberate deviations

<!-- DIFFERENT FROM A DECLINED AREA, and the distinction matters:
       - A declined area was never adopted.
       - A deliberate deviation is inside an ADOPTED area, where a requirement forces a specific
         difference from the blueprint.
     Both are standing decisions; only the second needs its scope pinned down, because the rest of
     the area still binds. -->

- **{{The deviation}}** ({{area}}, {{requirement or driver}}) — {{what we do instead, and the boundary: what still follows the rule.}}

---

## Optional practices (§17)

<!-- Offered once each, never assumed. A declined practice is a standing decision: do not produce
     its artifacts anyway because a change "felt significant". -->

| Practice | Answer | Since | Note |
| --- | --- | --- | --- |
| End-user & operator guides (`docs/guides/`) | {{Adopted / Declined}} | {{YYYY-MM-DD}} | {{who maintains them; the plugin, if used}} |
| Manual smoke tests (`docs/smoke-tests/`) | {{Adopted / Declined}} | | {{written only when asked — never unprompted}} |

---

## Work status

<!-- Two shapes. Keep the one that fits and delete the other.

     NEW APP: the phased build order (§14).
     EXISTING APP: adoption progress — the gap report plus the register above replaces a phase
     plan, because there is no "build order" for an app that already exists (§16.2). -->

### {{Phases — new app}}

- [ ] Phase {{N}} — {{name}}. {{What shipped, or what remains.}}

### {{Adoption progress — existing app}}

| Area | Landed | Change | Note |
| --- | --- | --- | --- |
| `{{area}}` | {{YYYY-MM-DD}} | {{PR / commit}} | {{what it took; anything left inside the area}} |

---

## Known defects

<!-- Defects deliberately not fixed yet, and the ones resolved. The resolved list is worth keeping:
     it is the fastest way for a future agent to check whether a symptom is a known old bug.
     Resolved entries can be trimmed once they stop earning their place. -->

### Open

- **{{Symptom}}** ({{tracked as}}) — {{root cause if known, why it is deferred, what the proper fix is}}.

### Resolved

- **{{Symptom}}** — fixed {{YYYY-MM-DD}}. {{Cause and fix, in a sentence.}}

---

## Open questions

<!-- Things nobody has decided yet, with the point at which the decision becomes blocking.
     A question with no "needed by" tends to sit here forever. -->

- **{{Question}}** — needed before {{the work it blocks}}. {{What is assumed meanwhile, if anything.}}
