# {{Part}} — {{one-line role in the system}}

<!-- Copy to <docs-dir>/<part>.md. Delete every section this part genuinely does not have —
     never keep a heading whose body says "not applicable". State a surprising absence once,
     in prose, under Extending & gotchas. Guidance per section: reference.md §2. -->

> **Audience:** {{who this is for — e.g. developers new to the codebase who need to understand how X works}}
> **Type:** Explanation + Reference (per the Diátaxis framework).
> **Source:** `{{path/to/part}}` · **{{Datastore}}:** `{{schema / database / namespace it owns}}`

## At a glance

{{One or two paragraphs. What this part is for, where it sits in the flow, what it owns outright and what it deliberately does not own (naming who does). A reader who stops here should be able to say what this part is responsible for and name the thing next to it.}}

## What it does (functionality)

<!-- Numbered capabilities in observable terms, with the branches named. This is the section the
     guide is derived from (Phase 5) — write it for someone thinking about outcomes, not types.
     Include the surfaces where they exist: which screen, which tab, what a person can do there. -->

1. **{{Capability}}.** {{What a person or caller can make happen, what the outcomes are, and what happens on the branches — refused, held, queued, already-done.}}
2. **{{Capability}}.** {{…}}
3. **{{Capability}}.** {{…}}

## How it works (design)

### {{Mechanism / flow}}

{{The flow end to end with the handoffs named. Then the decisions: why this design and not the obvious one, and what each choice protects against. Not a narration of the call stack.}}

### {{State and lifecycle}}

{{The state machine, if there is one — drawn (reference.md §3), with edges labelled by cause. States, who or what causes each transition, and which states are terminal.}}

```mermaid
stateDiagram-v2
    [*] --> {{State}}: {{cause}}
    {{State}} --> {{State}}: {{cause}}
```

### {{Concurrency, ordering and idempotency}}

{{What two simultaneous callers do. What a replayed or out-of-order message does. Which guard closes which race, and what breaks if it is removed.}}

### {{Failure behaviour}}

{{What a dead dependency does to a request in flight: fail, retry, degrade, queue. What is left behind when it fails halfway.}}

### {{Flow across parts}}

<!-- ASCII survives every renderer and diffs cleanly; use it for event fan-out. Keep the
     whole-system narration in the index doc and point at it rather than half-repeating it. -->

```
{{Trigger}}
   │
   ▼
{{This part}}: {{what it does}}
   └─ publishes {{Event}}
          ├─▶ {{Other part}}: {{what it does with it}}
          └─▶ {{Other part}}: {{what it does with it}}
```

## Reference

### Data model (`{{schema}}`)

| Table | Row identity | Key columns | Notes |
| --- | --- | --- | --- |
| `{{Table}}` | `{{Id}}` | {{columns}} | {{constraints, unique indexes, what each nullable-until column implies}} |

### Constants

**`{{path/to/Constants}}`** — {{what this set governs, and how it is enforced (CHECK constraint, validator, type)}}:

| Constant | Value | Meaning |
| --- | --- | --- |
| `{{Name}}` | `{{value}}` | {{what it means and where it bites}} |

### {{HTTP API / entry points}}

| {{Method & path}} | {{Auth gate}} | Purpose |
| --- | --- | --- |
| `{{GET /api/…}}` | `{{Policy}}` | {{what it returns, what it validates, what it answers on failure}} |

### Events

- **Consumes:** `{{Event}}` (→ `{{Handler}}` — {{what it does with it}}).
- **Publishes:** `{{Event}}` (→ {{who reacts and how}}).

### {{Services / key types}}

| Type | Responsibility |
| --- | --- |
| `{{Type}}` | {{what it owns, plus any subtlety a reader would otherwise have to discover}} |

## Configuration

<!-- Separate start-up config from runtime-adjustable settings: the second kind is an operator
     task and lands in the operator guide. If there is none, say so in one line — it is useful. -->

| Key | Default | Required when | Effect |
| --- | --- | --- | --- |
| `{{Key}}` | `{{default}}` | {{condition}} | {{what changes}} |

## Extending & gotchas

<!-- What someone about to change this part needs to know before they start. The surprising
     absences belong here: no retry, no cache, no cascade delete, no background service. -->

- **{{Adding a new {{value}}:}}** {{the full list of what it requires — constant, migration, contract, subscribers — because the partial list is how half-migrations happen.}}
- **{{The invariant that looks removable and is not:}}** {{what enforces it and what breaks without it.}}
- **{{The boundary rule:}}** {{what you must not do to share data with a neighbouring part, and what to do instead.}}
- **{{Surprising absence:}}** {{e.g. "there is no retry — a failed item stays Failed until resubmitted".}}

## Where to look in the code

```
{{path/to/part}}/
├── {{file}}                 # {{what lives here}}
└── {{file}}                 # {{what lives here}}

{{path/to/other/part}}/
└── {{file}}                 # {{the other side of the flow — include it, or a reader concludes
                             #   the story ends at the publish call}}
```
