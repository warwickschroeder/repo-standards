---
description: Write, refresh, or audit the technical documentation for an application's parts
argument-hint: "[<part> | all | audit]"
---

Invoke the `app-documentation` skill and follow its 6-phase workflow.

Argument: `$ARGUMENTS`

- **empty or `all`** → document every part. Run Phase 2 (Partition) first and write the index before any part doc, so the set of docs you owe is agreed before you start producing them.
- **a part name** → Phases 3–4 for that part only: discover from source, write or refresh `<docs-dir>/<part>.md`, and update the index row if what the part does has changed.
- **`audit`** → Phase 6 only. Run the mechanical gates in `reference.md` §8 (paths exist, constants still declared, routes match both directions, config keys still read, every part has a doc and vice versa, links resolve), then the judgement pass over any design section older than the code it describes. **Report the drift table before fixing anything**, and say plainly what you left unfixed.

Read `.claude/app-documentation/profile.md` first — create it from the skill's `template-profile.md` if it is absent, reusing `.claude/regression-runbooks/profile.md` and `.claude/smoke-tests/profile.md` where they exist rather than restating them.

Every route, status, constant, limit, config key and default is **read from source as you write it**. A doc that is 90% right is worse than no doc: the reader cannot tell which tenth is wrong. Delete template sections the part does not have rather than carrying a heading whose body says "not applicable", and state surprising absences once, in prose, under *Extending & gotchas*.
