# app-documentation plugin

Document how an application actually works — one grounded reference doc per part of the system, then end-user and operator guides derived from them and verified against the real UI.

Two deliverables, one chain:

| Deliverable | Answers | Written for | Default home |
| --- | --- | --- | --- |
| **Part docs** | *How does this work?* | a technical person who has never seen the codebase | `docs/modules/<part>.md` |
| **Guides** | *How do I use it?* | whoever actually uses the thing | `docs/guides/<audience>-guide.md` |

The chain runs one way: part docs are written from the source; guides are written from the part docs and verified against the real UI. That ordering is the method. A guide written straight from the screens documents what a button is called; a guide written from the part docs documents why the button is there, what it costs, and what happens next — because the part doc already worked out the thresholds, the state machine and the failure branches.

## What it does

A **6-phase workflow**:

1. **Profile (once per repo)** — what the app is, what a "part" is here, where docs live, the roles and the gates that define them, how to reach the running UI to verify labels, the publishing toolchain. Saved to `.claude/app-documentation/profile.md`. Reuses the `regression-runbooks` and `smoke-tests` profiles where they exist rather than duplicating them.
2. **Partition** — decide what a part is for *this* codebase (module, service, bounded context, package, feature area) and enumerate every one, including the cross-cutting foundations. The index is written first, as the contract for what is owed.
3. **Discover** — build each part's ledger from source: entry points and their auth gates, data model, constrained value sets and limits, events in and out, configuration, background work, failure behaviour, user-facing surfaces, invariants. Everything the doc will assert, extracted once, with a file beside it.
4. **Write the part doc** — *At a glance → What it does → How it works → Reference → Configuration → Extending & gotchas → Where to look in the code.* Sections the part does not have are deleted, not carried as "not applicable".
5. **Derive the guide** — by workflow, never by module; one guide per audience with cumulative roles as badges; every label verified against the source; the capability coverage map closed so nothing user-facing is silently dropped.
6. **Currency** — mechanical drift gates (paths, constants, routes both directions, config keys, index completeness, links, labels) then the judgement pass, reported as a drift table before anything is changed.

## Install

```
/plugin marketplace add warwickschroeder/repo-standards
/plugin install app-documentation
```

## Use

```
/document-app                  # partition, index, then a doc per part
/document-app <part>           # write or refresh one part's doc
/document-app audit            # drift report against the code, then fix
/user-guide                    # derive the user guide from the part docs
/user-guide operator           # the operator guide
/user-guide audit              # labels, badges, limits and coverage re-checked
```

Or just ask: *"document how this app works"*, *"someone new needs to understand the approvals thing"*, *"we need something to hand to customers"*, *"do the docs still match the code?"*

## What it creates in a target repo

| Path | Purpose |
| --- | --- |
| `.claude/app-documentation/profile.md` | Repo profile — what a part is here, where docs live, the role model, how to verify labels. Written once, updated on drift. |
| `docs/modules/README.md` | The index: every part, one line each, plus *How the parts fit together* — the only place cross-part flows are narrated whole. |
| `docs/modules/<part>.md` | One technical reference doc per part (Diátaxis Explanation + Reference). |
| `docs/guides/README.md` | Who each guide is for, and the badge legend. |
| `docs/guides/<audience>-guide.md` | The derived how-to guide, badged by role. |
| `docs/guides/screenshots/README.md` | Every screenshot key and what to capture — the shot list. |

Paths are defaults; all of them are set in the profile.

## The rules that matter most

- **Grounded, never recalled.** Every route, status, constant, limit, config key and control label is read from source as it is written. A doc that is 90% accurate is worse than no doc — the reader cannot tell which tenth is wrong, so they verify everything, and then they stop reading.
- **Explain the why, not only the what.** A Reference section with no Explanation is a schema dump with a nicer font. What a guard protects against, what a design choice bought, what breaks if it is removed — that is what a newcomer cannot get from reading the code in an afternoon.
- **Say what is *not* there.** "There is no retry — a failed item stays Failed until resubmitted" is one of the most useful sentences in a doc. Omitting it reads identically to never having checked.
- **Delete inapplicable template sections.** A heading whose body says "not applicable", copied into every doc in the repo, is pure maintenance cost and zero information.
- **Update in the same change.** Unlike a smoke test, documentation is part of "done": a change to a part updates its doc; a change to roles, workflows or screens updates the guides.

## Companions

- [`regression-runbooks`](../regression-runbooks/README.md) — the standing test coverage. Its profile already carries the personas, routes and auth; this plugin links to it rather than restating it.
- [`smoke-tests`](../smoke-tests/README.md) — the per-change manual delta.
