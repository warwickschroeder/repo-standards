> **Modular Monolith Blueprint — §8.** [Index](README.md) · [Rules Digest](01-rules-digest.md)

## 8. Persistence & Migrations

### 8.1 The persistence backend is the implementor's choice — **ASK FIRST**

> **STOP.** This blueprint ships with **no default database engine**. Before
> Phase 1 (the server skeleton stands up data contexts and writes the first
> migrations), the agent **MUST ask the user which persistence backend to use**
> and record the answer in `docs/ROADMAP.md`. **Never assume one** — the choice
> determines the driver/provider package (reference stack: the EF Core provider
> and its `<UseProvider>` calls), the orchestration provisioning integration,
> and which engine-specific features are available.

The architecture fixes the **persistence seam**, not the **engine**. Whatever the
user picks must satisfy these contracts; everything else in the document holds
unchanged:

1. **Relational, accessed through the chosen data-access layer** (§3; reference
   stack: EF Core), with **one engine + one provider for the whole app** —
   never mix engines.
2. **One physical database**; every module's data context uses the **same
   connection string** (the orchestrator injects it — reference stack: Aspire's
   `WithReference(db)` as `<app>`).
3. **Logical isolation per module** — a real schema where the provider supports
   it (`modelBuilder.HasDefaultSchema("<schema>")`, R7), or the provider's
   nearest equivalent (see the options table).
4. **Per-module migrations**, each module's migrations-history table in
   its own schema/namespace (R9).
5. **Migrations applied at startup; no schema auto-creation shortcut** (R10;
   reference stack: `Database.Migrate()`, never `EnsureCreated`).

Options — pick one **with the user**; the rest of the app is unchanged. (The
provider/integration columns name the reference stack's packages — a non-.NET
stack uses its own driver + migrations tool for the same engine.)

| Option | EF Core provider | Aspire integration | Module isolation | Notes |
|---|---|---|---|---|
| **PostgreSQL** | `Npgsql.EntityFrameworkCore.PostgreSQL` (`UseNpgsql`) | `AddPostgres` + `WithImageTag("17.6")` (an example exact tag, see below) + `WithDataVolume` + `WithPgAdmin` | real schema per module (`HasDefaultSchema`) | Trigram search (`pg_trgm`), `ILIKE`, Row-Level Security available. **The worked examples and code samples in this document are written for Postgres**: treat `UseNpgsql`, `postgres:17.6` and `pg_trgm` as illustrative and substitute your provider's equivalents. |
| **SQL Server** | `Microsoft.EntityFrameworkCore.SqlServer` (`UseSqlServer`) | `AddSqlServer` | real schema per module (`HasDefaultSchema`) | Azure SQL / on-prem SQL Server. Map Postgres-specific features (`ILIKE` → `LIKE` + case-insensitive collation, RLS → SQL Server Row-Level Security, `pg_trgm` → full-text search / `LIKE`). |
| **Other — the user names it** | the matching EF Core provider (e.g. Pomelo MySQL, SQLite) | the matching Aspire integration if one exists | a real schema, or the provider's nearest equivalent | **Confirm how module isolation maps before building.** E.g. MySQL/MariaDB treat a "schema" as a database; SQLite (single-file, single-user) has no schemas, so isolate by table-name prefix and weigh it only for small/single-user deployments. Agree the mapping with the user and note it in `docs/ROADMAP.md`. |

> **Choose before Phase 1** and record it in `docs/ROADMAP.md`, alongside the
> auth decision (§4.6). If a later need exposes a gap in the chosen engine (e.g.
> a feature only Postgres offers), surface it to the user — don't silently switch
> engines or add a second one.

**Pin the engine's container image exactly, and treat changing it as a data migration.** The data volume outlives the image that wrote it:

- Pin an exact tag with a named data volume (reference stack example: `postgres:17.6`), never a floating one such as `17-alpine`, `latest` or the orchestrator's default. A floating tag moves when the orchestrator is upgraded, and a new engine major version refuses to start on the old one's data directory.
- Use the same image in dev, in the integration-test containers (R32) and in every deployment, so the tests prove the engine production runs.
- Default to the engine's standard glibc-based image rather than a musl (Alpine) variant. The two sort text differently, so swapping one for the other against an existing volume can corrupt indexes. To change image family or major version, dump, recreate the volume and restore.
- Don't bind the engine's well-known host port in dev (5432 for Postgres). Another project's database already holding it stops the whole stack from starting, so give each app its own port.

### 8.2 Migrations

Per-module migrations (R9), each owning its own history table (reference-stack
command shown; use the chosen migrations tool's equivalent):

```bash
dotnet ef migrations add Initial \
  --project src/modules/<App>.Modules.<Feature> \
  --startup-project src/<App>.Host \
  --context <Feature>DbContext
```

- **`--startup-project` is required.** A module is a class library with no host to build its context from, so the command fails without it.
- **Line endings are fixed in the repo, not per machine.** A multi-line string literal that reaches the model (raw SQL in a filter or a view, say) takes the checkout's line endings, so a CRLF checkout writes a different snapshot from an LF one. The `.gitattributes` in §2 stores and checks out text as LF everywhere.
- Migrations run at Host startup for every module data context (R10).
- Rows carry the owner id from the §3 ownership boundary (equal to the user id in a per-user app) and **every query filters on it**, never returning the whole table (§6.3).
- **Phase-2 hardening (not v1):** enable provider-level row security where the engine supports it (e.g. Postgres Row-Level Security) on every owner-keyed table, keyed on the owner from the §3 ownership boundary rather than on the person acting. Middleware sets the owner id for the connection (`app.user_id` when the owner is the user, `app.tenant_id` when it is a tenant), so the DB refuses a query that forgets `WHERE <OwnerId> = @owner`.
- **Retiring a module:** its teardown migration ships in the module's own migrations one release before its code is deleted, so it runs through the normal startup path (R9, R10) while the module still exists. It drops every table the module owns but leaves the migrations-history table, because the tool records the migration there after running it; a schema holding only that table holds no data. The full procedure is in §6.9.

### 8.3 Dev data seeding

Migrations create **schema**; how a fresh dev environment gets **usable data**
is a deliberate, explicit mechanism — never ad-hoc inserts nobody can
reproduce:

- **A dev-only, idempotent seeder** — an explicit entry point (a `seed` CLI
  command beside the admin CLI in §5, or an orchestrator-triggered dev step),
  safe to re-run, and **impossible to run in production** (environment-guarded,
  fail-fast). It seeds through the modules' normal write paths where practical,
  so constraints, events, and read models behave as in real use.
- **Module-scoped, like everything else.** Each module seeds only its **own
  schema** (R8 applies to seeding too); cross-module effects arrive the normal
  way — published events building the consumers' read models.
- **Baseline reference data a module owns** (R28(b)) may ship in a migration
  when the schema is genuinely unusable without it — sparingly, and never for
  R28(a) behavioural values (constants + CHECK, no rows) or R28(c)
  provider-owned lists (the `Fake` seam supplies those offline, §6.6).
- **Tests never depend on the dev seed.** Integration tests get a clean
  template-cloned database and create their own rows; the e2e harness seeds
  per-spec through the API/fixtures (§12.5). The dev seed exists for humans
  exploring the running app, not as shared test state.
