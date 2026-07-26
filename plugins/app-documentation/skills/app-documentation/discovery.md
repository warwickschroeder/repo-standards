# Discovery — building a part's ledger

Phase 3 of the workflow. The ledger is the intermediate artifact between the source and the doc: everything the doc will assert, extracted **once**, with a file reference beside it, so writing is transcription rather than recall.

It is working material, not a deliverable. Keep it in the scratchpad (or `.claude/app-documentation/ledgers/<part>.md` if the repo wants the audit trail). What survives into the repo is the doc.

## Sourcing order

Use the strongest available source for each fact and record which one you used. Descending order of authority:

1. **The declaration itself** — the constant, the route registration, the entity configuration, the migration, the policy definition. Always preferred; it cannot be out of date with itself.
2. **A generated contract** — OpenAPI document, generated client, schema package, `.d.ts`. Authoritative for shape, silent about intent.
3. **Tests** — excellent for *behaviour under edge conditions* and often the only written record of why a guard exists. A test name frequently hands you the sentence the doc needs.
4. **The running app** — for control labels, empty states and error text a user actually sees. The only authority for what the UI says.
5. **Existing docs, commit messages, PR bodies** — useful for *why*, never for *what*. Treat every factual claim in an existing doc as unverified until you have seen its declaration.

Never let a fact reach the doc that came only from source 5, or only from your recollection of source 1.

**Fan out for breadth, read for depth.** Parallel `Explore` agents (or the repo's code-graph tools — symbol search, call-path tracing) are how you find every route registration and every subscriber without reading the whole part. Then open the handful of files that carry the design and read them properly. Breadth from agents, judgement from you.

## The ledger

One table per row-type below. Omit a table entirely when the part genuinely has none of that thing — but record the absence in **§12**, because a surprising absence is a fact the doc should state.

### 1. Identity and boundary

| Item | Value | Source |
| --- | --- | --- |
| Part name | | |
| Source path(s) | | |
| Datastore / schema / namespace it owns | | |
| What it owns outright | | |
| What it deliberately does **not** own (and who does) | | |
| What it is allowed to depend on | | |

The boundary line is the highest-value row in the ledger: nearly every "how does this work" question a newcomer asks is really "whose job is this?".

### 2. Capabilities — what it does

Numbered, in observable terms: what can a person or a caller make happen, and what are the branches. One line each; the branches are the point.

| # | Capability | Branches / outcomes | Who can trigger it | Source |
| --- | --- | --- | --- | --- |

This table becomes the doc's *What it does*, and Phase 5 maps every row of it to a guide section or marks it internal. Write it in the language of outcomes ("a large batch is held until a reviewer decides"), not implementation ("`UploadEndpoint` sets `PendingApproval`").

### 3. Entry points

Every way the outside world gets in.

| Kind | Identifier | Auth / gate | Inputs | Success | Failure modes | Source |
| --- | --- | --- | --- | --- | --- | --- |

Kinds: HTTP route, RPC/GraphQL operation, message or event subscription, scheduled job, CLI command, UI screen, webhook, public exported function (for a library). Include the **auth gate per entry point** — it is what the guide's role badges are derived from, and it is the fact most often wrong in an old doc.

### 4. Data model

| Table / collection / store | Identity | Key columns | Constraints, indexes | Notes |
| --- | --- | --- | --- | --- |

Capture constraints and unique indexes explicitly — they encode rules that live nowhere else, and they are what a reader needs before they try to write to the thing. Note which columns are nullable-until-some-event; that is usually a state machine in disguise.

### 5. Constrained value sets and limits

Every status, role, mode, decision verb, threshold, cap, page size, retention window, interval.

| Name | Value(s) | Where declared | Where enforced | What it means |
| --- | --- | --- | --- | --- |

"Where enforced" is separate from "where declared" on purpose: a limit declared in a shared constants file but enforced in only two of three endpoints is a finding, not a doc detail.

### 6. Messages in and out

| Direction | Contract | Payload fields that matter | Handler / publisher | Why it exists |
| --- | --- | --- | --- | --- |

For event-driven parts this is the whole architecture. Note **what a consumer does with each field** — a payload field nobody reads is either dead or a projection someone forgot to build.

### 7. External dependencies and seams

| Dependency | Reached via | Switchable? | Fake / offline path | Failure behaviour |
| --- | --- | --- | --- | --- |

Failure behaviour is the column people actually need: does a dead third party fail the request, retry, degrade, or queue?

### 8. Configuration

| Key | Type | Default | Required when | Effect | Read by |
| --- | --- | --- | --- | --- | --- |

Distinguish start-up config from runtime-adjustable settings — the second kind belongs in the guide as an operator task.

### 9. Background work

| Worker | What wakes it | Cadence or trigger | What it does | What happens if it is down |
| --- | --- | --- | --- | --- |

### 10. State and lifecycle

The state machine, if there is one: states, transitions, who or what causes each, and the terminal states. Draw it — this is the highest-yield diagram in the whole doc, and it is usually also the one the guide needs (see `reference.md` §3).

### 11. User-facing surfaces

The bridge to Phase 5. For every capability with a UI:

| Capability | Screen / route | Exact control labels | Visible states and messages | Role required |
| --- | --- | --- | --- | --- |

Labels here are **quoted verbatim from the component source or the running app**, including capitalisation. This is the table the guide is written from; anything not in it is a control you have not verified.

### 12. Invariants, guards and surprising absences

Free-form, and the most valuable section for a technical reader. Each entry: what is true, what enforces it, and what breaks if someone removes it.

Look for: idempotency guards, atomic guarded updates and what race they close, ordering assumptions, "this is deliberately not cached", "this deliberately has no retry", segregation-of-duties checks, soft-delete vs. hard-delete, anything the tests defend that the code does not explain.

## When the ledger says the partition was wrong

Two signals, both worth acting on before writing a line of prose:

- **§1 cannot name a boundary** — the part shares its tables with another part and neither owns them. Merge them, or find the real seam.
- **§4 holds two unrelated data models and §2 splits cleanly along them.** Split the part, update the index, and write two docs.

Discovering this in Phase 3 costs an hour. Discovering it after both docs are written costs a rewrite of everything that links to them.
