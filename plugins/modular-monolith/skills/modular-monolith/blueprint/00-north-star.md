> **Modular Monolith Blueprint — §0.** [Index](README.md) · [Rules Digest](01-rules-digest.md)

## 0. North Star

You are building a **modular monolith**: one host process, many isolated
feature modules, one shared relational database, and one web client.
Modules never call each other directly — they communicate **only** through
published events on an in-process bus, and each consumer keeps its **own local
read model**. This buys you the development simplicity of a monolith with the
isolation discipline of microservices, and it lets a fleet of agents work on
separate modules without stepping on each other. None of this depends on a
particular language or framework — the pillars below hold in any stack.

The four pillars, each enforced ruthlessly:

1. **Isolation** — modules reference only `Core`; cross-module data flows as
   events + local read models, never direct calls or cross-schema queries.
2. **One process, one database, schema-per-module** — physical co-location,
   logical isolation.
3. **Minimal surface** — the chosen framework's lightweight endpoint style,
   plain immutable DTOs, no heavyweight mediator / message-bus / object-mapping
   frameworks.
4. **Verifiable correctness** — every change ships tests; the build/type-check
   is a gate; integration tests prove behaviour across the event seams.

> **Every stack decision is deliberately left open and MUST be confirmed with
> the user before the code that depends on it is written — never assume a
> default.** §3 lists the full decision set and when each must be asked; the
> two with dedicated deep-dives are the **persistence backend** (ask **before
> Phase 1** — §8) and the **authentication mechanism** (ask **before Phase 3**
> — §4.6). Record every decision in `docs/ROADMAP.md`.
