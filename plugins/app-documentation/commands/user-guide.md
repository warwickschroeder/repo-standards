---
description: Derive an end-user or operator guide from the app's part docs, verified against the real UI
argument-hint: "[user | operator | api | audit]"
---

Invoke the `app-documentation` skill and run its Phase 5 (Derive the guide).

Argument: `$ARGUMENTS`

- **empty or an audience** (`user`, `operator`, `api`, or any audience named in the profile) → write or refresh that guide at `<guides-dir>/<audience>-guide.md`.
- **`audit`** → check the guides against the code: every bolded control label still exists in the UI source, every role badge still matches the auth policy that gates it, every threshold and limit still matches its constant, and the capability coverage map still closes. Report before fixing.

The chain runs one way: **the part docs are authoritative for behaviour, thresholds and branches; the source is authoritative for what the button says.** Draft each workflow from `<docs-dir>/<part>.md`, then verify every label against the component source or the running app. Never quote a control from memory — a guide is judged on its first wrong button name.

Then:

- **Organise by workflow, never by part.** A user's job crosses parts; a chapter per module is the org chart, not the job.
- **One guide per audience, roles as badges within it.** Where roles are cumulative, document each task once under the lowest role that can do it — three copies of a shared workflow disagree within a month.
- **Derive badges from the auth gates in code**, not from what seems reasonable. Stale gates are the most common error in an old guide.
- **Cover the branches that surprise people** — the hold, the throttle, the rejection, the retention window, the guard that looks like a bug. Skip the field-by-field tour.
- **Close the capability coverage map** (`reference.md` §6): every capability in every part doc's *What it does* maps to a guide section or is marked `internal:<reason>`. An unmapped user-facing capability blocks completion — ask, never descope silently.

If a capability has no UI, say how it is really reached — a support request, an operator action, an API call — rather than inventing a screen for it.
