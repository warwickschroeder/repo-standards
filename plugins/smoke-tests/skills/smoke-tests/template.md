<!--
Copy to <smoke-test-dir>/YYYY-MM-DD-<topic>-smoke-test.md. Delete this comment and every <placeholder>.

Full rules: the smoke-tests SKILL.md. The short version:

- Read the covering runbooks first. Reuse their controls, personas and wording; cite a case (`TC-DEL-S1`) instead of rewriting it.
- A case a tester should run forever goes in the runbook, not here. This file is only the delta.
- Short. A step is: title, action, Expect. No background, no "why this bug existed", no walls of text.
- Every step has an **Expect:** line.
- Full width — never hard-wrap prose. Code in a fenced block wraps however it reads best.
- Name controls and routes exactly as they exist — check, don't remember. No UI? Say so and give the curl/SQL.
- One app instance, one session. Simulate the rest out of band.
- Four sections. No Results table.
-->

# Smoke Test — <what changed, in plain words>

<Spec/plan link · Issue: #<NNN> · Scope: <the branch or PR — or, for a release, `<lasttag>..HEAD` and whether uncommitted work is included> · Runbooks: <link>>

## What changed

<Three or four short sentences. What the app does differently, and what someone would notice. Nothing visible? Say so, and say what it protects.>

**Risk: <low | medium | high | critical>** — <one sentence>

| | |
| --- | --- |
| Scope | <the areas/modules/services reached> |
| Migration | <"Yes — <what it does>, <when it runs>", or "No". Say whether it normalises existing rows before tightening; one that doesn't can fail on real data.> |
| Config | <new or changed settings a deployment must set — or "None"> |
| Runbooks | <the runbooks covering these surfaces; "unchanged" or the cases added. Include the command to run them.> |
| Watch out for | <the adjacent thing most likely to break — especially a contract change that breaks non-UI callers silently> |
| If it breaks | <how to get back; is the migration reversible?> |

## Before you start

- [ ] <how to run the app, and its URL>
- [ ] <how to sign in, and as whom>
- [ ] <database access, if a step reads a row>
- [ ] <curl or an API client, if a cap or path sits above what the UI allows>

<Anything the browser can't reach: a guard above the UI's own limit, a surface with no screen, a header set only a production build applies. Say it here, with the command.>

## Steps

<One step per thing you're proving. Title, action, Expect — nothing else. Cite a runbook case where one already walks the journey. If a migration can fail on existing data, it is step 1, with its pre-flight query.>

1. **<What this proves.>** <(follows `TC-…`) if a runbook case already covers the journey>
   <The action — exact control, route, field. Or the command.>
   **Expect:** <the one observable outcome that means it worked>

2. **<What this proves.>**
   <The action.>
   **Expect:** <the outcome>
   **Not testable by hand:** <only when true — what can't be reached manually, and what covers it instead>

   > *Runbook gap:* <only when the change leaves a permanent behaviour uncovered — which runbook, and what case to add>
