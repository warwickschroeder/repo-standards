> **Modular Monolith Blueprint — §15.** [Index](README.md) · [Rules Digest](01-rules-digest.md)

## 15. Definition of Done (per change)

> In an existing app being aligned (§16), "applicable" below means: within the
> **adopted** areas recorded in `docs/ROADMAP.md` — a declined area's rules do
> not bind, and its deviations are not findings.

- [ ] Obeys every applicable rule in the [Rules Digest](01-rules-digest.md).
- [ ] No module→module reference; no cross-schema access; events + local read
      models for any cross-module data.
- [ ] DTOs are plain immutable records; endpoints use the framework's
      lightweight routing under `/api/<feature>/...`; every query is scoped to
      its access boundary (per-user, or per-workspace/tenant/role where the
      domain requires it — §6.3), never the whole table.
- [ ] Coverage extended across the layers the change touches (R23, §12): unit
      for logic, integration for data-layer/event seams, **e2e for any
      user-facing journey** — via the owning module's regression runbook, each mutating case
      verifying persistence through a lane (§12.9) — failure/edge/isolation paths
      included, not just the happy path.
- [ ] Data-layer changes ship a round-trip integration test asserting every
      affected field by name (R24), plus access-boundary isolation where relevant.
- [ ] The repo's canonical gates are green — server lint/analysis +
      build/type-check + tests; client lint + build + tests; the **duplication
      and dead-code gates** where code was added or removed, and the
      **dependency vulnerability audit** where dependencies changed
      (R33/§12.10); the
      **targeted per-module runs for every modified module** — its integration
      project + its e2e harness smoke/targeted tier (R25/R34) — with the full
      harness left to the user's schedule (§12.6); output **read**, not
      assumed (R25). The CI pipeline steps for the touched layers are green
      (§12.7).
- [ ] UI faithfully realises the committed Claude Design handoff bundle
      (component spec, interaction states, breakpoints, screenshots); styles
      derive from the single token home (no duplicated hexes/sizes); the client
      stack chosen with the user (§3) was kept; unspecified states were asked
      about, not invented (R26).
- [ ] Every §3 stack decision the change depended on — including the
      persistence backend (§8) and auth mechanism (§4.6) — was **confirmed
      with the user**, not assumed, and recorded in `docs/ROADMAP.md`.
- [ ] Significant change → impact analysis captured in the change's
      `docs/specs/<date>-<topic>.md` (§13.1); the affected
      `docs/modules/<module>.md` and `docs/ROADMAP.md` updated.
- [ ] **Only where the optional practices were adopted** (§17, recorded in
      `docs/ROADMAP.md`): guides updated in the same change if roles, workflows
      or screens moved (§17.1). A smoke test is **not** on this list in either
      case — it is written only when asked (§17.2), never as part of "done".
- [ ] No push / PR unless explicitly asked.
